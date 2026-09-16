$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot 'tools\hipico-whatsapp-web-bridge\INICIAR.ps1'
if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) {
  Write-Error 'No se encontró tools\hipico-whatsapp-web-bridge\INICIAR.ps1.'
  exit 2
}

Write-Host 'Preparando Control Hípico WhatsApp Web Bridge...' -ForegroundColor Cyan
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $launcher -SetupOnly
$code = $LASTEXITCODE
if ($code -ne 0) { exit $code }

Write-Host ''
Write-Host 'Setup completado.' -ForegroundColor Green
Write-Host 'Inicio diario: INICIAR-HIPICO-WHATSAPP.cmd' -ForegroundColor Green
Write-Host 'CLI operativa: HIPICO.ps1 o HIPICO.cmd' -ForegroundColor Green
exit 0
