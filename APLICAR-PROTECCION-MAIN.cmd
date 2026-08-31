@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\apply-main-protection-v97.ps1" %*
set "EXITCODE=%ERRORLEVEL%"
if not "%EXITCODE%"=="0" (
  echo.
  echo La proteccion no pudo verificarse. Revisa el mensaje anterior.
)
exit /b %EXITCODE%
