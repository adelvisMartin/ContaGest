@echo off
setlocal
cd /d "%~dp0"

echo.
echo ==============================================================
echo  CONTROL HIPICO - WHATSAPP AUTONOMO SEGURO v1.6.0
echo ==============================================================
echo Modo autonomo habilitado SOLO en Control hipico lab.
echo El grupo SOURCE permanece SOLO LECTURA por el gate de politica.
echo Dinero, jugadas, saldos y cambios de carrera no reciben autoridad automatica.
echo Requiere IDs @g.us configurados con CONFIGURAR-GRUPOS-HIPICO.cmd.
echo.

call "%~dp0PROBAR-HIPICO-LAB.cmd"
exit /b %ERRORLEVEL%
