from __future__ import annotations

import json
import os
import platform
import sys
from importlib import metadata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from kriss_annual_fee.excel_backend import backend_environment
from kriss_annual_fee.version import VERSION


def pkg_version(name: str) -> str | None:
    try:
        return metadata.version(name)
    except Exception:
        return None


def main() -> int:
    report = {
        "project_version": VERSION,
        "platform": platform.platform(),
        "python": platform.python_version(),
        "python_executable": sys.executable,
        "cwd": str(Path.cwd()),
        "packages": {
            "PyMuPDF": pkg_version("PyMuPDF"),
            "tkinterdnd2": pkg_version("tkinterdnd2"),
            "pywin32": pkg_version("pywin32") if os.name == "nt" else None,
        },
        "excel_native_probe": backend_environment(),
        "notes": [
            "This probe does not start Microsoft Excel.",
            "Run native_excel_selftest.bat for the save-close-reopen COM validation.",
        ],
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
