@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo Virtual environment not found. Running install_windows.bat first...
  call "install_windows.bat"
  if errorlevel 1 exit /b 1
)

set "VENV_PY=.venv\Scripts\python.exe"
"%VENV_PY%" -m pip install --upgrade pyinstaller
if errorlevel 1 exit /b 1

"%VENV_PY%" -m PyInstaller --noconfirm --clean --onefile --windowed ^
  --name "KRISS_Annual_Fee_Automation" ^
  --collect-all tkinterdnd2 ^
  --hidden-import win32com ^
  --hidden-import win32com.client ^
  --hidden-import pythoncom ^
  --hidden-import pywintypes ^
  "run_gui.pyw"
if errorlevel 1 (
  echo [ERROR] EXE build failed.
  pause
  exit /b 1
)

echo.
echo Build complete: dist\KRISS_Annual_Fee_Automation.exe
pause
exit /b 0
