@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo [ERROR] Virtual environment not found. Run install_windows.bat first.
  pause
  exit /b 1
)

set /p "INPUT=Current-quarter input folder: "
set /p "HISTORY=History folder (optional, press Enter to skip): "
set /p "MASTER=Budget master file/folder (optional, press Enter to skip): "
set /p "OUTPUT=Output folder: "

set "VENV_PY=.venv\Scripts\python.exe"
if "%HISTORY%"=="" (
  if "%MASTER%"=="" (
    "%VENV_PY%" "run.py" prepare --input "%INPUT%" --output "%OUTPUT%"
  ) else (
    "%VENV_PY%" "run.py" prepare --input "%INPUT%" --budget-master "%MASTER%" --output "%OUTPUT%"
  )
) else (
  if "%MASTER%"=="" (
    "%VENV_PY%" "run.py" prepare --input "%INPUT%" --history "%HISTORY%" --output "%OUTPUT%"
  ) else (
    "%VENV_PY%" "run.py" prepare --input "%INPUT%" --history "%HISTORY%" --budget-master "%MASTER%" --output "%OUTPUT%"
  )
)

set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" echo [ERROR] prepare failed with exit code %RC%.
pause
exit /b %RC%
