@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist ".venv\Scripts\pythonw.exe" (
  echo Virtual environment not found. Running install_windows.bat first...
  call "install_windows.bat"
  if errorlevel 1 exit /b 1
)

start "" ".venv\Scripts\pythonw.exe" "run_gui.pyw"
exit /b 0
