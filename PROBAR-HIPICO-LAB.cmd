@echo off
setlocal
cd /d "%~dp0"

echo.
echo ==============================================================
echo  CONTROL HIPICO - QA AUTOMATIZADO EN LAB
echo ==============================================================
echo REQUISITO: ejecutar antes CONFIGURAR-GRUPOS-HIPICO.cmd.
echo El Bridge verificara nombre + ID @g.us antes de cada envio.
echo El grupo fuente permanece SOLO LECTURA.
echo Las operaciones monetarias reales permanecen BLOQUEADAS.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\hipico-whatsapp-web-bridge\INICIAR.ps1" -EnableLabSend -EnableLabInput
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo La prueba LAB termino con error. Revisa el mensaje y health.json.
  pause
)
exit /b %EXIT_CODE%
