@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo Virtual environment not found. Running install_windows.bat first...
  call "install_windows.bat"
  if errorlevel 1 (
    echo [ERROR] Installation failed.
    pause
    exit /b 1
  )
)

echo Running step-by-step Microsoft Excel Native self-test...
echo The test prints each stage and has a 180-second timeout.
echo.
".venv\Scripts\python.exe" -u "tools\native_excel_selftest.py"
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
  echo [PASS] Excel Native self-test completed successfully.
) else (
  echo [FAIL] Excel Native self-test returned error code %RC%.
  echo Send the full console output to the maintainer.
)
pause
exit /b %RC%
