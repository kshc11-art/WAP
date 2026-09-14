@echo off
setlocal
cd /d "%~dp0"

set "APP_PY=%~dp0hwp_meeting_merger.py"
set "VENV_PYW=%~dp0.venv\Scripts\pythonw.exe"
set "VENV_PY=%~dp0.venv\Scripts\python.exe"

if exist "%VENV_PYW%" (
    "%VENV_PYW%" "%APP_PY%"
    exit /b %errorlevel%
)

where pyw.exe >nul 2>nul
if not errorlevel 1 (
    "pyw.exe" -3 "%APP_PY%"
    exit /b %errorlevel%
)

where pythonw.exe >nul 2>nul
if not errorlevel 1 (
    "pythonw.exe" "%APP_PY%"
    exit /b %errorlevel%
)

where py.exe >nul 2>nul
if not errorlevel 1 (
    "py.exe" -3 "%APP_PY%"
    exit /b %errorlevel%
)

where python.exe >nul 2>nul
if not errorlevel 1 (
    "python.exe" "%APP_PY%"
    exit /b %errorlevel%
)

echo Python 3 was not found. See README.txt.
exit /b 10
