# -*- coding: utf-8 -*-
import os
import subprocess
import sys
from pathlib import Path

VERSION = "0.2.8"
print(f"KRISS Committee Automation v{VERSION} - System Doctor")
print("Python:", sys.version.replace("\n", " "))
print("Platform:", os.name)

failed = False
for module, label in (
    ("PyQt5", "PyQt5"),
    ("xlsxwriter", "XlsxWriter"),
    ("matplotlib", "matplotlib"),
):
    try:
        m = __import__(module)
        ver = getattr(m, "__version__", "OK")
        print(f"{label}: OK ({ver})")
    except Exception as e:
        print(f"{label}: FAIL", e)
        failed = True

root = Path(__file__).resolve().parent
template_dir = root / "resources" / "hwp_templates" / "2026_1"
templates = sorted(template_dir.glob("*.hwp")) if template_dir.is_dir() else []
if len(templates) == 6:
    print(f"Built-in HWP templates (2026/1): OK ({len(templates)} files)")
else:
    print(f"Built-in HWP templates (2026/1): FAIL ({len(templates)} files) - {template_dir}")
    failed = True

if os.name == "nt":
    for module, label in (("win32com.client", "pywin32"), ("pyhwpx", "pyhwpx")):
        try:
            __import__(module)
            print(f"HWP dependency ({label}): OK")
        except Exception as e:
            print(f"HWP dependency ({label}): FAIL", e)
            failed = True
else:
    print("HWP COM dependencies: Windows only (skipped on this OS)")

release_check = root / "tools" / "validate_release.py"
if release_check.exists():
    cp = subprocess.run(
        [sys.executable, str(release_check), str(root)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if cp.returncode == 0:
        print("BAT/CMD release rules: OK")
    else:
        print("BAT/CMD release rules: FAIL")
        print(cp.stdout)
        failed = True
else:
    print("BAT/CMD release rules: FAIL - validator missing")
    failed = True

if failed:
    print("Run run_windows.bat to prepare or repair the shared runtime.")
    raise SystemExit(1)

print("Excel COM: NOT USED")
print("MASTER generation is Python-native; HWP generation uses Hancom automation on Windows.")
