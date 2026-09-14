from __future__ import annotations

"""Small self-contained regression checks for invariants introduced in v0.6.x.

These checks deliberately require no private quarterly workbook/PDF fixture, so a
future maintainer or CI runner can catch release-level regressions quickly.
"""

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from kriss_annual_fee.core import classify_current_files
from kriss_annual_fee.mapping import parse_research_records, prep_budget_code
from kriss_annual_fee.portal_contract import fee_portal_payload
from kriss_annual_fee.version import VERSION
from kriss_annual_fee.excel_backend import BACKENDS, backend_environment
from kriss_annual_fee.workflow import ANNUAL_DIR_NAME, AUTOMATION_DIR_NAME, FEE_DIR_NAME, result_dir_name


def main() -> int:
    checks: dict[str, object] = {}

    assert VERSION == "0.6.7"
    checks["version"] = VERSION
    assert "auto" in BACKENDS and "native" in BACKENDS and "portable-legacy" in BACKENDS
    checks["excel_backends"] = list(BACKENDS)
    checks["excel_environment"] = backend_environment()


    with tempfile.TemporaryDirectory(prefix="kriss_discovery_") as td:
        t = Path(td)
        names = [
            "E0259-INV-202603Q-국내.pdf",
            "E0259-INV-202603Q-국내.xlsx",
            "E0259-INV-202603Q-해외.pdf",
            "E0259-INV-202603Q-해외.xlsx",
            "연구부서납부 특허.xlsx",
            "기술사업화납부 특허.xlsx",
        ]
        files = []
        for name in names:
            q = t / name
            q.touch()
            files.append(q)
        classified = classify_current_files(files)
        assert all(len(classified[k]) == 1 for k in classified)
        checks["shared_current_file_discovery"] = {k: v[0].name for k, v in classified.items()}

    assert result_dir_name(2026, 3) == "2026년 3분기 연차관리"
    assert FEE_DIR_NAME == "2. 수수료 납부"
    assert ANNUAL_DIR_NAME == "3. 연차유지료 납부"
    assert AUTOMATION_DIR_NAME == "템퍼몽키용"
    checks["output_layout"] = [FEE_DIR_NAME, ANNUAL_DIR_NAME, AUTOMATION_DIR_NAME]

    assert prep_budget_code(2025) == "25841004"
    assert prep_budget_code(2026) == "26841001"
    checks["reserve_codes"] = {"2025": prep_budget_code(2025), "2026": prep_budget_code(2026)}

    p25 = fee_portal_payload(kind="service", scope="domestic", amount=1100, year=2025)
    p26 = fee_portal_payload(kind="service", scope="domestic", amount=1100, year=2026)
    assert p25["budget_code"] == "25841004"
    assert p26["budget_code"] == "26841001"
    checks["fee_portal_year_aware"] = {"2025": p25["budget_code"], "2026": p26["budget_code"]}

    headers = ["관리번호", "사용예산코드", "사용예산명"]
    rows = [["PTEST001KR", "", ""]]
    assigned, blocked = parse_research_records(
        headers,
        rows,
        Path("연구부서납부 특허.xlsx"),
        "current_research",
        source_period="2026Q3",
    )
    assert not assigned
    assert blocked["PTEST001KR"]["source_period"] == "2026Q3"
    checks["current_explicit_unassigned_period"] = blocked["PTEST001KR"]["source_period"]

    try:
        prep_budget_code(2099)
    except ValueError:
        checks["unknown_year_fails"] = True
    else:
        raise AssertionError("unknown reserve-budget year must fail instead of guessing")

    print(json.dumps({"ok": True, "checks": checks}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
