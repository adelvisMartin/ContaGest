@echo off
chcp 65001 >nul
setlocal
title Control Hipico - WhatsApp Web Bridge v1.4.0
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INICIAR.ps1"
if not "%ERRORLEVEL%"=="0" (
  echo.
  echo El Bridge termino con error.
  echo Revisa %%LOCALAPPDATA%%\ControlHipicoBridge\data\bridge.log y last-error.png.
  pause
)
