#!/usr/bin/env python3
"""contracts/scripts.yaml 과 실제 파일이 어긋나지 않았는지 검사한다.

이 검사가 존재하는 이유: 검사 대상을 글롭으로 하드코딩하면, 경로가 바뀌거나
파일명이 비ASCII일 때 검사가 "대상 0개 → 통과"로 조용히 꺼진다.
그래서 기대 개수를 레지스트리에서 뽑고, 실제와 다르면 실패시킨다.

의존성 없이 돌아야 하므로(회사 PC·CI 양쪽) PyYAML 을 쓰지 않고
필요한 필드만 직접 읽는다.
"""
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REG = os.path.join(ROOT, "contracts", "scripts.yaml")


def parse_registry(path):
    entries, cur = [], None
    for lineno, line in enumerate(open(path, encoding="utf-8"), 1):
        if line.lstrip().startswith("#"):
            continue
        m = re.match(r"^  - slug:\s*(\S+)", line)
        if m:
            cur = {"slug": m.group(1), "line": lineno}
            entries.append(cur)
            continue
        if cur is None:
            continue
        m = re.match(r"^    status:\s*(\S+)", line)
        if m:
            cur["status"] = m.group(1)
        m = re.match(r"^      target:\s*\"([^\"]+)\"", line)
        if m:
            cur["target"] = m.group(1)
        m = re.match(r"^    file:\s*(.+?)\s*$", line)
        if m:
            cur["file"] = m.group(1).strip('"')
    return entries


def tracked(pattern):
    out = subprocess.run(
        ["git", "-c", "core.quotePath=false", "ls-files", "-z", pattern],
        cwd=ROOT, capture_output=True, check=True,
    ).stdout
    return [p for p in out.decode("utf-8").split("\0") if p]


def main():
    if not os.path.exists(REG):
        print(f"레지스트리가 없습니다: {REG}")
        return 2
    entries = parse_registry(REG)
    if not entries:
        print("레지스트리에 항목이 0개입니다. 파싱이 깨졌거나 파일이 비었습니다.")
        return 2

    fail = []

    slugs = [e["slug"] for e in entries]
    dup = {s for s in slugs if slugs.count(s) > 1}
    if dup:
        fail.append(f"slug 중복: {sorted(dup)}")

    targets = [e.get("target") for e in entries if e.get("target")]
    tdup = {t for t in targets if targets.count(t) > 1}
    if tdup:
        fail.append(f"target namespace 중복: {sorted(tdup)}  "
                    "— Tampermonkey 가 두 스크립트를 같은 것으로 볼 수 있습니다")

    for e in entries:
        if e.get("status") not in ("pending", "imported"):
            fail.append(f"{e['slug']}: status 값이 이상합니다 ({e.get('status')})")

    imported = [e for e in entries if e.get("status") == "imported"]
    files = tracked("scripts/*.user.js")

    print(f"레지스트리 {len(entries)}개 (imported {len(imported)}) · "
          f"scripts/ 실제 파일 {len(files)}개")

    if len(imported) != len(files):
        fail.append(
            f"레지스트리의 imported {len(imported)}개와 scripts/ 의 파일 {len(files)}개가 "
            "다릅니다. 검사가 조용히 꺼진 상태일 수 있습니다."
        )

    reg_files = {e.get("file") or f"scripts/{e['slug']}.user.js" for e in imported}
    for f in files:
        if f not in reg_files:
            fail.append(f"레지스트리에 없는 파일: {f}")

    if fail:
        print()
        for f in fail:
            print("실패 ·", f)
        return 1
    print("일치합니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
