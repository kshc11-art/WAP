# -*- coding: utf-8 -*-
"""Hancom HWP Automation security approval module registration helper."""

from __future__ import annotations

import os
from pathlib import Path
import shutil
from typing import List, Tuple


REG_PATH = r"Software\HNC\HwpAutomation\Modules"
DEFAULT_MODULE_NAME = "FilePathCheckerModuleExample"


def _winreg():
    if os.name != "nt":
        return None
    import winreg
    return winreg


def list_registered_modules(valid_only: bool = False) -> List[Tuple[str, str]]:
    winreg = _winreg()
    if winreg is None:
        return []

    items: List[Tuple[str, str]] = []
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, REG_PATH) as key:
            index = 0
            while True:
                try:
                    name, value, _ = winreg.EnumValue(key, index)
                except OSError:
                    break
                index += 1
                value = str(value)
                if valid_only and not Path(value).is_file():
                    continue
                items.append((name, value))
    except OSError:
        return []

    return items


def preferred_module_names() -> List[str]:
    names = [name for name, _ in list_registered_modules(valid_only=True)]
    for fallback in (DEFAULT_MODULE_NAME, "SecurityModule"):
        if fallback not in names:
            names.append(fallback)
    return names


def security_module_status() -> Tuple[bool, str]:
    modules = list_registered_modules(valid_only=True)
    if not modules:
        return False, "미등록"
    return True, f"등록됨 ({modules[0][0]})"


def register_security_dll(source_dll: Path) -> Tuple[str, Path]:
    """Copy selected DLL to LOCALAPPDATA and register it under HKCU.

    HKCU registration does not normally require administrator elevation.
    """
    winreg = _winreg()
    if winreg is None:
        raise RuntimeError("Windows에서만 보안모듈을 등록할 수 있습니다.")

    source_dll = Path(source_dll).resolve()
    if not source_dll.is_file() or source_dll.suffix.lower() != ".dll":
        raise ValueError("한컴 Automation 보안모듈 DLL을 선택하세요.")

    local_appdata = os.environ.get("LOCALAPPDATA")
    if not local_appdata:
        local_appdata = str(Path.home() / "AppData" / "Local")

    target_dir = Path(local_appdata) / "HwpMeetingMerger" / "security"
    target_dir.mkdir(parents=True, exist_ok=True)

    target = target_dir / source_dll.name
    if source_dll != target:
        shutil.copy2(source_dll, target)

    module_name = source_dll.stem or DEFAULT_MODULE_NAME

    # The official sample is expected to be registered using this value name.
    if source_dll.name.lower() == "filepathcheckermoduleexample.dll":
        module_name = DEFAULT_MODULE_NAME

    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, REG_PATH) as key:
        winreg.SetValueEx(key, module_name, 0, winreg.REG_SZ, str(target))

    return module_name, target


def auto_register_local_example(app_root: Path) -> Tuple[bool, str]:
    """Register a locally bundled/copied example DLL if one is present."""
    if os.name != "nt":
        return False, ""

    for candidate in (
        Path(app_root) / "FilePathCheckerModuleExample.dll",
        Path(app_root) / "security_module" / "FilePathCheckerModuleExample.dll",
    ):
        if candidate.is_file():
            try:
                name, target = register_security_dll(candidate)
                return True, f"{name}: {target}"
            except Exception:
                pass

    return False, ""
