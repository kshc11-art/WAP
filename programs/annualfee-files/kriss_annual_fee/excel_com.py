from __future__ import annotations

"""Compatibility exports for Excel backends.

v0.6.3 restores Microsoft Excel COM as the *recommended business-output backend*.
The old OOXML implementation remains available explicitly as ``portable-legacy`` for
regression/development, but must not be mistaken for the operational default.
"""

from .excel_native import ExcelNativeUnavailable, NativeExcelSession, native_excel_environment
from .xlsx_ooxml import XlsxSession, inspect_workbook

# Historical import name now points to the native operational implementation.
ExcelSession = NativeExcelSession

__all__ = [
    "ExcelSession",
    "NativeExcelSession",
    "ExcelNativeUnavailable",
    "native_excel_environment",
    "XlsxSession",
    "inspect_workbook",
]
