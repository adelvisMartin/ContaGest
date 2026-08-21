@echo off
setlocal
cd /d "%~dp0"

echo.
echo ==============================================================
echo  CONTROL HIPICO - BINDING SEGURO DE GRUPOS WHATSAPP
echo ==============================================================
echo Este asistente NO envia mensajes.
echo Captura los IDs estables del grupo fuente y del LAB.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\hipico-whatsapp-web-bridge\INICIAR.ps1" -CaptureGroupIds
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo El binding termino con error. Lee el mensaje anterior.
  pause
)
exit /b %EXIT_CODE%
