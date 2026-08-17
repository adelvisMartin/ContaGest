@echo off
chcp 65001 >nul
setlocal
title Control Hipico - WhatsApp Web Bridge v1.3.0
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INICIAR.ps1"
if not "%ERRORLEVEL%"=="0" (
  echo.
  echo El Bridge termino con error.
  echo Si existen, envia data\bridge.log, data\history-sync-report.json y data\last-error.png.
  pause
)
