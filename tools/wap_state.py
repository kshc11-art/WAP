#!/usr/bin/env python3
"""scripts/ 를 읽어 state/ 아래 색인·충돌표·섹션지도·AI 지시서를 생성한다.

    tools/wap_state.py [--from <디렉터리>]

state/ 는 전부 생성물이다. 사람이 손대지 않고 리뷰하지도 않는다.
가장 중요한 산출물은 state/brief/<slug>.md — 외부 AI 채팅에 파일과 함께 붙여넣는 지시서다.
AI 가 추측해야 할 것을 줄이는 것이 왕복 횟수를 줄이는 유일한 수단이다.
"""
import os
import re
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE = os.path.join(ROOT, "state")
REG = os.path.join(ROOT, "contracts", "scripts.yaml")

HDR_END = "// ==/UserScript=="


def load_registry():
    entries, cur = [], None
    for line in open(REG, encoding="utf-8"):
        if line.lstrip().startswith("#"):
            continue
        m = re.match(r"^  - slug:\s*(\S+)", line)
        if m:
            cur = {"slug": m.group(1)}
            entries.append(cur)
            continue
        if cur is None:
            continue
        for key, pat in (("displayName", r'^    displayName:\s*"(.*)"\s*$'),
                         ("system", r"^    system:\s*(\S+)"),
                         ("status", r"^    status:\s*(\S+)"),
                         ("domPrefix", r'^      domPrefix:\s*"(.*)"\s*$'),
                         ("storagePrefix", r'^      storagePrefix:\s*"(.*)"\s*$'),
                         ("note", r'^    note:\s*"(.*)"\s*$')):
            m = re.match(pat, line)
            if m:
                cur[key] = m.group(1)
    return entries


# ── 파일에서 실측하는 것들 ────────────────────────────────────
KEY_RE = re.compile(
    r"(?:(ctrl|alt|shift|meta)Key\s*&&\s*)|"
    r"(?:\.key\s*===?\s*['\"]([^'\"]{1,12})['\"])|"
    r"(?:\.code\s*===?\s*['\"]([A-Za-z0-9]+)['\"])"
)


def scan(path):
    text = open(path, encoding="utf-8", errors="replace").read()
    lines = text.split("\n")
    end = next((i for i, l in enumerate(lines) if l.strip() == HDR_END), 0)
    header, body = lines[:end + 1], "\n".join(lines[end + 1:])

    def meta(tag):
        return [m.group(1).strip() for m in
                (re.match(r"^//\s*@" + tag + r"\s+(.*?)\s*$", l) for l in header) if m]

    # 프리앰블이 스스로 만드는 전역(__WAP, __wap_<slug>)은 제외한다 — 전부 갖고 있으니 정보가 없다.
    globals_ = sorted(g for g in set(
        re.findall(r"(?:unsafe)?[Ww]indow\s*\[\s*['\"]([A-Za-z_$][\w$]*)['\"]\s*\]", body) +
        re.findall(r"(?:unsafe)?[Ww]indow\.(__[A-Za-z_$][\w$]*)", body)
    ) if g != "__WAP" and not g.startswith("__wap_"))
    storage = sorted(set(
        re.findall(r"(?:localStorage|sessionStorage)\.(?:get|set|remove)Item\(\s*['\"]([^'\"]{2,60})['\"]", body) +
        re.findall(r"GM[_.](?:get|set|delete)Value\w*\(\s*['\"]([^'\"]{2,60})['\"]", body)
    ))
    dataattr = sorted(set(re.findall(r"data-([a-z][a-z0-9-]{1,30})\b", body)))
    zindex = sorted({int(z) for z in re.findall(r"z-?[Ii]ndex['\"]?\s*[:=]\s*['\"]?(\d{3,7})", body)},
                    reverse=True)[:6]
    endpoints = sorted(set(re.findall(r"['\"](/[a-zA-Z0-9_/\-]*\.(?:json|do))['\"]", body)))
    requires = meta("require")

    combos = set()
    for m in re.finditer(r"(?:e|ev|evt|event)\.(ctrl|alt|shift|meta)Key(?:[^;\n]{0,120}?)"
                         r"\.(?:key|code)\s*===?\s*['\"]([^'\"]{1,12})['\"]", body):
        combos.add(f"{m.group(1).capitalize()}+{m.group(2)}")
    for m in re.finditer(r"\.(?:key|code)\s*===?\s*['\"]([^'\"]{1,12})['\"](?:[^;\n]{0,120}?)"
                         r"(?:e|ev|evt|event)\.(ctrl|alt|shift|meta)Key", body):
        combos.add(f"{m.group(2).capitalize()}+{m.group(1)}")

    sections = []
    for i, l in enumerate(lines):
        m = re.match(r"^\s*//\s*[=\-─━]{3,}\s*(.{2,70}?)\s*[=\-─━]{0,}\s*$", l)
        if m and not m.group(1).startswith("@"):
            sections.append((i + 1, m.group(1)))
        m = re.match(r"^\s*/\*+\s*\[?([A-Z][A-Z0-9 _\-]{3,50})\]?", l)
        if m:
            sections.append((i + 1, m.group(1).strip()))

    funcs = []
    for m in re.finditer(r"^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)", text, re.M):
        funcs.append((text.count("\n", 0, m.start()) + 1, m.group(1)))

    return {
        "lines": len(lines), "bytes": len(text.encode("utf-8")),
        "name": (meta("name") or [""])[0], "namespace": (meta("namespace") or [""])[0],
        "version": (meta("version") or [""])[0], "runat": (meta("run-at") or ["document-end"])[0],
        "matches": meta("match"), "grants": meta("grant"), "requires": requires,
        "globals": globals_, "storage": storage, "dataattr": dataattr, "zindex": zindex,
        "endpoints": endpoints, "shortcuts": sorted(combos),
        "sections": sections[:60], "funcs": funcs,
        "haspreamble": "/* WAP-ID START" in text,
    }


# ── @match 를 실제로 평가한다 ─────────────────────────────────
# 문자열로만 묶으면 `*.kriss.re.kr/*` 와 `https://krisstar.kriss.re.kr/*` 가 서로 다른
# 화면인 것처럼 보인다. 실제로는 같은 페이지에서 둘 다 뜬다.
# Chrome match pattern 규칙을 그대로 구현해서 대표 URL 에 대고 평가한다.

def parse_match(p):
    m = re.match(r"^(\*|https?)://([^/]*)(/.*)$", p.strip())
    if not m:
        return None
    scheme, host, path = m.groups()
    return scheme, host, path


def host_ok(pat, host):
    if pat == "*":
        return True
    if pat.startswith("*."):
        base = pat[2:]
        return host == base or host.endswith("." + base)
    return host == pat


def glob_re(g):
    return re.compile("^" + "".join(".*" if c == "*" else re.escape(c) for c in g) + "$")


def match_url(p, url):
    parsed = parse_match(p)
    if not parsed:
        return False
    scheme, hostpat, pathpat = parsed
    u = re.match(r"^(https?)://([^/]+)(/[^#]*)$", url)
    if not u:
        return False
    us, uh, up = u.groups()
    if scheme != "*" and scheme != us:
        return False
    if not host_ok(hostpat, uh):
        return False
    return bool(glob_re(pathpat).match(up))


def sample_urls(all_matches, hosts):
    """패턴들에서 대표 URL 을 만든다. 별표는 그럴듯한 구체값으로 바꾼다."""
    urls = set()
    fallback = hosts[0] if hosts else "example.com"
    for p in all_matches:
        parsed = parse_match(p)
        if not parsed:
            continue
        _, hostpat, pathpat = parsed
        cands = [h for h in hosts if host_ok(hostpat, h)] or [
            fallback if hostpat.startswith("*") else hostpat]
        path = pathpat.replace("*", "") or "/"
        if not path.startswith("/"):
            path = "/" + path
        for h in cands:
            urls.add(f"https://{h}{path}")
    return sorted(urls)


def concrete_hosts(all_matches):
    hs = set()
    for p in all_matches:
        parsed = parse_match(p)
        if parsed and "*" not in parsed[1]:
            hs.add(parsed[1])
    return sorted(hs)


# ── 생성 ──────────────────────────────────────────────────────
def w(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w", encoding="utf-8").write(text)


def main(argv):
    src = SCRIPTS_DIR = os.path.join(ROOT, "scripts")
    if "--from" in argv:
        src = argv[argv.index("--from") + 1]

    reg = load_registry()
    by_slug = {e["slug"]: e for e in reg}

    files = {}
    for f in sorted(os.listdir(src)) if os.path.isdir(src) else []:
        if not f.endswith(".user.js"):
            continue
        slug = f[: -len(".user.js")]
        files[slug] = scan(os.path.join(src, f))

    if not files:
        print("scripts/ 에 스크립트가 없습니다. 반입 후 다시 실행하세요.")
        print("(생성 대상 0개는 성공이 아니므로 state/ 를 비우지 않고 그대로 둡니다.)")
        return 0

    # ── INDEX ────────────────────────────────────────────────
    rows = ["| slug | 표시명 | 버전 | 줄수 | 프리앰블 |", "|---|---|---|---|---|"]
    for slug in sorted(files, key=lambda s: -files[s]["lines"]):
        d, e = files[slug], by_slug.get(slug, {})
        rows.append(f"| `{slug}` | {e.get('displayName', d['name'])} | {d['version']} | "
                    f"{d['lines']:,} | {'✅' if d['haspreamble'] else '—'} |")
    miss = [e["slug"] for e in reg if e["slug"] not in files]
    w(os.path.join(STATE, "INDEX.md"),
      "# 스크립트 색인\n\n**자동 생성물이다. 손으로 고치지 마세요.** `tools/wap_state.py` 가 만든다.\n\n"
      + "\n".join(rows)
      + (f"\n\n## 아직 반입되지 않음 ({len(miss)}개)\n\n" + "\n".join(f"- `{s}`" for s in miss) if miss else "")
      + "\n")

    # ── pages ────────────────────────────────────────────────
    all_matches = sorted({m for d in files.values() for m in d["matches"]})
    hosts = concrete_hosts(all_matches)
    urls = sample_urls(all_matches, hosts)
    page = {u: sorted(s for s, d in files.items()
                      if any(match_url(m, u) for m in d["matches"])) for u in urls}
    page = {u: v for u, v in page.items() if v}

    # 각 스크립트가 함께 뜨는 상대 (URL 을 거쳐 계산한 실제 공존 관계)
    coruns = defaultdict(set)
    for u, ss in page.items():
        for a in ss:
            coruns[a] |= set(ss) - {a}

    out = ["# 화면별 동시 실행 스크립트", "",
           "**자동 생성물이다.** `@match` 패턴을 대표 URL 에 실제로 평가해서 만든다.",
           "같은 URL 에 걸리는 스크립트끼리는 전역·단축키·DOM 이름이 겹치면 안 된다.", ""]
    ordered = sorted(page, key=lambda u: (-len(page[u]), u))
    TOP = 12
    for u in ordered[:TOP]:
        out.append(f"- `{u}` — **{len(page[u])}개**: " + ", ".join(f"`{s}`" for s in page[u]))
    if len(ordered) > TOP:
        out.append(f"- … 동시 실행 수가 더 적은 URL {len(ordered) - TOP}개는 생략했다 "
                   f"(전체 {len(ordered)}개 중 상위 {TOP}개만 표시).")
    out += ["", "## 스크립트별 공존 상대", "", "| 스크립트 | 함께 뜨는 수 | 상대 |", "|---|---|---|"]
    for s in sorted(coruns, key=lambda s: -len(coruns[s])):
        out.append(f"| `{s}` | {len(coruns[s])} | "
                   + (", ".join(f"`{x}`" for x in sorted(coruns[s])) or "—") + " |")
    w(os.path.join(STATE, "pages.md"), "\n".join(out) + "\n")

    # ── collisions ───────────────────────────────────────────
    def collide(field, label):
        owner = defaultdict(set)
        for slug, d in files.items():
            for v in d[field]:
                owner[v].add(slug)
        dup = {k: v for k, v in owner.items() if len(v) > 1}
        if not dup:
            return [f"### {label}", "", "겹치는 것 없음.", ""]
        lines = [f"### {label} — {len(dup)}건", "", "| 값 | 쓰는 스크립트 |", "|---|---|"]
        for k in sorted(dup, key=lambda k: (-len(dup[k]), str(k)))[:40]:
            lines.append(f"| `{k}` | " + ", ".join(f"`{s}`" for s in sorted(dup[k])) + " |")
        return lines + [""]

    col = ["# 충돌 후보", "",
           "**자동 생성물이다.** 여기 올라온 것이 전부 버그는 아니지만, 같은 화면에 함께 뜨는",
           "스크립트끼리 겹치면 조용한 실패가 된다.", ""]
    for f, lbl in (("globals", "전역 이름"), ("storage", "저장소 키"),
                   ("dataattr", "data-* 속성"), ("shortcuts", "단축키")):
        col += collide(f, lbl)
    nopre = [s for s, d in files.items() if not d["haspreamble"]]
    if nopre:
        col += ["### 프리앰블 없음 — 전역 킬스위치 대상 밖", "",
                "이 스크립트들은 `localStorage['wap.kill']` 로 멈추지 않는다.", ""] + \
               [f"- `{s}`" for s in sorted(nopre)] + [""]
    cdn = [(s, r) for s, d in files.items() for r in d["requires"] if r.startswith("http")]
    if cdn:
        col += ["### 외부 CDN @require — 내부망에서 실패할 수 있음", ""] + \
               [f"- `{s}` → {r}" for s, r in sorted(cdn)] + [""]
    w(os.path.join(STATE, "collisions.md"), "\n".join(col) + "\n")

    # ── outline + brief ──────────────────────────────────────
    for slug, d in files.items():
        e = by_slug.get(slug, {})
        big = sorted(d["funcs"], key=lambda x: x[0])
        o = [f"# {slug} 섹션 지도", "",
             f"**자동 생성물이다.** 전체 {d['lines']:,}줄을 다 읽지 말고 여기서 필요한 구간만 찾아 읽으세요.", "",
             f"- 버전 `{d['version']}` · `@run-at {d['runat']}` · {d['bytes']:,} bytes",
             f"- `@match` {len(d['matches'])}개 · `@grant` {len(d['grants'])}개", ""]
        if d["sections"]:
            o += ["## 섹션", "", "| 줄 | 이름 |", "|---|---|"] + \
                 [f"| {ln} | {nm} |" for ln, nm in d["sections"]] + [""]
        if big:
            o += ["## 함수 (정의 순)", "", "| 줄 | 이름 |", "|---|---|"] + \
                 [f"| {ln} | `{nm}` |" for ln, nm in big[:80]] + [""]
        w(os.path.join(STATE, "outline", f"{slug}.md"), "\n".join(o) + "\n")

        co = sorted(coruns.get(slug, set()))
        b = [f"# {e.get('displayName', d['name'])}", "",
             f"슬러그 `{slug}` · 버전 `{d['version']}` · {d['lines']:,}줄",
             "",
             "> 이 문서는 자동 생성된 것이다. 스크립트 파일과 **함께** AI 채팅에 붙여넣으세요.",
             "",
             "## 절대 바꾸지 말 것", "",
             f"- `@namespace: {d['namespace']}` — 바꾸면 Tampermonkey 가 별개 스크립트로 보고 저장 데이터가 갈립니다",
             "- 파일 맨 위 `/* WAP-ID START … END */` 블록 — 킬스위치입니다",
             "- `/* WAP-INLINE … */` 마커 쌍 — 공유 코드 경계입니다",
             "", "## 이 스크립트가 소유한 자원", "",
             f"- DOM 접두어: `{e.get('domPrefix', 'wap-' + slug + '-')}`",
             f"- 저장소 키 접두어: `{e.get('storagePrefix', 'wap:' + slug + ':')}`",
             f"- 단축키: {', '.join('`' + k + '`' for k in d['shortcuts']) if d['shortcuts'] else '(없음)'}",
             f"- z-index: {', '.join(str(z) for z in d['zindex']) if d['zindex'] else '(없음)'}",
             ""]
        if co:
            # 전역이나 단축키를 실제로 점유한 것만 보여준다. 나머지는 이름만 나열.
            loud = [s for s in co if files[s]["globals"] or files[s]["shortcuts"]]
            quiet = [s for s in co if s not in loud]
            b += ["## 같은 화면에 함께 뜨는 스크립트 — 이 이름들을 쓰지 마세요", "",
                  f"이 스크립트는 최대 **{len(co)}개**와 같은 화면에 뜬다.", "",
                  "| 스크립트 | 이미 쓰는 전역 | 단축키 |", "|---|---|---|"]
            for s in loud[:12]:
                g = ", ".join(f"`{x}`" for x in files[s]["globals"][:5]) or "—"
                k = ", ".join(f"`{x}`" for x in files[s]["shortcuts"][:5]) or "—"
                b.append(f"| `{s}` | {g} | {k} |")
            if len(loud) > 12:
                b.append(f"| … | 전역·단축키를 쓰는 것 {len(loud) - 12}개 더 생략 | |")
            b.append("")
            if quiet:
                b += ["전역·단축키를 쓰지 않는 나머지: "
                      + ", ".join(f"`{s}`" for s in quiet), ""]
            b += ["> 단축키 목록은 코드 패턴으로 추출한 **근사값**이다. 정확한 것은 `contracts/keymap.yaml` "
                  "이 채워진 뒤에 확정된다.", ""]
        if d["endpoints"]:
            b += ["## 이 파일이 부르는 경로", "",
                  "> `contracts/endpoints.yaml` 에 등록되지 않은 것은 아직 **추정**입니다. 사실로 단정하지 마세요.", ""] + \
                 [f"- `{x}`" for x in d["endpoints"][:40]] + [""]
        if e.get("note"):
            b += ["## 주의", "", e["note"], ""]
        b += ["## 응답 규칙", "",
              "- **이 파일 하나만** 수정합니다. 다른 파일을 만들지 않습니다.",
              "- 외부 CDN `@require` 를 추가하지 않습니다. (내부망에서 실패합니다)",
              "- 새 전역 변수·새 단축키·새 z-index 를 도입하지 않습니다.",
              "- 브라우저에서 xlsx 를 굽지 않습니다. 내보내기는 JSON/CSV 까지입니다.",
              "- 확인 다이얼로그를 자동으로 누르지 않습니다.",
              "- 응답 상태는 HTTP 200 만 보지 말고 응답 본문의 `errorCode` 를 확인합니다.",
              "- `@version` 을 올립니다.",
              "- **응답은 파일 전문으로** 줍니다. 생략하거나 \"이하 동일\" 로 쓰지 않습니다.",
              "", f"## 섹션 지도", "", f"`state/outline/{slug}.md` 참조.", ""]
        w(os.path.join(STATE, "brief", f"{slug}.md"), "\n".join(b) + "\n")

    print(f"생성 완료: 스크립트 {len(files)}개")
    print(f"  state/INDEX.md · pages.md · collisions.md")
    print(f"  state/outline/*.md {len(files)}개 · state/brief/*.md {len(files)}개")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
