$ErrorActionPreference = 'Stop'
$bridge = Join-Path $PSScriptRoot 'tools\hipico-whatsapp-bridge'
if (-not (Test-Path -LiteralPath (Join-Path $bridge 'package.json') -PathType Leaf)) {
  Write-Error 'No se encontró tools\hipico-whatsapp-bridge\package.json.'
  exit 2
}
Push-Location $bridge
try {
  npm ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host 'Dependencias del Bridge instaladas. El inicio diario no vuelve a ejecutar npm ci.'
  Write-Host 'Usa HIPICO.ps1 o HIPICO.cmd para operaciones del CLI y el launcher propio del Bridge para la sesión WhatsApp.'
} finally {
  Pop-Location
}
