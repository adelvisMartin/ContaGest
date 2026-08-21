param([switch]$RuntimeMode,[switch]$EnableLabSend)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$Version = '1.4.0'
$LabGroupName = 'Control h' + [char]0x00ED + 'pico lab'

function Fail([string]$Message) {
  Write-Host ''
  Write-Host $Message -ForegroundColor Red
  Write-Host ''
  Read-Host 'Presiona ENTER para cerrar'
  exit 1
}

function Find-NodeExe {
  $candidates = @()
  try {
    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($command) { $candidates += $command.Source }
  } catch {}
  $candidates += @(
    (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'),
    (Join-Path $env:LOCALAPPDATA 'nodejs\node.exe')
  )
  foreach ($candidate in $candidates | Select-Object -Unique) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
  }
  return $null
}

function Assert-ChildPath([string]$Parent,[string]$Child) {
  $parentFull = [IO.Path]::GetFullPath($Parent).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
  $childFull = [IO.Path]::GetFullPath($Child)
  if (-not $childFull.StartsWith($parentFull,[StringComparison]::OrdinalIgnoreCase)) {
    throw "Ruta fuera del directorio autorizado: $childFull"
  }
  return $childFull
}

function Copy-Runtime([string]$Source,[string]$Destination) {
  $baseDir = Split-Path -Parent $Destination
  $destinationFull = Assert-ChildPath $baseDir $Destination
  New-Item -ItemType Directory -Force -Path $destinationFull | Out-Null
  foreach ($dir in @('src','tests')) {
    $src = Join-Path $Source $dir
    $dst = Join-Path $destinationFull $dir
    if (Test-Path -LiteralPath $src) {
      New-Item -ItemType Directory -Force -Path $dst | Out-Null
      Copy-Item -Path (Join-Path $src '*') -Destination $dst -Recurse -Force
    }
  }
  foreach ($file in @('package.json','package-lock.json','.env.example','VERSION','INICIAR.ps1','QA_REPORT.md','README.md')) {
    $src = Join-Path $Source $file
    if (Test-Path -LiteralPath $src) { Copy-Item -LiteralPath $src -Destination (Join-Path $destinationFull $file) -Force }
  }
}

function Save-ProtectedToken([string]$Token,[string]$TokenPath) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $TokenPath) | Out-Null
  $secure = ConvertTo-SecureString $Token -AsPlainText -Force
  $protected = ConvertFrom-SecureString $secure
  [IO.File]::WriteAllText($TokenPath,$protected,[Text.UTF8Encoding]::new($false))
}

function Load-ProtectedToken([string]$TokenPath) {
  if (-not (Test-Path -LiteralPath $TokenPath)) { return $null }
  try {
    $protected = Get-Content -LiteralPath $TokenPath -Raw
    $secure = ConvertTo-SecureString $protected
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  } catch { return $null }
}

function New-BridgeToken([string]$NodeExe) {
  return (& $NodeExe -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")
}

$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$baseDir = Join-Path $env:LOCALAPPDATA 'ControlHipicoBridge'
$runtimeRoot = Join-Path $baseDir "runtime-v$Version"
$dataDir = Join-Path $baseDir 'data'

if (-not $RuntimeMode) {
  try { Copy-Runtime $sourceRoot $runtimeRoot }
  catch { Fail "No pude preparar el runtime de usuario en $runtimeRoot. Error: $($_.Exception.Message)" }
  $runtimeArgs = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $runtimeRoot 'INICIAR.ps1'),'-RuntimeMode')
  if ($EnableLabSend) { $runtimeArgs += '-EnableLabSend' }
  & powershell.exe @runtimeArgs
  exit $LASTEXITCODE
}

$runtimeRoot = Assert-ChildPath $baseDir $runtimeRoot
$dataDir = Assert-ChildPath $baseDir $dataDir
$profileDir = Assert-ChildPath $dataDir (Join-Path $dataDir 'chrome-profile')
$profileResetFlag = Assert-ChildPath $dataDir (Join-Path $dataDir 'profile-reset-required.flag')
$envPath = Assert-ChildPath $runtimeRoot (Join-Path $runtimeRoot '.env')
$tokenPath = Join-Path (Join-Path $env:APPDATA 'ControlHipico') 'bridge-token.dpapi'

Set-Location $runtimeRoot
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

function Quarantine-BridgeProfile([string]$Reason) {
  if (-not (Test-Path -LiteralPath $profileDir)) {
    Remove-Item -LiteralPath $profileResetFlag -Force -ErrorAction SilentlyContinue
    return
  }
  $target = Assert-ChildPath $dataDir (Join-Path $dataDir ("chrome-profile-corrupt-" + (Get-Date -Format 'yyyyMMdd-HHmmss')))
  Write-Host "Aislando perfil dedicado: $Reason" -ForegroundColor Yellow
  Move-Item -LiteralPath $profileDir -Destination $target
  Remove-Item -LiteralPath $profileResetFlag -Force -ErrorAction SilentlyContinue
  Write-Host "Perfil anterior preservado en: $target" -ForegroundColor Green
}

Write-Host ''
Write-Host '==============================================================' -ForegroundColor Cyan
Write-Host " CONTROL HÍPICO - WHATSAPP WEB BRIDGE v$Version" -ForegroundColor Cyan
Write-Host ' PRODUCCIÓN · BACKEND PERSISTENTE · FUENTE SOLO LECTURA' -ForegroundColor Cyan
Write-Host '==============================================================' -ForegroundColor Cyan
Write-Host "Datos, perfil y colas preservados en: $dataDir" -ForegroundColor DarkGray
Write-Host ''

$nodeExe = Find-NodeExe
if (-not $nodeExe) { Fail 'No encuentro Node.js 22 LTS.' }
$nodeDir = Split-Path -Parent $nodeExe
$env:PATH = "$nodeDir;$env:PATH"
$npmCmd = Join-Path $nodeDir 'npm.cmd'
if (-not (Test-Path -LiteralPath $npmCmd)) { Fail 'No encuentro npm.cmd junto a Node.js.' }
$nodeVersion = & $nodeExe -p "process.versions.node"
$nodeMajor = [int]($nodeVersion.Split('.')[0])
if ($nodeMajor -ne 22) { Fail "Se requiere Node.js 22 LTS. Detectado: v$nodeVersion" }
Write-Host "Node.js v$nodeVersion - OK" -ForegroundColor Green

$token = Load-ProtectedToken $tokenPath
if ([string]::IsNullOrWhiteSpace($token)) {
  $token = New-BridgeToken $nodeExe
  if ([string]::IsNullOrWhiteSpace($token) -or $token.Length -lt 32) { Fail 'No pude generar un token seguro.' }
  Save-ProtectedToken $token $tokenPath
  Write-Host 'Token DPAPI nuevo creado. Debe configurarse en Vercel antes de iniciar producción.' -ForegroundColor Yellow
} else {
  Write-Host 'Token DPAPI existente cargado sin exponerlo.' -ForegroundColor Green
}

$dataForEnv = ($dataDir -replace '\\','/')
$labSendValue = if ($EnableLabSend) { 'true' } else { 'false' }
$envText = @"
HIPICO_RUNTIME_MODE=production
HIPICO_BACKEND_SYNC_ENABLED=true
HIPICO_INGEST_URL=https://conta-gest-frontend.vercel.app/api/v1/hipico-bot/bridge/events
HIPICO_BRIDGE_HEALTH_URL=https://conta-gest-frontend.vercel.app/api/v1/hipico-bot/bridge/health
HIPICO_GROUP_BRIDGE_TOKEN=$token
HIPICO_DATA_DIR=$dataForEnv
HIPICO_SOURCE_GROUP_MATCHES=CLUB HIPICO TRIPLE COWN|CLUB HIPICO TRIPLE CROWN
HIPICO_SOURCE_CHANNEL_KEY=club-hipico-triple-crown-official
HIPICO_LAB_GROUP_NAME=$LabGroupName
HIPICO_LAB_CHANNEL_KEY=control-hipico-lab
HIPICO_LAB_SEND_ENABLED=$labSendValue
HIPICO_POLL_MS=1000
HIPICO_BACKEND_TIMEOUT_MS=15000
HIPICO_BACKEND_MAX_RPS=4
HIPICO_BACKEND_MAX_PER_FLUSH=20
HIPICO_BACKEND_BASE_BACKOFF_MS=5000
HIPICO_BACKEND_MAX_BACKOFF_MS=900000
HIPICO_TRAINING_JOURNAL_ENABLED=true
HIPICO_DIAGNOSTIC_SCREENSHOTS_ENABLED=false
HIPICO_SOURCE_BASELINE_IGNORE_HISTORY=true
HIPICO_LAB_TEST_INPUT_ENABLED=true
HIPICO_LAB_TEST_POLL_MS=5000
HIPICO_LAB_TEST_BOOTSTRAP_LIMIT=8
HIPICO_REPORT_INCLUDE_SAMPLES=false
"@
[IO.File]::WriteAllText($envPath,$envText,[Text.UTF8Encoding]::new($false))
Write-Host "LAB UTF-8 configurado: $LabGroupName" -ForegroundColor Green
if ($EnableLabSend) {
  Write-Host 'ENVÍO LAB habilitado explícitamente para esta ejecución de QA.' -ForegroundColor Yellow
} else {
  Write-Host 'ENVÍO LAB deshabilitado por defecto. Usa -EnableLabSend solo durante QA autorizado.' -ForegroundColor Green
}

if (Test-Path -LiteralPath $profileResetFlag) { Quarantine-BridgeProfile 'reparación pendiente detectada' }

Write-Host '[1/5] Instalando dependencias bloqueadas...' -ForegroundColor Cyan
& $npmCmd ci --no-fund --no-audit
if ($LASTEXITCODE -ne 0) { Fail 'npm ci terminó con error.' }

Write-Host '[2/5] Verificando sintaxis y contratos...' -ForegroundColor Cyan
& $npmCmd run check
if ($LASTEXITCODE -ne 0) { Fail 'La verificación de sintaxis falló.' }
& $npmCmd test
if ($LASTEXITCODE -ne 0) { Fail 'Los tests del Bridge fallaron.' }

Write-Host '[3/5] Probando Chrome/Edge controlado...' -ForegroundColor Cyan
& $npmCmd run selftest
if ($LASTEXITCODE -ne 0) { Fail 'Chrome/Edge no pasó el self-test.' }

Write-Host '[4/5] Validando backend, token y persistencia...' -ForegroundColor Cyan
& $npmCmd run production:check
if ($LASTEXITCODE -ne 0) {
  Fail 'El backend aún no cumple el gate de producción. Despliega la rama aprobada y confirma /bridge/health antes de reintentar.'
}

Write-Host '[5/5] Iniciando listener oficial...' -ForegroundColor Cyan
Write-Host 'FUENTE: CLUB HIPICO TRIPLE COWN/CROWN - SOLO LECTURA' -ForegroundColor Green
Write-Host "LAB: $LabGroupName - SHADOW $($labSendValue.ToUpperInvariant())" -ForegroundColor Green
Write-Host 'Ledger, saldos, jugadas y resultados reales: SIN ESCRITURA AUTOMÁTICA.' -ForegroundColor Green
Write-Host 'Ctrl+C detiene de forma segura.' -ForegroundColor Cyan

$repairedThisRun = $false
while ($true) {
  & $nodeExe --env-file=.env src/index.mjs
  $code = $LASTEXITCODE
  if ($code -eq 42 -and -not $repairedThisRun) {
    $repairedThisRun = $true
    Quarantine-BridgeProfile 'WhatsApp Web reportó base de datos dañada'
    Write-Host 'Reiniciando con perfil limpio; las colas y el journal siguen intactos.' -ForegroundColor Cyan
    Start-Sleep -Seconds 2
    continue
  }
  if ($code -eq 42) { Fail 'WhatsApp Web volvió a reportar base de datos dañada con un perfil limpio.' }
  if ($code -ne 0) { Fail "El Bridge terminó con código $code. Revisa $dataDir\bridge.log y last-error.png." }
  break
}
