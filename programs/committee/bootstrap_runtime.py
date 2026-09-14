# -*- coding: utf-8 -*-
"""Persistent Windows runtime bootstrapper for KRISS Committee Automation.

The runtime is shared across extracted releases under LOCALAPPDATA.  Batch
launchers never activate a virtual environment; they call the shared .venv's
python.exe/pythonw.exe directly.  A legacy v0.2.2-v0.2.5 runtime is reused by
creating a short LOCALAPPDATA .venv alias to it, avoiding a full reinstall.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import platform
import subprocess
import sys
import venv
from pathlib import Path

APP_DIR_NAME = "KRISS_Committee_Automation"
REQUIRED_IMPORTS = ("PyQt5", "xlsxwriter", "matplotlib")
if os.name == "nt":
    REQUIRED_IMPORTS += ("win32com.client", "pyhwpx")


def app_data_root() -> Path:
    if os.name == "nt":
        base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA")
        if base:
            return Path(base) / APP_DIR_NAME
    return Path.home() / ".kriss_committee_automation"


def venv_python(venv_dir: Path, windowed: bool = False) -> Path:
    if os.name == "nt":
        return venv_dir / "Scripts" / ("pythonw.exe" if windowed else "python.exe")
    return venv_dir / "bin" / "python"


def shared_venv_alias() -> Path:
    return app_data_root() / ".venv"


def legacy_venv_dir() -> Path:
    return app_data_root() / "runtime" / "venv"


def _same_target(a: Path, b: Path) -> bool:
    try:
        return a.resolve() == b.resolve()
    except OSError:
        return False


def _create_dir_alias(alias: Path, target: Path) -> bool:
    """Create an alias directory; on Windows prefer a junction."""
    alias.parent.mkdir(parents=True, exist_ok=True)
    if alias.exists() or os.path.lexists(alias):
        return _same_target(alias, target)
    try:
        if os.name == "nt":
            comspec = os.environ.get("COMSPEC") or str(
                Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32" / "cmd.exe"
            )
            cp = subprocess.run(
                [comspec, "/d", "/c", "mklink", "/J", str(alias), str(target)],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
            )
            return cp.returncode == 0 and venv_python(alias).exists()
        alias.symlink_to(target, target_is_directory=True)
        return venv_python(alias).exists()
    except OSError:
        return False


def requirements_fingerprint(req: Path) -> str:
    h = hashlib.sha256()
    h.update(req.read_bytes())
    h.update(
        f"py={sys.version_info.major}.{sys.version_info.minor};arch={platform.machine()};os={os.name}".encode()
    )
    return h.hexdigest()


def imports_ok(py: Path) -> bool:
    code = "; ".join(f"import {name}" for name in REQUIRED_IMPORTS)
    try:
        cp = subprocess.run(
            [str(py), "-c", code],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return cp.returncode == 0
    except OSError:
        return False


def ensure_runtime(project_dir: Path, quiet: bool = False) -> Path:
    req = project_dir / "requirements.txt"
    if not req.exists():
        raise RuntimeError(f"requirements.txt not found: {req}")

    root = app_data_root()
    alias = shared_venv_alias()
    legacy = legacy_venv_dir()
    root.mkdir(parents=True, exist_ok=True)

    # Reuse the v0.2.2-v0.2.5 runtime without reinstalling it from scratch.
    if not venv_python(alias).exists() and venv_python(legacy).exists():
        if not _create_dir_alias(alias, legacy):
            raise RuntimeError("Could not create the shared .venv alias for the existing runtime.")

    py = venv_python(alias)
    if not py.exists():
        if not quiet:
            print(f"[KRISS] Preparing shared runtime: {alias}")
        venv.EnvBuilder(with_pip=True, clear=False).create(alias)

    stamp = root / "requirements.sha256"
    legacy_stamp = root / "runtime" / "requirements.sha256"
    if not stamp.exists() and legacy_stamp.exists():
        try:
            stamp.write_text(legacy_stamp.read_text(encoding="utf-8"), encoding="utf-8")
        except OSError:
            pass

    expected = requirements_fingerprint(req)
    current = stamp.read_text(encoding="utf-8").strip() if stamp.exists() else ""
    need_install = current != expected or not imports_ok(py)
    if need_install:
        if not quiet:
            print("[KRISS] Checking and installing required Python packages...")
        cp = subprocess.run(
            [str(py), "-m", "pip", "install", "--disable-pip-version-check", "-r", str(req)],
            cwd=str(project_dir),
        )
        if cp.returncode != 0:
            raise RuntimeError("Python package installation failed.")
        if not imports_ok(py):
            raise RuntimeError("Runtime import validation failed after installation.")
        stamp.write_text(expected, encoding="utf-8")
        if not quiet:
            print("[KRISS] Shared runtime is ready.")
    elif not quiet:
        print(f"[KRISS] Reusing shared runtime: {alias}")
    return py


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prepare", action="store_true")
    ap.add_argument("--print-python", action="store_true")
    ap.add_argument("--quiet", action="store_true")
    ns = ap.parse_args(argv)
    project = Path(__file__).resolve().parent
    try:
        py = ensure_runtime(project, quiet=ns.quiet or ns.print_python)
    except Exception as e:
        print(f"[KRISS] Runtime preparation failed: {e}")
        return 1
    if ns.print_python:
        print(py)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
