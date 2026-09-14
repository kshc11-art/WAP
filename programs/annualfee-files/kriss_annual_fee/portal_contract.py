from __future__ import annotations

from typing import Any, Dict, Optional

from .mapping import prep_budget_code

# ---------------------------------------------------------------------------
# KRISS MIS portal contract for patent annual-fee expenditure proposals.
#
# These values were reconstructed from completed KRISS MIS expenditure rows
# supplied by the operator (2026 Q1 examples) and are deliberately isolated in
# one file so future maintainers/AI can update the portal contract without
# touching invoice mapping, XLSX, or PDF logic.
# ---------------------------------------------------------------------------

PORTAL_CONTRACT_VERSION = 1

DOCUMENT_TYPE_TEXT = "특허 출원/등록/연차료"
PATENT_EXPENSE_CODE = "55630"
PATENT_EXPENSE_NAME = "지식재산권출원등록비"

# Markpro service fees and overseas wire fees are paid from the IP reserve.
# The numeric reserve code is year-dependent and must be resolved through
# mapping.prep_budget_code(year); do not reintroduce a fixed portal constant.
FEE_BUDGET_NAME = "지식재산권준비금"

# Portal vendor master values observed in completed KRISS MIS rows.
# The bank name/account should also be checked against the current invoice.
MARKPRO_VENDOR: Dict[str, str] = {
    "name": "(주)마크프로",
    "business_reg_no": "1168152646",
    "portal_mgmt_no": "200852645",
    "depositor": "(주)마크프로",
    "depositor_no": "",
    "bank_name": "기업은행",
    "bank_code": "12007",
    "bank_account": "221-035662-04-047",
    "president": "차상진",
    "address": "서울 영등포 문래3가 에이스하이테크시티 2-301",
}


def _scope_ko(scope: str) -> str:
    return "국내" if scope == "domestic" else "해외"


def annual_portal_payload(*, scope: str, budget_code: str, budget_name: str, amount: int, description: str = "") -> Dict[str, Any]:
    """Portal payload for an annual-maintenance principal budget job."""
    return {
        "contract_version": PORTAL_CONTRACT_VERSION,
        "expense_kind": "annual_principal",
        "scope": scope,
        "scope_text": _scope_ko(scope),
        "document_type_text": DOCUMENT_TYPE_TEXT,
        "budget_code": budget_code,
        "budget_name": budget_name,
        "expense_code": PATENT_EXPENSE_CODE,
        "expense_name": PATENT_EXPENSE_NAME,
        "amount": int(amount),
        "description": description,
        "use_date_policy": "request_date",
        "receipt": {
            "mode": "other",
            "bill_kind": "10",
            "bill_kind_text": "기타",
            "vat_code": "9",
            "vat_text": "없음",
            "pay_class": "1",
            "pay_class_text": "계좌입금",
        },
        "vendor": dict(MARKPRO_VENDOR),
        "attachments_required": True,
        "final_save_mode": "manual",
    }


def fee_portal_payload(*, scope: str, kind: str, amount: int, description: str = "", year: Optional[int] = None) -> Dict[str, Any]:
    """Portal payload for Markpro service fee or overseas remittance fee."""
    payload: Dict[str, Any] = {
        "contract_version": PORTAL_CONTRACT_VERSION,
        "expense_kind": "service_fee" if kind == "service" else "wire_fee",
        "scope": scope,
        "scope_text": _scope_ko(scope),
        "document_type_text": DOCUMENT_TYPE_TEXT,
        "budget_code": prep_budget_code(year),
        "budget_name": FEE_BUDGET_NAME,
        "expense_code": PATENT_EXPENSE_CODE,
        "expense_name": PATENT_EXPENSE_NAME,
        "amount": int(amount),
        "description": description,
        "use_date_policy": "etax_date" if kind == "service" else "request_date",
        "vendor": dict(MARKPRO_VENDOR),
        "attachments_required": True,
        "final_save_mode": "manual",
    }
    if kind == "service":
        payload["receipt"] = {
            "mode": "etax",
            "bill_kind": "14",
            "bill_kind_text": "전자세금계산서",
            "vat_code": "1",
            "vat_text": "과세",
            "pay_class": "2",
            "pay_class_text": "업체입금",
            # Default is REVIEW, not automatic final selection. The popup helper
            # narrows the list and checks a unique exact-total candidate, while
            # the operator verifies the approval number before pressing 선택.
            "etax": {
                "supplier_business_no": MARKPRO_VENDOR["business_reg_no"],
                "supplier_name": MARKPRO_VENDOR["name"],
                "item_keyword": f"{_scope_ko(scope)} 연차",
                "fallback_item_keyword": "연차",
                "expected_total": int(amount),
                "auto_confirm": False,
            },
        }
    else:
        payload["receipt"] = {
            "mode": "other",
            "bill_kind": "10",
            "bill_kind_text": "기타",
            "vat_code": "9",
            "vat_text": "없음",
            "pay_class": "1",
            "pay_class_text": "계좌입금",
        }
    return payload
