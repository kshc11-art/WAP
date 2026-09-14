@echo off
setlocal
cd /d "%~dp0"
set "VENV_DIR=%LOCALAPPDATA%\KRISS_Committee_Automation\.venv"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"
set "VENV_PYW=%VENV_DIR%\Scripts\pythonw.exe"
if not exist "%VENV_PY%" call "install_windows.bat"
if errorlevel 1 exit /b 1
"%VENV_PY%" "%~dp0bootstrap_runtime.py" --prepare --quiet
if errorlevel 1 exit /b 1
if not exist "%VENV_PYW%" exit /b 2
start "" "%VENV_PYW%" "%~dp0run_gui.pyw"
exit /b %errorlevel%
