#!/usr/bin/env python3
"""inbox/ 에 들어온 userscript 를 정규화해서 scripts/<slug>.user.js 로 옮긴다.

    tools/wap_import.py            반입 실행
    tools/wap_import.py --check    무엇을 할지만 보여주고 파일은 건드리지 않음

봇이 하는 일과 하지 않는 일:
  한다   — slug 판정 · 헤더 정규화(@namespace/@name/@version) · 프리앰블 주입
  안 한다 — 본문 수정 · 병합 · 충돌 시 덮어쓰기

본문 바이트 불변을 해시로 검증하고, 어긋나면 아무것도 쓰지 않고 실패한다.
"""
import hashlib
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INBOX = os.path.join(ROOT, "inbox")
SCRIPTS = os.path.join(ROOT, "scripts")
REG = os.path.join(ROOT, "contracts", "scripts.yaml")
PREAMBLE = os.path.join(ROOT, "scripts", "_shared", "preamble.js")

HDR_START = "// ==UserScript=="
HDR_END = "// ==/UserScript=="
WAP_START = "/* WAP-ID START"
WAP_END = "/* WAP-ID END */"
SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")


# ── 레지스트리 ────────────────────────────────────────────────
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
                         ("current", r'^      current:\s*"(.*)"\s*$'),
                         ("target", r'^      target:\s*"(.*)"\s*$'),
                         ("version", r'^    version:\s*"(.*)"\s*$'),
                         ("status", r"^    status:\s*(\S+)")):
            m = re.match(pat, line)
            if m:
                cur[key] = m.group(1)
    return entries


def update_registry(updates):
    """{slug: {status, version}} 를 레지스트리에 반영. 형식은 건드리지 않는다."""
    out, cur = [], None
    for line in open(REG, encoding="utf-8"):
        m = re.match(r"^  - slug:\s*(\S+)", line)
        if m:
            cur = m.group(1)
        if cur in updates:
            u = updates[cur]
            if re.match(r"^    status:\s*\S+", line):
                line = f"    status: {u['status']}\n"
            elif re.match(r'^    version:\s*".*"\s*$', line):
                line = f'    version: "{u["version"]}"\n'
        out.append(line)
    open(REG, "w", encoding="utf-8").writelines(out)


# ── 헤더 ──────────────────────────────────────────────────────
def split_header(text, where):
    """(헤더줄목록, 본문줄목록). 경계가 모호하면 추측하지 않고 실패시킨다.

    줄 목록으로 다루는 이유: 본문 첫 줄이 빈 줄인 것이 정상이고(헤더와 코드 사이),
    문자열로 이어붙였다 잘랐다 하면 그 빈 줄이 소리 없이 사라진다.
    """
    lines = text.split("\n")
    starts = [i for i, l in enumerate(lines) if l.strip() == HDR_START]
    ends = [i for i, l in enumerate(lines) if l.strip() == HDR_END]
    if len(starts) != 1 or len(ends) != 1 or ends[0] < starts[0]:
        raise ValueError(
            f"{where}: UserScript 헤더 블록을 하나로 특정할 수 없습니다 "
            f"(시작 {len(starts)}개, 종료 {len(ends)}개). 파일이 잘렸을 수 있습니다."
        )
    return lines[starts[0]:ends[0] + 1], lines[ends[0] + 1:]


def meta(header, tag):
    vals = []
    for l in header:
        m = re.match(r"^//\s*@" + tag + r"\s+(.*?)\s*$", l)
        if m:
            vals.append(m.group(1))
    return vals


def set_meta(header, tag, value):
    """@tag 를 value 로 교체. 없으면 @name 뒤에 넣는다. 정렬은 건드리지 않는다."""
    out, done = [], False
    for l in header:
        if re.match(r"^//\s*@" + tag + r"\s+", l) and not done:
            pad = re.match(r"^//\s*@\S+(\s*)", l).group(1) or " "
            out.append(f"// @{tag}{pad}{value}")
            done = True
        elif re.match(r"^//\s*@" + tag + r"\s+", l):
            continue  # 중복 제거
        else:
            out.append(l)
    if not done:
        idx = next((i for i, l in enumerate(out) if re.match(r"^//\s*@name\s", l)), 0)
        out.insert(idx + 1, f"// @{tag}         {value}")
    return out


def norm_version(v, prev):
    """3자리 SemVer 로 맞추고, 직전 버전보다 크지 않으면 patch 를 올린다."""
    v = (v or "0.0.0").strip()
    parts = [p for p in re.split(r"[.\-+]", v) if p.isdigit()][:3]
    while len(parts) < 3:
        parts.append("0")
    cur = tuple(int(p) for p in parts)
    if prev and SEMVER.match(prev):
        p = tuple(int(x) for x in prev.split("."))
        if cur <= p:
            cur = (p[0], p[1], p[2] + 1)
    return ".".join(str(x) for x in cur)


# ── 본문 ──────────────────────────────────────────────────────
def strip_preamble(lines):
    """기존 WAP-ID 블록 줄만 정확히 제거한다. 앞뒤 빈 줄은 건드리지 않는다."""
    s = next((i for i, l in enumerate(lines) if l.startswith(WAP_START)), None)
    if s is None:
        return list(lines)
    e = next((i for i, l in enumerate(lines) if l.strip() == WAP_END and i > s), None)
    if e is None:
        raise ValueError("WAP-ID 블록이 열려 있고 닫히지 않았습니다. 파일이 잘렸을 수 있습니다.")
    return lines[:s] + lines[e + 1:]


def build_preamble(slug, version, base):
    tpl = open(PREAMBLE, encoding="utf-8").read().rstrip("\n")
    return (tpl.replace("@@SLUG@@", slug)
               .replace("@@VERSION@@", version)
               .replace("@@BASE@@", base)).split("\n")


def head_sha():
    try:
        return subprocess.run(["git", "rev-parse", "--short=7", "HEAD"], cwd=ROOT,
                              capture_output=True, check=True).stdout.decode().strip()
    except Exception:
        return "0000000"


# ── slug 판정 ─────────────────────────────────────────────────
def detect_slug(header, body_lines, filename, reg):
    m = re.search(r"WAP_ID\s*=\s*'([^']+)'", "\n".join(body_lines[:40]))
    if m and any(e["slug"] == m.group(1) for e in reg):
        return m.group(1), "프리앰블 WAP_ID"

    ns = (meta(header, "namespace") or [""])[0]
    hit = [e for e in reg if e.get("target") == ns]
    if len(hit) == 1:
        return hit[0]["slug"], "@namespace(정규화됨)"

    name = (meta(header, "name") or [""])[0]
    hit = [e for e in reg if e.get("displayName") == name]
    if len(hit) == 1:
        return hit[0]["slug"], "@name"

    hit = [e for e in reg if e.get("current") == ns]
    if len(hit) == 1:
        return hit[0]["slug"], "@namespace(반입 전 값)"

    stem = os.path.basename(filename).lower()
    hit = [e for e in reg if e["slug"] in stem]
    if len(hit) == 1:
        return hit[0]["slug"], "파일명"

    return None, (f"판정 실패 — @name={name!r} @namespace={ns!r}. "
                  "contracts/scripts.yaml 에 등록했는지 확인하세요.")


# ── 본체 ──────────────────────────────────────────────────────
def main(argv):
    check_only = "--check" in argv
    if not os.path.isdir(INBOX):
        print("inbox/ 가 없습니다.")
        return 2
    files = sorted(
        os.path.join(INBOX, f) for f in os.listdir(INBOX)
        if f.lower().endswith((".user.js", ".js", ".txt"))
    )
    if not files:
        print("반입할 파일이 없습니다.")
        return 0

    reg = load_registry()
    base = head_sha()
    plans, errors = [], []

    for path in files:
        rel = os.path.relpath(path, ROOT)
        try:
            text = open(path, encoding="utf-8").read()
            header, body = split_header(text, rel)
            slug, how = detect_slug(header, body, path, reg)
            if slug is None:
                errors.append(f"{rel}: {how}")
                continue
            entry = next(e for e in reg if e["slug"] == slug)

            body = strip_preamble(body)
            body_sha = hashlib.sha256("\n".join(body).encode("utf-8")).hexdigest()

            dest = os.path.join(SCRIPTS, f"{slug}.user.js")
            prev_ver = None
            if os.path.exists(dest):
                ph, _ = split_header(open(dest, encoding="utf-8").read(), dest)
                pv = (meta(ph, "version") or [None])[0]
                prev_ver = pv if pv and SEMVER.match(pv) else None

            version = norm_version((meta(header, "version") or [""])[0], prev_ver)
            header = set_meta(header, "namespace", entry.get("target", f"wap.{slug}"))
            if entry.get("displayName"):
                header = set_meta(header, "name", entry["displayName"])
            header = set_meta(header, "version", version)

            out = "\n".join(header + build_preamble(slug, version, base) + body)
            _, chk = split_header(out, "생성물")
            if hashlib.sha256("\n".join(strip_preamble(chk)).encode("utf-8")).hexdigest() != body_sha:
                errors.append(f"{rel}: 본문 바이트가 보존되지 않았습니다. 중단합니다.")
                continue

            plans.append({"src": path, "rel": rel, "slug": slug, "how": how,
                          "version": version, "prev": prev_ver, "out": out, "dest": dest})
        except Exception as e:
            errors.append(f"{rel}: {e}")

    # 같은 slug 가 한 배치에 둘 이상이면 덮어쓰기로 해결하지 않는다.
    seen = {}
    for p in plans:
        seen.setdefault(p["slug"], []).append(p["rel"])
    dup = {s: v for s, v in seen.items() if len(v) > 1}
    if dup:
        for s, v in dup.items():
            errors.append(f"slug '{s}' 를 주장하는 파일이 {len(v)}개입니다: {', '.join(v)}\n"
                          "        덮어쓰면 하나만 남고 나머지가 조용히 사라지므로 중단합니다.\n"
                          "        쪼개거나 합치는 중이라면 contracts/scripts.yaml 에 새 slug 를 먼저 등록하세요.")
        plans = []

    for p in plans:
        arrow = f"{p['prev']} → {p['version']}" if p["prev"] else f"신규 {p['version']}"
        print(f"{'[검토] ' if check_only else ''}{p['rel']}\n"
              f"        → scripts/{p['slug']}.user.js  ({arrow})  판정: {p['how']}")

    for e in errors:
        print(f"실패  {e}")

    if errors:
        print(f"\n{len(errors)}건 실패. 파일을 inbox/ 에 그대로 둡니다.")
        return 1
    if check_only:
        print(f"\n검토만 했습니다. {len(plans)}건 반입 가능.")
        return 0

    os.makedirs(SCRIPTS, exist_ok=True)
    updates = {}
    for p in plans:
        with open(p["dest"], "w", encoding="utf-8") as fh:
            fh.write(p["out"])
        os.remove(p["src"])
        updates[p["slug"]] = {"status": "imported", "version": p["version"]}
    if updates:
        update_registry(updates)
    print(f"\n{len(plans)}건 반입 완료. scripts/ 의 파일을 Tampermonkey 편집기에서 덮어쓰세요.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
