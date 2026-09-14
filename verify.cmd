@echo off
setlocal
cd /d "%~dp0"
if defined WAP_PYTHON goto custom
where py >nul 2>nul
if errorlevel 1 goto fallback
py -3 "validation\run.py" %*
exit /b %errorlevel%
:custom
"%WAP_PYTHON%" "validation\run.py" %*
exit /b %errorlevel%
:fallback
python "validation\run.py" %*
exit /b %errorlevel%
