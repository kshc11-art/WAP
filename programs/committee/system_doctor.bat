@echo off
setlocal
cd /d "%~dp0"
set "VENV_DIR=%LOCALAPPDATA%\KRISS_Committee_Automation\.venv"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"
if not exist "%VENV_PY%" call "install_windows.bat"
if errorlevel 1 exit /b 1
"%VENV_PY%" "%~dp0bootstrap_runtime.py" --prepare --quiet
if errorlevel 1 exit /b 1
"%VENV_PY%" "%~dp0doctor.py"
set "RC=%errorlevel%"
pause
exit /b %RC%
