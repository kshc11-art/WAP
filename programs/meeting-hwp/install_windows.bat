@echo off
setlocal
cd /d "%~dp0"

set "VENV_DIR=%~dp0.venv"
set "VENV_PY=%~dp0.venv\Scripts\python.exe"

if exist "%VENV_PY%" exit /b 0

where py.exe >nul 2>nul
if not errorlevel 1 (
    "py.exe" -3 -m venv "%VENV_DIR%"
    goto check_venv
)

where python.exe >nul 2>nul
if not errorlevel 1 (
    "python.exe" -m venv "%VENV_DIR%"
    goto check_venv
)

echo Python 3 was not found. See README.txt.
exit /b 10

:check_venv
if not exist "%VENV_PY%" (
    echo Failed to create the virtual environment. See README.txt.
    exit /b 11
)

exit /b 0
