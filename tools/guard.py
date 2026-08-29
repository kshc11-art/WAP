#!/usr/bin/env python3
"""업무 데이터·인증정보가 저장소에 들어가는 것을 막는 가드.

    tools/guard.py <파일...>      지정한 파일 검사
    tools/guard.py --all          추적 중인 전체 파일 검사

.gitignore가 1차 방어선이고 이것은 2차 방어선이다.

설계 원칙 세 가지 — 전부 실제로 당한 버그에서 나왔다.
  1. 조용한 스킵 금지. 읽을 수 없는 파일은 통과가 아니라 실패다.
  2. 검사 대상 0개는 성공이 아니라 실패다. (--all)
  3. 파일명이 한글이어도 반드시 열린다. git ls-files는 기본 설정에서
     비ASCII 파일명을 8진 이스케이프로 따옴표 처리해 돌려주므로
     -z 와 core.quotePath=false 없이는 이 저장소의 파일이 전부 누락된다.
"""
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RULES = os.path.join(ROOT, "tools", "rules", "pii.txt")

# 확장자로 차단 — 업무 산출물 / 캡처 / 압축본
BLOCKED_EXT = {
    "xlsx", "xlsm", "xlsb", "xls", "csv", "tsv", "har", "zip", "7z", "rar",
    "hwp", "hwpx", "msg", "eml", "pcap", "pdf", "doc", "docx", "ppt", "pptx",
}
# 파일명으로 차단 — 자격증명
BLOCKED_NAME = re.compile(r"(^|/)(\.env($|\..*)|id_rsa.*|.*\.(pem|key|p12|pfx|jks))$")

# 패턴 사전을 적용하지 않는 경로. 가드 자신과 패턴 사전은 당연히 패턴을 포함한다.
SKIP_SCAN = ("tools/", ".githooks/", ".github/workflows/")
# 면제 경로는 두지 않는다. 익명화된 fixture는 애초에 패턴에 걸리지 않으므로
# 면제가 필요 없고, 면제를 두면 그 폴더가 실데이터의 우회로가 된다.

ESCAPE_RE = re.compile(r"\\u([0-9a-fA-F]{4})")


def load_rules():
    rules = []
    if not os.path.exists(RULES):
        sys.stderr.write(f"패턴 사전을 찾을 수 없습니다: {RULES}\n")
        sys.exit(2)
    for lineno, line in enumerate(open(RULES, encoding="utf-8"), 1):
        line = line.rstrip("\n")
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) < 3:
            sys.stderr.write(f"{RULES}:{lineno} 형식 오류 (탭 3칸 필요)\n")
            sys.exit(2)
        level, pattern, desc = parts[0].strip(), parts[1], parts[2].strip()
        if level not in ("BLOCK", "WARN"):
            sys.stderr.write(f"{RULES}:{lineno} 알 수 없는 등급: {level}\n")
            sys.exit(2)
        try:
            rules.append((level, re.compile(pattern), desc))
        except re.error as e:
            sys.stderr.write(f"{RULES}:{lineno} 정규식 오류: {e}\n")
            sys.exit(2)
    return rules


def tracked_files():
    """추적 중인 전체 파일. 한글 파일명이 누락되지 않도록 -z 로 받는다."""
    out = subprocess.run(
        ["git", "-c", "core.quotePath=false", "ls-files", "-z"],
        cwd=ROOT, capture_output=True, check=True,
    ).stdout
    return [p for p in out.decode("utf-8").split("\0") if p]


def rel(path):
    try:
        return os.path.relpath(os.path.abspath(path), ROOT).replace(os.sep, "/")
    except ValueError:
        return path


def scan(path, rules):
    """(치명 발견 목록, 경고 발견 목록). 읽기 실패는 예외를 올린다."""
    r = rel(path)
    ext = os.path.splitext(path)[1].lstrip(".").lower()
    if ext in BLOCKED_EXT:
        return [(0, "업무 산출물/캡처/압축 파일", "확장자 ." + ext)], []
    if BLOCKED_NAME.search(r):
        return [(0, "자격증명 파일", os.path.basename(path))], []
    if any(r.startswith(s) for s in SKIP_SCAN):
        return [], []

    with open(path, "rb") as fh:
        raw = fh.read()
    if b"\0" in raw[:8000]:
        return [], []  # 바이너리
    text = raw.decode("utf-8", errors="replace")
    # \uXXXX 이스케이프로 숨은 값도 잡는다 (실측: 한 파일에 136건)
    decoded = ESCAPE_RE.sub(lambda m: chr(int(m.group(1), 16)), text)

    lines = text.split("\n")
    blocks, warns = [], []
    for level, rx, desc in rules:
        hit = rx.search(text)
        where = "평문"
        if not hit and decoded != text:
            hit = rx.search(decoded)
            where = "\\u 이스케이프 안"
        if not hit:
            continue
        lineno = text.count("\n", 0, hit.start()) + 1 if where == "평문" else 0
        (blocks if level == "BLOCK" else warns).append((lineno, desc, where))
    del lines
    return blocks, warns


def main(argv):
    rules = load_rules()
    all_mode = argv[:1] == ["--all"]
    files = tracked_files() if all_mode else argv

    if all_mode and not files:
        print("검사 대상이 0개입니다. 이것은 성공이 아니라 실패입니다.")
        print("git ls-files 가 비어 있거나 저장소 밖에서 실행됐습니다.")
        return 2

    failed = 0
    warned = 0
    checked = 0
    for f in files:
        if not f:
            continue
        path = f if os.path.isabs(f) else os.path.join(ROOT, f)
        if os.path.isdir(path):
            continue
        if not os.path.exists(path):
            # 삭제된 파일을 인자로 받는 경우가 있다(스테이지 목록 등). 그것만 허용.
            if all_mode:
                print(f"열 수 없음  {f}  ← 추적 중인데 파일이 없습니다")
                failed += 1
            continue
        try:
            blocks, warns = scan(path, rules)
        except Exception as e:  # 읽기 실패를 통과로 처리하지 않는다
            print(f"검사 실패  {f}: {e}")
            failed += 1
            continue
        checked += 1
        for lineno, desc, *extra in blocks:
            loc = f"{f}:{lineno}" if lineno else f
            note = f" ({extra[0]})" if extra else ""
            print(f"차단  {loc}\n      {desc}{note}")
            failed += 1
        for lineno, desc, *extra in warns:
            loc = f"{f}:{lineno}" if lineno else f
            note = f" ({extra[0]})" if extra else ""
            print(f"경고  {loc}\n      {desc}{note} — 반출 가능 여부를 사람이 판단할 항목")
            warned += 1

    print(f"\n검사한 파일 {checked}개 · 차단 {failed}건 · 경고 {warned}건")
    if failed:
        print("\n→ ENGINEERING_RULES.md §1 (절대 commit 금지) 확인")
        print("→ 패턴이 오탐이면 tools/rules/pii.txt 를 고치세요. --no-verify 로 넘기지 마세요.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
