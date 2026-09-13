[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [ValidateSet('install','start','status','doctor','health','version','bridge','channel','groups','messages','events','trace')]
  [string]$Command = 'status',

  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$CommandArgs = @()
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $Root

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Error 'Control Hipico requiere Node 22.x instalado y disponible en PATH.'
  exit 2
}

$nodeVersion = (& node --version 2>$null)
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v22\.') {
  Write-Error "Control Hipico requiere Node 22.x. Detectado: $nodeVersion"
  exit 2
}

if ($Command -eq 'install') {
  Write-Host 'Instalando dependencias exactas del Bridge desde package-lock.json...'
  & npm ci --no-audit --no-fund
  exit $LASTEXITCODE
}

if ($Command -eq 'start') {
  if (-not (Test-Path -LiteralPath (Join-Path $Root 'node_modules'))) {
    Write-Error 'Faltan dependencias. Ejecuta primero: .\HIPICO.ps1 install'
    exit 2
  }
  & npm start
  exit $LASTEXITCODE
}

$Cli = Join-Path $Root 'src\cli\hipico-cli.mjs'
$Forward = @($Command) + @($CommandArgs)
& node --env-file-if-exists=.env $Cli @Forward
exit $LASTEXITCODE
