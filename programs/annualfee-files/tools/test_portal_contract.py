from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from kriss_annual_fee.mapping import prep_budget_code

EXPECTED_EXPENSE_CODE = "55630"
EXPECTED_VENDOR_NO = "1168152646"


def main() -> int:
    ap = argparse.ArgumentParser(description="Validate portal contract embedded in a generated manifest")
    ap.add_argument("manifest", type=Path)
    args = ap.parse_args()
    m = json.loads(args.manifest.read_text(encoding="utf-8"))
    jobs = m.get("jobs", [])
    fee_budget = prep_budget_code(int(m.get("year")))
    assert m.get("portal_contract_version") == 1, m.get("portal_contract_version")
    assert jobs, "manifest has no jobs"

    counts = Counter()
    for j in jobs:
        p = j.get("portal")
        assert p, f"{j['job_id']}: portal payload missing"
        assert p.get("expense_code") == EXPECTED_EXPENSE_CODE, j["job_id"]
        assert int(p.get("amount", -1)) == int(j.get("amount", -2)), j["job_id"]
        assert p.get("vendor", {}).get("business_reg_no") == EXPECTED_VENDOR_NO, j["job_id"]
        assert p.get("final_save_mode") == "manual", j["job_id"]
        assert p.get("description"), f"{j['job_id']}: portal description missing"

        receipt = p.get("receipt", {})
        if j.get("job_type") == "budget":
            counts[("budget", j.get("scope"))] += 1
            assert receipt.get("mode") == "other", j["job_id"]
            assert receipt.get("bill_kind") == "10", j["job_id"]
            assert receipt.get("vat_code") == "9", j["job_id"]
            assert receipt.get("pay_class") == "1", j["job_id"]
            assert p.get("use_date_policy") == "request_date", j["job_id"]
            assert p.get("budget_code") == j.get("budget_code"), j["job_id"]
        else:
            counts[("fee", j.get("scope"))] += 1
            assert p.get("budget_code") == fee_budget, j["job_id"]
            assert j.get("budget_name") == "지식재산권준비금", j["job_id"]
            if j["job_id"].endswith("-service"):
                assert receipt.get("mode") == "etax", j["job_id"]
                assert receipt.get("bill_kind") == "14", j["job_id"]
                assert receipt.get("vat_code") == "1", j["job_id"]
                assert receipt.get("pay_class") == "2", j["job_id"]
                et = receipt.get("etax", {})
                assert int(et.get("expected_total", -1)) == int(j["amount"]), j["job_id"]
                assert et.get("auto_confirm") is False, j["job_id"]
                assert p.get("use_date_policy") == "etax_date", j["job_id"]
            else:
                assert receipt.get("mode") == "other", j["job_id"]
                assert receipt.get("bill_kind") == "10", j["job_id"]
                assert receipt.get("vat_code") == "9", j["job_id"]
                assert receipt.get("pay_class") == "1", j["job_id"]
                assert "송금수수료" in p.get("description", ""), j["job_id"]
                assert p.get("use_date_policy") == "request_date", j["job_id"]

    print(json.dumps({"ok": True, "jobs": len(jobs), "counts": {str(k): v for k, v in counts.items()}}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
