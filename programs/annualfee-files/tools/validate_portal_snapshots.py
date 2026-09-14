from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def must(text: str, needle: str, label: str, out: dict) -> None:
    ok = needle in text
    out[label] = ok
    if not ok:
        raise AssertionError(f"missing {label}: {needle}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Check supplied KRISS portal HTML snapshots against the current KRISS portal DOM contract")
    ap.add_argument("--wire", type=Path, required=True)
    ap.add_argument("--annual-domestic", type=Path, required=True)
    ap.add_argument("--annual-overseas", type=Path, required=True)
    ap.add_argument("--blank", type=Path, required=True)
    ap.add_argument("--etax", type=Path, required=True)
    ap.add_argument("--output", type=Path)
    a = ap.parse_args()
    wire, dom, ov, blank, etax = map(read, [a.wire, a.annual_domestic, a.annual_overseas, a.blank, a.etax])
    checks: dict[str, bool] = {}

    # Blank proposal: stable selectors + portal source behavior.
    for needle, label in [
        ('id="docuType"', 'selector_docuType'), ('id="budgCd"', 'selector_budgCd'),
        ('id="budgNm"', 'selector_budgNm'), ('id="acctCd"', 'selector_acctCd'),
        ('id="acctNm"', 'selector_acctNm'), ('id="billKind"', 'selector_billKind'),
        ('id="vatCd"', 'selector_vatCd'), ('id="vatDt"', 'selector_vatDt'),
        ('id="drCrAmt"', 'selector_drCrAmt'), ('id="custNm"', 'selector_custNm'),
        ('id="busiRegNo"', 'selector_busiRegNo'), ('id="mgmtNo"', 'selector_mgmtNo'),
        ('id="dpstor"', 'selector_dpstor'), ('id="bankNm"', 'selector_bankNm'),
        ('id="bankCd"', 'selector_bankCd'), ('id="bankAcctNo"', 'selector_bankAcctNo'),
        ('id="payCls"', 'selector_payCls'), ('id="rqstDesc"', 'selector_rqstDesc'),
        ('id="btnTaxBill"', 'selector_btnTaxBill'), ('id="btnExpndtrRowInsert"', 'selector_rowInsert'),
        ('id="uploader1"', 'selector_uploader1'), ('/mis/acc/checkInformation.json', 'validation_endpoint'),
        ('case "14"://전자세금계산서', 'billkind_14_etax'), ('case "10"://기타', 'billkind_10_other'),
        ('$("#vatCd").kval("1")', 'etax_vat_1'), ('$("#vatCd").kval("9")', 'other_vat_9'),
        ('$("#payCls").kval("2")', 'etax_pay_2'), ('$("#payCls").kval("1")', 'other_pay_1'),
    ]:
        must(blank, needle, label, checks)

    # Completed examples prove common account/vendor and principal receipt mode.
    for text, prefix in [(wire, 'wire'), (dom, 'annual_domestic'), (ov, 'annual_overseas')]:
        must(text, '지식재산권출원등록비', f'{prefix}_expense_name', checks)
        must(text, '55630', f'{prefix}_expense_code', checks)
        must(text, '(주)마크프로', f'{prefix}_vendor_name', checks)
        must(text, '1168152646', f'{prefix}_vendor_business_no', checks)
        must(text, '기타', f'{prefix}_receipt_other', checks)

    must(wire, '26841001', 'wire_fee_budget', checks)
    must(wire, '197,872', 'wire_example_amount', checks)
    must(dom, '1,034,500', 'annual_domestic_example_amount', checks)
    must(ov, '13,480,636', 'annual_overseas_example_amount', checks)

    # Request-date/use-date equality observed in the three completed examples.
    dates = {}
    for text, key in [(wire, 'wire'), (dom, 'annual_domestic'), (ov, 'annual_overseas')]:
        ds = sorted(set(re.findall(r'2026-\d{2}-\d{2}', text)))
        dates[key] = ds
    checks['completed_examples_contain_repeated_request_date'] = all(any(text.count(d) >= 3 for d in ds) for text, ds in [(wire, dates['wire']), (dom, dates['annual_domestic']), (ov, dates['annual_overseas'])])

    # E-tax popup contract and Markpro example.
    for needle, label in [
        ('전자세금계산서조회', 'etax_popup_title'), ('id="btnSearch"', 'etax_btnSearch'),
        ('name="selrCorpNo"', 'etax_supplier_no'), ('name="corpNm"', 'etax_supplier_name'),
        ('name="itemNm"', 'etax_item'), ('id="billGrid"', 'etax_grid'),
        ('data-field="totlAmt"', 'etax_total_field'), ('data-field="issuSeqno"', 'etax_approval_field'),
        ('id="deptSelectBtn"', 'etax_select_button'), ('1168152646', 'etax_markpro_example_supplier'),
        ('4,633,044', 'etax_markpro_example_total'), ('2026년 3분기 해외 연차 납부수수료', 'etax_markpro_example_item'),
    ]:
        must(etax, needle, label, checks)

    report = {
        'ok': all(checks.values()),
        'contract_version': 1,
        'checked_at': '2026-08-14',
        'checks': checks,
        'completed_example_dates': dates,
        'notes': [
            'Snapshots are user-supplied captured DOM/source, not a live-session test.',
            'Use-date request_date policy is based on completed examples; e-tax use date is filled by the portal callback.',
            'Final save and e-tax approval-number confirmation remain operator-controlled by default.'
        ],
    }
    data = json.dumps(report, ensure_ascii=False, indent=2)
    if a.output:
        a.output.parent.mkdir(parents=True, exist_ok=True)
        a.output.write_text(data, encoding='utf-8')
    print(data)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
