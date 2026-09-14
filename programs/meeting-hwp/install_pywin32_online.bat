@echo off
setlocal
cd /d "%~dp0"

set "VENV_PY=%~dp0.venv\Scripts\python.exe"

if not exist "%VENV_PY%" (
    call "%~dp0install_windows.bat"
    if errorlevel 1 exit /b 20
)

"%VENV_PY%" -m pip install --disable-pip-version-check "pywin32==312"
if errorlevel 1 (
    echo Failed to install pywin32. Internet access may be blocked.
    echo The app can still use the bundled PowerShell COM fallback.
    exit /b 21
)

exit /b 0
