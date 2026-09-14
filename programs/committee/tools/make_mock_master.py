# -*- coding: utf-8 -*-
"""골든 JSON(golden_2026_1.json) → v0.1.9 MASTER 형태의 모의 xlsx 생성.

hwp_fill.py 의 PlanBuilder 를 실제 MASTER 없이 검증하기 위한 도구.
시트/열 구성은 v0.1.9 MasterWriter 와 동일한 부분집합을 재현한다.
(hwp_fill 이 읽는 시트·열만 채운다)

사용:  python tools/make_mock_master.py [출력경로]
"""
import datetime as dt
import json
import sys
from pathlib import Path

import xlsxwriter

HERE = Path(__file__).resolve().parent
GOLDEN = json.loads((HERE / "golden_2026_1.json").read_text(encoding="utf-8"))
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "mock_master_2026_1.xlsx"

wb = xlsxwriter.Workbook(str(OUT))
datef = wb.add_format({"num_format": "yyyy-mm-dd"})


def as_date(s):
    try:
        return dt.datetime.strptime(s, "%Y-%m-%d")
    except Exception:
        return s


def sheet(name, header, rows, date_cols=()):
    ws = wb.add_worksheet(name)
    ws.write_row(0, 0, header)
    for r, row in enumerate(rows, 1):
        for c, v in enumerate(row):
            if c in date_cols and isinstance(v, str) and v:
                ws.write_datetime(r, c, as_date(v), datef)
            else:
                ws.write(r, c, v)


inp = GOLDEN["inputs"]

ws = wb.add_worksheet("00_요약")
ws.write_row(0, 0, ["KRISS 직무발명관리위원회 작업 MASTER"])
ws.write_row(1, 0, ["안건 기준분기", inp["period_label"]])
ws.write_row(2, 0, ["포기특허 기준분기", inp["waiver_label"] + " (+1분기 / MarkPro 원천 기준)"])

sheet("10_출원현황",
      ["순번", "최종반영", "관리번호", "출원일자", "국내외", "국가", "출원번호", "발명명칭",
       "권리자", "발명자", "단독/공동", "상태", "상태세부", "판정근거"],
      [[i, "Y", "", r["출원일자"], r["국내외"], r["국가"], r["출원번호"], r["발명명칭"],
        r["권리자"], r["발명자"], "", "", "", ""] for i, r in enumerate(inp["applications"], 1)],
      date_cols={3})

sheet("11_등록현황",
      ["순번", "최종반영", "관리번호", "등록일자", "국내외", "국가", "등록번호", "출원번호",
       "발명명칭", "권리자", "발명자", "단독/공동", "상태", "상태세부"],
      [[i, "Y", "", r["등록일자"], r["국내외"], r["국가"], r["등록번호"], "", r["발명명칭"],
        r["권리자"], r["발명자"], "", "", ""] for i, r in enumerate(inp["registrations"], 1)],
      date_cols={3})

sheet("12_국외심의",
      ["순번", "최종반영", "관리번호", "신청번호", "신청일", "국내외", "국가", "출원종류",
       "출원번호", "발명명칭", "주발명자", "발명자", "단독/공동", "KRISS지분", "패밀리번호",
       "기PCT관리번호", "상태", "상태세부", "판정근거"],
      [[i, "Y", "", "", "", r["국내외"], r["국가"], "", r["출원번호"] or "(출원전)",
        r["발명명칭"], r["주발명자"], "", "", "", "", "", "", "", ""]
       for i, r in enumerate(inp["foreign_reviews"], 1)])

sheet("13_포기심의",
      ["순번", "최종반영", "안건 기준분기", "포기 기준분기", "관리번호", "국가", "등록일자",
       "등록번호", "출원번호", "발명명칭", "발명자", "단독/공동", "권리자", "기술이전",
       "상태", "상태세부", "납부여부", "납부구분", "제목비교", "등록번호비교", "출원번호비교",
       "검증결과", "조인"],
      [[i, "Y", inp["period_label"], inp["waiver_label"], "", r["국가"], r["등록일자"],
        r["등록번호"], "", r["발명명칭"], r["발명자"], "", "", "", "", "", "N", "포기", "", "", "", "", ""]
       for i, r in enumerate(inp["waivers"], 1)],
      date_cols={6})

ws = wb.add_worksheet("20_그래프데이터")
ws.write_row(0, 0, ["출원 추이 (전체 기간 보존)"])
ws.write_row(1, 0, ["연도", "표시", "국내 출원", "PCT", "일반국외", "국외+PCT", "전체 출원", "차트표시"])
ws.write(1, 9, "연도"); ws.write_row(1, 9, ["연도", "표시", "국내 등록", "국외 등록", "전체 등록", "차트표시"])
for i, a in enumerate(inp["graph_app"], 2):
    ws.write_row(i, 0, [a["year"], a["label"], a["domestic"], a["pct"], a["foreign_general"],
                        a["pct"] + a["foreign_general"], a["total"], "O"])
for i, r in enumerate(inp["graph_reg"], 2):
    ws.write_row(i, 9, [r["year"], r["label"], r["domestic"], r["foreign"], r["total"], "O"])

wb.close()
print(f"mock MASTER 생성: {OUT}")
