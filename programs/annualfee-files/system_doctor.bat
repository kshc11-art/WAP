@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo [ERROR] Python virtual environment not found.
  echo Run install_windows.bat first.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -u "tools\system_doctor.py"
pause
