# -*- coding: utf-8 -*-
"""hwp_fill PlanBuilder 골든 대조 검증 (2026년 제1차 위원회 완성본 기준).

절차:
  1) tools/make_mock_master.py 로 모의 MASTER 생성 (v0.1.9 시트/열 형태)
  2) hwp_fill.read_master + PlanBuilder 로 채움 계획 생성
  3) 계획의 표 데이터/요약 문구를 골든 HWP에서 추출한 기대값과 셀 단위 대조
     (공백·따옴표 정규화 후 비교, 골든의 빈 셀(합계 미기입)은 대조 제외)

v0.2.9 주의: 계획은 2026_2 병합본 표기 규칙(발명자 콤마 뒤 공백, 날짜 m-d,
물결 ∼, 세부표 오름차순 통일)을 따르므로, 2026_1 골든과의 대조는 "값 보존"
관점으로 수행한다 — 표기차는 fold()로 접고, 세부표는 식별열 기준 정렬 후
비교하며 No열(재부여)은 제외한다.

사용:  python tools/validate_plan.py
종료코드 0 = 전체 일치(허용 예외 제외), 1 = 불일치 존재.
"""
import csv
import datetime as dt
import json
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))

import hwp_fill  # noqa: E402

GOLDEN = json.loads((HERE / "golden_2026_1.json").read_text(encoding="utf-8"))

# 골든 문서 자체 결함으로 확인된 셀 (대조 제외, VALIDATION 문서 참조)
KNOWN_GOLDEN_DEFECTS = {("b2_for", 0, 4)}  # 발명의 명칭 자리에 발명자 기재


def main() -> int:
    tmp = Path(tempfile.mkdtemp())
    master_path = tmp / "mock_master.xlsx"
    subprocess.run([sys.executable, str(HERE / "make_mock_master.py"), str(master_path)],
                   check=True, cwd=str(ROOT))
    dept_csv = tmp / "dept_map.csv"
    with open(dept_csv, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["주발명자", "본부"])
        for k, v in GOLDEN["dept_map"].items():
            w.writerow([k, v])

    m = hwp_fill.read_master(master_path)
    plan = hwp_fill.PlanBuilder(
        m, GOLDEN["round_no"], dt.date.fromisoformat(GOLDEN["report_date"]),
        hwp_fill.load_dept_map(dept_csv), tmp).build(["b1", "b2", "b5", "b6"])

    import re as _re

    def fold(v):
        t = hwp_fill.norm_ws(v)
        t = t.replace("\u223c", "~").replace("\uff5e", "~").replace(",", "")
        # 날짜 선행 0 접기: 2025-11-05 → 2025-11-5
        t = _re.sub(r"(\d{4})-0?(\d{1,2})-0?(\d{1,2})", r"\1-\2-\3", t)
        return t

    # 세부표 식별열(정렬키): No열(0)은 재부여되므로 비교 제외
    SORT_KEY = {"b1_dom": 2, "b1_for": 3, "b2_dom": 2, "b2_for": 3,
                "b5_list": 2, "b6_dom": 2, "b6_for": 3}

    exp = GOLDEN["expected_tables"]
    checks = [
        ("b1", "국내 출원 세부", "b1_dom"), ("b1", "국외 출원 세부", "b1_for"),
        ("b1", "출원 통계", "b1_stat"),
        ("b2", "국내 등록 세부", "b2_dom"), ("b2", "국외 등록 세부", "b2_for"),
        ("b2", "등록 통계", "b2_stat"),
        ("b5", "본부별 집계", "b5_agg"), ("b5", "심의 목록", "b5_list"),
        ("b6", "국내 포기", "b6_dom"), ("b6", "국외 포기", "b6_for"),
    ]
    docs = {d.key: d for d in plan.docs}
    fails, cells_ok, cells_skip = [], 0, 0
    for dkey, tname, ekey in checks:
        table = next(t for t in docs[dkey].tables if t.name == tname)
        expect = exp[ekey]
        if len(table.rows) != len(expect):
            fails.append(f"{ekey}: 행 수 {len(table.rows)} != {len(expect)}")
            continue
        got_rows, want_rows = list(table.rows), list(expect)
        skip_no = ekey in SORT_KEY
        if skip_no:
            k = SORT_KEY[ekey]
            keyf = lambda row: fold(row[k]) if len(row) > k else ""
            got_rows = sorted(got_rows, key=keyf)
            want_rows = sorted(want_rows, key=keyf)
        for r, (got, want) in enumerate(zip(got_rows, want_rows)):
            for c in range(min(len(got), len(want))):
                if skip_no and c == 0:
                    cells_skip += 1  # No열은 정렬 개편으로 재부여 — 비교 제외
                    continue
                if (ekey, r, c) in KNOWN_GOLDEN_DEFECTS:
                    cells_skip += 1
                    continue
                w = want[c]
                if hwp_fill.norm_ws(w) == "":
                    cells_skip += 1  # 골든 미기입(합계 등) — 계획값이 정본
                    continue
                if fold(got[c]) != fold(w):
                    fails.append(f"{ekey}[{r}][{c}]: '{got[c]}' != '{w}'")
                else:
                    cells_ok += 1

    # 문구 대조(v0.2.9): 문단 이름·워딩은 2026_2 병합본 기준으로 개편되었으므로
    # 골든 문자열 전문 대신 "값 토큰"(기간 범위, 총/국내/국외 건수)의 보존만 확인한다.
    def value_tokens(text):
        t = fold(text)
        toks = set(_re.findall(r"\d{2}\.\d{1,2}\.\d{1,2}\.?~\d{2}\.\d{1,2}\.\d{1,2}\.?", t))
        toks |= set(_re.findall(r"총\d+건", t))
        m = _re.search(r"국내(\d+)", t)
        if m: toks.add(f"국내{m.group(1)}")
        m = _re.search(r"국외(\d+)", t)
        if m: toks.add(f"국외{m.group(1)}")
        return toks

    for dkey, items in GOLDEN["expected_strings"].items():
        blob_parts = [p.text for p in docs[dkey].para_replaces]
        for p_ in docs[dkey].para_replaces:
            for _, repl in (getattr(p_, "subs", None) or []):
                blob_parts.append(str(repl))
        blob = fold("|".join(blob_parts))
        for name, want in items.items():
            toks = value_tokens(want)
            missing = [t for t in toks if t not in blob]
            if missing:
                fails.append(f"{dkey} 문구({name}): 값 토큰 누락 {missing} (골든: '{want}')")
            else:
                cells_ok += 1

    # v0.2.1: 템플릿의 기존 세로병합을 MASTER와 독립적으로 해석하는 순수 로직 검증.
    merge_cases = [
        # 5행, 2행+3행 두 개의 세로병합 run
        (["H1", "H2", "1", "A", "x", "y", "2", "x", "y",
          "3", "B", "x", "y", "4", "x", "y", "5", "x", "y"],
         2, 4, 1, (5, [(3, 2), (10, 3)])),
        # 병합 없는 직사각형 2행
        (["H", "1", "A", "x", "2", "B", "y"],
         1, 3, 1, (2, [(2, 1), (5, 1)])),
    ]
    merge_ok = 0
    for i, (texts, prefix, ncols, mcol, want) in enumerate(merge_cases, 1):
        rows, runs, err = hwp_fill.infer_existing_merged_rows(texts, prefix, ncols, mcol)
        if err or (rows, runs) != want:
            fails.append(f"병합구조 테스트{i}: got={(rows, runs, err)} want={want}")
        else:
            merge_ok += 1

    print(f"일치 {cells_ok} / 제외 {cells_skip} / 불일치 {len(fails)}")
    print(f"병합구조 테스트 {merge_ok}/{len(merge_cases)}")
    for f in fails[:40]:
        print("  X", f)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
