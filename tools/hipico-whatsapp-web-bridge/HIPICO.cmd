@echo off
setlocal

where pwsh >nul 2>nul
if errorlevel 1 (
  echo ERROR: Control Hipico requiere PowerShell 7+ ^(pwsh^).
  exit /b 2
)

pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0HIPICO.ps1" %*
exit /b %ERRORLEVEL%
