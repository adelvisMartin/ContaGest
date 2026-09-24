@echo off
setlocal
cd /d "%~dp0"

echo.
echo ==============================================================
echo  CONTROL HIPICO - WHATSAPP AUTONOMO v1.5.0
echo ==============================================================
echo Responde en el grupo SOURCE solo con autorizacion del backend.
echo Dinero, jugadas, saldos y cambios de carrera siguen sin autoridad automatica.
echo Requiere IDs @g.us configurados y backend en safe-auto.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\hipico-whatsapp-web-bridge\INICIAR.ps1" -EnableSourceAutoReply
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo El modo autonomo no supero preflight o termino con error.
  echo Revisa el mensaje anterior y health.json. No se fuerza ningun envio.
  pause
)

exit /b %EXIT_CODE%
