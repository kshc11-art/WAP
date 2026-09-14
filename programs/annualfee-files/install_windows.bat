@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "PY_CMD="
where py >nul 2>&1
if not errorlevel 1 set "PY_CMD=py -3"
if not defined PY_CMD (
  where python >nul 2>&1
  if not errorlevel 1 set "PY_CMD=python"
)
if not defined PY_CMD (
  echo [ERROR] Python 3 was not found.
  echo Install Python 3.11 or newer, then run this file again.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo [1/4] Creating Python virtual environment...
  %PY_CMD% -m venv ".venv"
  if errorlevel 1 (
    echo [ERROR] Failed to create .venv
    pause
    exit /b 1
  )
)

if not exist ".venv\Scripts\python.exe" (
  echo [ERROR] .venv\Scripts\python.exe was not created.
  pause
  exit /b 1
)

set "VENV_PY=.venv\Scripts\python.exe"

echo [2/4] Upgrading pip...
"%VENV_PY%" -m pip install --upgrade pip
if errorlevel 1 (
  echo [ERROR] pip upgrade failed.
  pause
  exit /b 1
)

echo [3/4] Installing required packages...
"%VENV_PY%" -m pip install -r "requirements.txt"
if errorlevel 1 (
  echo [ERROR] Package installation failed.
  pause
  exit /b 1
)

echo [4/4] Checking pywin32...
"%VENV_PY%" -c "import win32com.client, pythoncom; print('pywin32 OK')"
if errorlevel 1 (
  echo [ERROR] pywin32 check failed.
  pause
  exit /b 1
)

echo.
echo Installation completed successfully.
echo Microsoft Excel Desktop is required for operational XLSX generation.
echo Next: run native_excel_selftest.bat
pause
exit /b 0
