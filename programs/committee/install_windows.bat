@echo off
setlocal
cd /d "%~dp0"
set "VENV_DIR=%LOCALAPPDATA%\KRISS_Committee_Automation\.venv"
set "VENV_PY=%VENV_DIR%\Scripts\python.exe"
if exist "%VENV_PY%" goto verify
set "BOOT_PY="
for %%P in (py.exe) do set "BOOT_PY=%%~$PATH:P"
if defined BOOT_PY goto boot_with_py
for %%P in (python.exe) do set "BOOT_PY=%%~$PATH:P"
if defined BOOT_PY goto boot_with_python
echo [KRISS] Python 3 was not found.
exit /b 2

:boot_with_py
"%BOOT_PY%" -3 "%~dp0bootstrap_runtime.py" --prepare --quiet
if errorlevel 1 exit /b 1
goto verify

:boot_with_python
"%BOOT_PY%" "%~dp0bootstrap_runtime.py" --prepare --quiet
if errorlevel 1 exit /b 1

:verify
if not exist "%VENV_PY%" exit /b 3
"%VENV_PY%" "%~dp0bootstrap_runtime.py" --prepare --quiet
exit /b %errorlevel%
