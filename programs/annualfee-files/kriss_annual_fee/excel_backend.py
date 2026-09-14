from __future__ import annotations

"""Output spreadsheet backend selection.

Business rule:
- ``auto`` means Microsoft Excel Native on Windows; it does NOT silently fall back.
- ``native`` explicitly requires Microsoft Excel Native.
- ``portable-legacy`` keeps the old OOXML writer only for regression/development.
  It is never the recommended operational mode because real Excel compatibility and
  filter fidelity are more important than cross-platform business-output generation.
"""

import os
from typing import Any, Dict

from .excel_native import ExcelNativeUnavailable, NativeExcelSession, native_excel_environment
from .xlsx_ooxml import XlsxSession

BACKENDS = ("auto", "native", "portable-legacy")


class PortableLegacySession(XlsxSession):
    engine_name = "ooxml-portable-legacy"

    def __init__(self, visible: bool = False):
        super().__init__(visible=visible)
        self.validation_log = []

    def create_filtered_copy(self, source_budget_workbook, output, budget_name, expected_amount=None):
        return super().create_filtered_copy(source_budget_workbook, output, budget_name)


def backend_environment() -> Dict[str, Any]:
    probe = native_excel_environment()
    probe["recommended"] = "native"
    probe["portable_legacy_available"] = True
    return probe


def open_output_session(mode: str = "auto", *, visible: bool = False, validate_reopen: bool = True):
    mode = str(mode or "auto").strip().lower()
    if mode not in BACKENDS:
        raise ValueError(f"unknown Excel backend {mode!r}; choose one of {BACKENDS}")

    if mode in {"auto", "native"}:
        # Intentionally no auto fallback: producing an XLSX that only *looks* right in a
        # Python renderer but is rejected/repaired by Microsoft Excel is worse than fail-fast.
        session = NativeExcelSession(visible=visible, validate_reopen=validate_reopen)
        session.__enter__()
        return session

    return PortableLegacySession()
