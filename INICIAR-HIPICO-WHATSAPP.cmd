@echo off
setlocal
cd /d "%~dp0"

echo.
echo ==============================================================
echo  CONTROL HIPICO - WHATSAPP BRIDGE v1.5.0
echo ==============================================================
echo Modo normal: fuente SOLO LECTURA. Para autonomia use INICIAR-HIPICO-AUTONOMO.cmd.
echo Para configurar IDs de grupos use CONFIGURAR-GRUPOS-HIPICO.cmd.
echo Para QA automatizado en LAB use PROBAR-HIPICO-LAB.cmd.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\hipico-whatsapp-web-bridge\INICIAR.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo El Bridge termino con error. Lee el mensaje anterior y health.json.
  pause
)

exit /b %EXIT_CODE%
