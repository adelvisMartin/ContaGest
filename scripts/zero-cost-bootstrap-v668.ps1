$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'zero-cost-bootstrap-v668.mjs'
& node $scriptPath @args
exit $LASTEXITCODE
