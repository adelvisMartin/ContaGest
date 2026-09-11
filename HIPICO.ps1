$ErrorActionPreference = 'Stop'
$script = Join-Path $PSScriptRoot 'tools\hipico-cli\hipico.mjs'
& node $script @args
exit $LASTEXITCODE
