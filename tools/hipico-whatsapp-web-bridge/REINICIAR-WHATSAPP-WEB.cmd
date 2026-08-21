@echo off
chcp 65001 >nul
setlocal
title Control Hipico - Reparar WhatsApp Web
cd /d "%~dp0"
echo.
echo Esta accion AISLA el perfil dedicado de WhatsApp Web para volver a vincularlo.
echo Conserva token, colas, journal, logs e IDs vistos.
echo Cierra primero la ventana del Bridge.
echo.
set /p CONFIRM=Escribe SI para continuar:
if /I not "%CONFIRM%"=="SI" exit /b 0
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0REPARAR-WHATSAPP-WEB.ps1"
if not "%ERRORLEVEL%"=="0" (
  echo.
  echo No se pudo aislar el perfil. Confirma que el Bridge y Chrome controlado esten cerrados.
  pause
)
