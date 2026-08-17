@echo off
chcp 65001 >nul
setlocal
title Control Hipico - Reiniciar WhatsApp Web
cd /d "%~dp0"
echo.
echo Esto borra SOLO el perfil local usado por WhatsApp Web.
echo NO borra el token protegido de Control Hipico ni toca Vercel.
echo.
set /p CONFIRM=Escribe SI para continuar: 
if /I not "%CONFIRM%"=="SI" exit /b 0
if exist "data\chrome-profile" rmdir /s /q "data\chrome-profile"
echo.
echo Perfil eliminado. Ejecuta INICIAR-CONTROL-HIPICO-WHATSAPP.cmd para vincular otra vez.
pause
