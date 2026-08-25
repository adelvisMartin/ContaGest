@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo ================================================================
echo  CONTROL HIPICO - COMPARACION REAL ^> LAB (LOCAL)
echo ================================================================
echo Fuente: CLUB HIPICO TRIPLE CROWN - SOLO LECTURA.
echo Destino de escritura: Control hipico lab - UNICAMENTE.
echo Backend/Vercel: NO requerido para esta prueba.
echo Dinero, saldos, cierres y resultados reales: SIN ESCRITURA.
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\hipico-whatsapp-web-bridge\INICIAR-LAB-LOCAL.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo La prueba LAB termino con error.
  echo Revisa %%LOCALAPPDATA%%\ControlHipicoBridge\data\bridge.log
  echo y %%LOCALAPPDATA%%\ControlHipicoBridge\data\health.json
  pause
)
exit /b %EXIT_CODE%
