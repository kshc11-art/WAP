# -*- coding: utf-8 -*-
from pathlib import Path
import ast
import re
import sys

ROOT = Path(__file__).resolve().parent
errors = []

def fail(msg):
    errors.append(msg)

required = [
    "hwp_meeting_merger.py",
    "hwp_merge_engine.ps1",
    "smart_rules.py",
    "security_support.py",
    "run_windows.bat",
    "install_windows.bat",
    "install_pywin32_online.bat",
    "README.txt",
    "ARCHITECTURE.txt",
    "VERSION.txt",
]

for name in required:
    if not (ROOT / name).exists():
        fail(f"missing required file: {name}")

# Python syntax.
for py_path in sorted(ROOT.glob("*.py")):
    if py_path.name == Path(__file__).name:
        continue
    try:
        ast.parse(py_path.read_text(encoding="utf-8"))
    except Exception as e:
        fail(f"{py_path.name}: Python syntax error: {e}")

# BAT rules.
bat_files = sorted(
    list(ROOT.glob("*.bat"))
    + list(ROOT.glob("*.cmd"))
)

for path in bat_files:
    data = path.read_bytes()
    name = path.name

    if any(b > 0x7F for b in data):
        fail(f"{name}: non-ASCII byte detected")

    if data.startswith(
        (b"\xef\xbb\xbf", b"\xff\xfe", b"\xfe\xff")
    ):
        fail(f"{name}: BOM detected")

    for i, b in enumerate(data):
        if b == 0x0A and (i == 0 or data[i - 1] != 0x0D):
            fail(f"{name}: bare LF detected")
            break

        if b == 0x0D and (
            i + 1 >= len(data)
            or data[i + 1] != 0x0A
        ):
            fail(f"{name}: bare CR detected")
            break

    text = data.decode("ascii")

    if re.search(r"(?im)^\s*chcp\b", text):
        fail(f"{name}: chcp prohibited")

    if re.search(r"(?i)activate\.bat", text):
        fail(f"{name}: activate.bat dependency detected")

    if 'cd /d "%~dp0"' not in text:
        fail(f'{name}: missing cd /d "%~dp0"')

main = (ROOT / "hwp_meeting_merger.py").read_text(encoding="utf-8")
ps = (ROOT / "hwp_merge_engine.ps1").read_text(encoding="utf-8-sig")

if 'APP_VERSION = "0.4.2"' not in main:
    fail("main version is not 0.4.0")

# Lossless architecture markers.
for marker in [
    "mode=lossless",
    "Prepare-CellPayloadClipboard",
    "Paste-PreparedPayload",
    '$src.Run("SelectAll")',
    '$src.Run("Copy")',
    '$tmp.Run("Paste")',
    '$tmp.Run("Copy")',
    '$dest.Run("Paste")',
    "Duplicate-topic candidate report (no deletion).",
]:
    if marker not in ps:
        fail(f"lossless PowerShell marker missing: {marker}")

# Destination must never be destructively cleared/rebuilt.
for forbidden in [
    "Clear-FieldPayload",
    "Rebuild-Field",
    "Rebuild-Section",
    "Clear-SectionPayload",
    "Apply-SafeFieldCleanup",
]:
    if forbidden in ps:
        fail(f"destructive HWP rebuild regression: {forbidden}")

# No destination Delete action in production PowerShell engine.
if re.search(r'\$dest\.Run\("Delete"\)', ps):
    fail("destination Delete action regression")

# No smart_plan.fields based reconstruction in production engine.
if "smart_plan.fields" in ps:
    fail("smart_plan.fields destructive reconstruction regression")

# Cell-block safety: MoveToField then SelectAll.
if "MoveToField" not in ps or 'Run("SelectAll")' not in ps:
    fail("cell content selection pattern missing")

# PowerShell 5.1 compatibility hazards.
if re.search(r'(?mi)^\s+-(and|or)\b', ps):
    fail("line-leading PowerShell -and/-or regression")

# Basic delimiter balance ignoring strings/comments.
def strip_ps(text: str) -> str:
    out = []
    in_single = False
    in_double = False
    escape = False
    i = 0

    while i < len(text):
        ch = text[i]

        if in_single:
            if ch == "'":
                if i + 1 < len(text) and text[i + 1] == "'":
                    i += 2
                    continue
                in_single = False
            i += 1
            continue

        if in_double:
            if escape:
                escape = False
                i += 1
                continue
            if ch == "`":
                escape = True
                i += 1
                continue
            if ch == '"':
                in_double = False
            i += 1
            continue

        if ch == "#":
            while i < len(text) and text[i] not in "\r\n":
                i += 1
            continue

        if ch == "'":
            in_single = True
            i += 1
            continue

        if ch == '"':
            in_double = True
            i += 1
            continue

        out.append(ch)
        i += 1

    return "".join(out)

code = strip_ps(ps)
pairs = {"(": ")", "{": "}", "[": "]"}
stack = []

for ch in code:
    if ch in pairs:
        stack.append(ch)
    elif ch in pairs.values():
        if not stack:
            fail(f"unmatched closing delimiter: {ch}")
            break
        opener = stack.pop()
        if pairs[opener] != ch:
            fail(f"delimiter mismatch: {opener} ... {ch}")
            break

if stack:
    fail(f"unclosed PowerShell delimiters: {len(stack)}")

# Runtime parser preflight retained.
for marker in [
    "validate_powershell_engine_syntax",
    'env["HWP_ENGINE_PATH"] = str(PS_ENGINE)',
    "$enginePath=$env:HWP_ENGINE_PATH",
]:
    if marker not in main:
        fail(f"PowerShell preflight marker missing: {marker}")


# v0.4.1 spacing-normalization regression checks.
for marker in [
    "Remove-TopLevelEmptyParagraphs",
    "spacing normalize: removed",
    "$mainList = [int]$docStart.List",
    "$looksLikeControl = ($delta -ge 8)",
    "Remove-TopLevelEmptyParagraphs $tmp",
]:
    if marker not in ps:
        fail(f"spacing-normalization marker missing: {marker}")

# Blank-paragraph cleanup must happen only in temporary HWP, never destination.
if re.search(r'Remove-TopLevelEmptyParagraphs\s+\$dest', ps):
    fail("destination blank-paragraph cleanup regression")

# Destructive Delete is allowed only inside the temporary paragraph-normalizer.
dest_delete = re.search(r'\$dest\.Run\("Delete"\)', ps)
if dest_delete:
    fail("destination Delete action regression")

if "Nested table-cell paragraphs use different List ids" not in ps:
    fail("nested-list safety explanation marker missing")


# v0.4.2 full-date normalization regression.
for marker in [
    "$fullDatePattern",
    '"{0}.{1}.{2}." -f',
    "$monthDayPattern",
]:
    if marker not in ps:
        fail(f"date-normalization PowerShell marker missing: {marker}")

smart = (ROOT / "smart_rules.py").read_text(encoding="utf-8")
if "FULL_DATE_RE" not in smart:
    fail("Python FULL_DATE_RE compatibility marker missing")

if not (ROOT / "date_normalization_check.py").exists():
    fail("date_normalization_check.py missing")

if errors:
    print("RELEASE CHECK FAILED")
    for error in errors:
        print(" - " + error)
    sys.exit(1)

print("RELEASE CHECK PASSED")
print(f"BAT/CMD checked: {len(bat_files)}")
print("non-ASCII byte = 0")
print("bare LF = 0")
print("CRLF only = OK")
print("chcp = 0")
print("activate.bat dependency = 0")
print("Python syntax = OK")
print("lossless HWP copy/paste architecture = OK")
print("destination destructive delete/rebuild = 0")
print("automatic duplicate deletion = 0")
print("PowerShell static delimiter balance = OK")
print("runtime Windows PowerShell Parser preflight = INCLUDED")
