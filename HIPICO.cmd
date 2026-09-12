@echo off
setlocal
node "%~dp0tools\hipico-cli\hipico.mjs" %*
exit /b %ERRORLEVEL%
