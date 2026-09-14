# -*- coding: utf-8 -*-
"""Release checks for Windows BAT/CMD launchers.

This validator is intentionally strict.  A release must not be packaged when a
BAT/CMD file violates the project's Windows launcher rules.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

BOM_PREFIXES = (b"\xef\xbb\xbf", b"\xff\xfe", b"\xfe\xff")
SCRIPT_EXTS = (".py", ".pyw", ".bat", ".cmd")


def _outside_quoted_text(line: str) -> str:
    out = []
    in_quote = False
    for ch in line:
        if ch == '"':
            in_quote = not in_quote
            out.append(' ')
        elif in_quote:
            out.append(' ')
        else:
            out.append(ch)
    return ''.join(out)


def _literal_local_target(token: str, root: Path) -> Path | None:
    t = token.strip().replace('/', '\\')
    low = t.lower()
    if not low.endswith(SCRIPT_EXTS):
        return None
    if t.startswith('%~dp0'):
        return root / t[5:].replace('\\', '/')
    if '%' in t:
        return None
    p = Path(t.replace('\\', '/'))
    if p.is_absolute():
        return p
    return root / p


def validate_batch(path: Path, root: Path) -> list[str]:
    errors: list[str] = []
    try:
        path.name.encode('ascii')
    except UnicodeEncodeError:
        errors.append('filename is not ASCII')

    data = path.read_bytes()
    if data.startswith(BOM_PREFIXES):
        errors.append('BOM is not allowed')
    non_ascii = sum(1 for b in data if b >= 0x80)
    if non_ascii:
        errors.append(f'non-ASCII bytes: {non_ascii}')

    bare_lf = len(re.findall(br'(?<!\r)\n', data))
    bare_cr = len(re.findall(br'\r(?!\n)', data))
    if bare_lf:
        errors.append(f'bare LF count: {bare_lf}')
    if bare_cr:
        errors.append(f'bare CR count: {bare_cr}')
    if data and not data.endswith(b'\r\n'):
        errors.append('file does not end with CRLF')

    try:
        text = data.decode('ascii')
    except UnicodeDecodeError:
        return errors

    low = text.lower()
    if re.search(r'(?im)^\s*chcp(?:\s|$)', text):
        errors.append('chcp is forbidden')
    if 'activate.bat' in low or 'activate.cmd' in low:
        errors.append('activate.bat/cmd dependency is forbidden')
    if 'cd /d "%~dp0"' not in low:
        errors.append('missing: cd /d "%~dp0"')

    # Explicit call targets must be quoted and exist when they are release-local.
    for lineno, raw in enumerate(text.splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith('::') or line.startswith(':'):
            continue
        lowline = line.lower()
        if lowline.startswith('rem ') or lowline.startswith('echo '):
            continue

        # call must always use a quoted target.
        m = re.match(r'(?i)^call\s+([^\s]+)', line)
        if m and not line.lower().startswith('call "'):
            errors.append(f'line {lineno}: call target is not quoted')

        # Remove all quoted spans; any path-looking token left is suspicious.
        outside = _outside_quoted_text(line)
        if re.search(r'%~dp0[^\s&|()]+', outside, re.I):
            errors.append(f'line {lineno}: %~dp0 path is not quoted')
        if re.search(r'%[A-Za-z_][A-Za-z0-9_]*%\\[^\s&|()]+', outside):
            errors.append(f'line {lineno}: environment path is not quoted')
        if re.search(r'(?i)(?:[A-Z]:\\|\\\\)[^\s&|()]+', outside):
            errors.append(f'line {lineno}: Windows path is not quoted')
        if re.search(r'(?i)(?<![-\w])[^\s"&|()]+\.(?:py|pyw|bat|cmd)(?!\w)', outside):
            errors.append(f'line {lineno}: executable/script path token is not quoted')

        # Validate explicit quoted local script/batch references.
        for token in re.findall(r'"([^"]+)"', line):
            target = _literal_local_target(token, root)
            if target is not None and not target.exists():
                errors.append(f'line {lineno}: referenced file does not exist: {token}')

    return errors


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('root', nargs='?', default='.')
    ns = ap.parse_args(argv)
    root = Path(ns.root).resolve()
    files = sorted([*root.rglob('*.bat'), *root.rglob('*.cmd')])
    if not files:
        print('BAT/CMD: FAIL - no launcher files found')
        return 1

    failed = False
    for path in files:
        errs = validate_batch(path, root)
        rel = path.relative_to(root)
        if errs:
            failed = True
            print(f'FAIL {rel}')
            for err in errs:
                print(f'  - {err}')
        else:
            data = path.read_bytes()
            print(f'PASS {rel} | bytes={len(data)} | non_ascii=0 | bare_lf=0 | CRLF=OK')

    if failed:
        print('RELEASE CHECK: FAIL')
        return 1
    print(f'RELEASE CHECK: PASS ({len(files)} BAT/CMD files)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
