$ErrorActionPreference = 'Stop'
$cli = Join-Path $PSScriptRoot 'tools\hipico-cli\hipico.mjs'
if (-not (Test-Path -LiteralPath $cli -PathType Leaf)) {
  Write-Error 'No se encontró tools\hipico-cli\hipico.mjs. Ejecuta HIPICO-SETUP.ps1 desde la raíz del repositorio.'
  exit 2
}
& node $cli @args
exit $LASTEXITCODE
