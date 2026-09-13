@echo off
setlocal
set "CLI=%~dp0tools\hipico-cli\hipico.mjs"
if not exist "%CLI%" (
  echo No se encontro tools\hipico-cli\hipico.mjs. Ejecuta HIPICO-SETUP.ps1 desde la raiz del repositorio. 1>&2
  exit /b 2
)
node "%CLI%" %*
exit /b %ERRORLEVEL%
