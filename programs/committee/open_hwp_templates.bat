@echo off
setlocal
cd /d "%~dp0"
set "TPL=%~dp0resources\hwp_templates\2026_1"
if not exist "%TPL%" exit /b 1
start "" "%SystemRoot%\explorer.exe" "%TPL%"
exit /b %errorlevel%
