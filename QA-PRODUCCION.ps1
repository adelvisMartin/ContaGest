param([switch]$SkipBrowser,[switch]$SkipAndroid)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
$OutputEncoding=[System.Text.UTF8Encoding]::new($false)

function Fail([string]$Message){Write-Host "`n$Message" -ForegroundColor Red; exit 1}
function Find-Node{
  try{$cmd=Get-Command node.exe -ErrorAction SilentlyContinue;if($cmd){return $cmd.Source}}catch{}
  foreach($candidate in @(
    (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe')
  )){if(Test-Path -LiteralPath $candidate){return $candidate}}
  return $null
}

$root=Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
$node=Find-Node
if(-not $node){Fail 'Falta Node.js 22 LTS.'}
$nodeDir=Split-Path -Parent $node
$env:PATH="$nodeDir;$env:PATH"
$major=[int]((& $node -p "process.versions.node").Split('.')[0])
if($major -ne 22){Fail 'ContaGest requiere Node.js 22.x para el gate reproducible.'}
$npm=Join-Path $nodeDir 'npm.cmd'
if(-not (Test-Path $npm)){Fail 'No encuentro npm.cmd.'}

Write-Host '=== ContaGest + Control Hípico · QA local de producción ===' -ForegroundColor Cyan
Write-Host 'Este script NO hace deploy, merge, migraciones ni firma release.' -ForegroundColor DarkGray

& $npm ci --no-audit --no-fund
if($LASTEXITCODE -ne 0){Fail 'npm ci falló.'}

$args=@('scripts/production-readiness.mjs')
if(-not $SkipBrowser -and -not $SkipAndroid){$args+='--full'}
elseif(-not $SkipBrowser){$args+='--browser'}
elseif(-not $SkipAndroid){$args+='--android'}
& $node @args
$code=$LASTEXITCODE

Write-Host "`nReportes:" -ForegroundColor Cyan
Write-Host '  artifacts\qa\production-readiness.md'
Write-Host '  artifacts\qa\production-readiness.json'
if(-not $SkipAndroid){
  Write-Host 'APK (si JDK/Android SDK están disponibles y el build pasa):' -ForegroundColor Cyan
  Write-Host '  android\hipico-control-v1130\artifacts\Hipico-Control-v1.13.0-rc2-debug.apk'
  Write-Host '  android\hipico-control-v1130\artifacts\SHA256SUMS.txt'
  Write-Host '  android\hipico-control-v1130\artifacts\QA_APK_METADATA.json'
}
exit $code
