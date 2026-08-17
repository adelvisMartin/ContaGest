@echo off
setlocal
cd /d "%~dp0"

echo.
echo Iniciando configuracion de Control Hipico WhatsApp Bridge...
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\hipico-whatsapp-bridge\setup-windows.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo La configuracion termino con error. Lee el mensaje anterior.
  pause
)

exit /b %EXIT_CODE%
