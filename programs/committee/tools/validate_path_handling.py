# -*- coding: utf-8 -*-
"""Path-handling smoke test for spaces, Korean text, and long paths.

The Windows batch launchers keep the shared .venv under LOCALAPPDATA, while
release-local scripts are addressed through quoted %~dp0 paths. This test
exercises the runtime alias helper with Unicode/space/long paths without
requiring Hancom Office.
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import bootstrap_runtime as br  # noqa: E402


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="kriss_path_") as tmp:
        base = Path(tmp)
        target = base / "shared runtime 한글 with spaces" / ("long_target_" * 6)
        py = br.venv_python(target)
        py.parent.mkdir(parents=True)
        py.write_bytes(b"stub")

        alias = base / "alias 한글 with spaces" / ("long_alias_" * 5) / ".venv"
        ok = br._create_dir_alias(alias, target)
        alias_py = br.venv_python(alias)
        if not ok or not alias_py.exists():
            print("FAIL: runtime alias is not usable")
            return 1

        release = base / "KRISS 한글 설치 폴더 with spaces"
        for i in range(8):
            release = release / (f"long release segment {i:02d} 한글 " + "x" * 24)
        release.mkdir(parents=True)
        script = release / "run_gui.pyw"
        script.write_text("pass\n", encoding="utf-8")
        if not script.exists():
            print("FAIL: release-local Unicode/space/long path")
            return 1
        if " " not in str(release) or "한글" not in str(release) or len(str(release)) < 260:
            print("FAIL: test path did not exercise spaces+Korean+260+ path forms")
            return 1

        print(
            f"Path handling smoke: PASS "
            f"(release_length={len(str(release))}, alias_length={len(str(alias))})"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
