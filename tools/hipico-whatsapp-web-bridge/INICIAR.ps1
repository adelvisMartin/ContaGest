param(
  [switch]$RuntimeMode,
  [switch]$SetupOnly,
  [switch]$CaptureGroupIds,
  [switch]$EnableSourceAutoReply,
  [switch]$EnableLabSend,
  [switch]$EnableLabInput
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$Version = '1.5.0'
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
    if (Test-Path -LiteralPath $src) {
      Copy-Item -LiteralPath $src -Destination (Join-Path $destinationFull $file) -Force
    }
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

function Read-GroupBindings([string]$BindingsPath) {
  if (-not (Test-Path -LiteralPath $BindingsPath)) { return $null }
  try {
    $binding = Get-Content -LiteralPath $BindingsPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $sourceId = [string]$binding.source.groupId
    $labId = [string]$binding.lab.groupId
    if ($sourceId -notmatch '^(?:\d{5,}-\d+|\d{10,})@g\.us$') { return $null }
    if ($labId -notmatch '^(?:\d{5,}-\d+|\d{10,})@g\.us$') { return $null }
    if ($sourceId -eq $labId) { return $null }
    return @{ SourceId = $sourceId; LabId = $labId }
  } catch { return $null }
}

$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$baseDir = Join-Path $env:LOCALAPPDATA 'ControlHipicoBridge'
$runtimeRoot = Join-Path $baseDir "runtime-v$Version"
$dataDir = Join-Path $baseDir 'data'

if (-not $RuntimeMode) {
  try { Copy-Runtime $sourceRoot $runtimeRoot }
  catch { Fail "No pude preparar el runtime de usuario en $runtimeRoot. Error: $($_.Exception.Message)" }

  $runtimeArgs = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $runtimeRoot 'INICIAR.ps1'),'-RuntimeMode')
  if ($SetupOnly) { $runtimeArgs += '-SetupOnly' }
  if ($CaptureGroupIds) { $runtimeArgs += '-CaptureGroupIds' }
  if ($EnableSourceAutoReply) { $runtimeArgs += '-EnableSourceAutoReply' }
  if ($EnableLabSend) { $runtimeArgs += '-EnableLabSend' }
  if ($EnableLabInput) { $runtimeArgs += '-EnableLabInput' }
  & powershell.exe @runtimeArgs
  exit $LASTEXITCODE
}

$runtimeRoot = Assert-ChildPath $baseDir $runtimeRoot
$dataDir = Assert-ChildPath $baseDir $dataDir
$profileDir = Assert-ChildPath $dataDir (Join-Path $dataDir 'chrome-profile')
$profileResetFlag = Assert-ChildPath $dataDir (Join-Path $dataDir 'profile-reset-required.flag')
$bindingsPath = Assert-ChildPath $dataDir (Join-Path $dataDir 'group-bindings.json')
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
Write-Host ' PRODUCCIÓN · BACKEND PERSISTENTE · AUTONOMÍA CONVERSACIONAL SEGURA' -ForegroundColor Cyan
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

if ($SetupOnly) {
  Write-Host '[SETUP 1/3] Instalando dependencias bloqueadas...' -ForegroundColor Cyan
  & $npmCmd ci --no-fund --no-audit
  if ($LASTEXITCODE -ne 0) { Fail 'npm ci terminó con error.' }

  Write-Host '[SETUP 2/3] Verificando sintaxis y contratos...' -ForegroundColor Cyan
  & $npmCmd run qa
  if ($LASTEXITCODE -ne 0) { Fail 'Los checks/tests del Bridge fallaron.' }

  Write-Host '[SETUP 3/3] Probando Chrome/Edge controlado...' -ForegroundColor Cyan
  & $npmCmd run selftest
  if ($LASTEXITCODE -ne 0) { Fail 'Chrome/Edge no pasó el self-test.' }

  Write-Host ''
  Write-Host 'Setup del Bridge completado. El inicio diario no ejecutará npm ci.' -ForegroundColor Green
  Write-Host 'Usa INICIAR-HIPICO-WHATSAPP.cmd para iniciar la operación diaria.' -ForegroundColor Green
  exit 0
}

if (-not (Test-Path -LiteralPath (Join-Path $runtimeRoot 'node_modules') -PathType Container)) {
  Fail 'Dependencias no instaladas. Ejecuta primero HIPICO-SETUP.ps1 desde la raíz del proyecto.'
}

if ($CaptureGroupIds) {
  Write-Host '[BINDING] Capturando IDs estables @g.us sin enviar mensajes...' -ForegroundColor Cyan
  $env:HIPICO_DATA_DIR = $dataDir
  & $npmCmd run capture:groups
  if ($LASTEXITCODE -ne 0) { Fail 'No se pudieron capturar los IDs de grupos.' }
  Write-Host "Binding terminado. Archivo local: $bindingsPath" -ForegroundColor Green
  exit 0
}

$bindings = Read-GroupBindings $bindingsPath
if (($EnableSourceAutoReply -or $EnableLabSend -or $EnableLabInput) -and -not $bindings) {
  Fail "Auto-reply/LAB requiere IDs @g.us verificados. Ejecuta primero: .\INICIAR.ps1 -CaptureGroupIds"
}
$sourceGroupId = if ($bindings) { $bindings.SourceId } else { '' }
$labGroupId = if ($bindings) { $bindings.LabId } else { '' }

$token = Load-ProtectedToken $tokenPath
if ([string]::IsNullOrWhiteSpace($token)) {
  $token = New-BridgeToken $nodeExe
  if ([string]::IsNullOrWhiteSpace($token) -or $token.Length -lt 32) { Fail 'No pude generar un token seguro.' }
  Save-ProtectedToken $token $tokenPath
  Write-Host 'Token DPAPI nuevo creado. Debe configurarse en el backend/Vercel antes de producción.' -ForegroundColor Yellow
} else {
  Write-Host 'Token DPAPI existente cargado sin exponerlo.' -ForegroundColor Green
}

$dataForEnv = ($dataDir -replace '\\','/')
$sourceAutoReplyValue = if ($EnableSourceAutoReply) { 'true' } else { 'false' }
$labSendValue = if ($EnableLabSend) { 'true' } else { 'false' }
$labInputValue = if ($EnableLabInput) { 'true' } else { 'false' }
$envText = @"
HIPICO_RUNTIME_MODE=production
HIPICO_BACKEND_SYNC_ENABLED=true
HIPICO_INGEST_URL=https://conta-gest-frontend.vercel.app/api/v1/hipico-bot/bridge/events
HIPICO_BRIDGE_HEALTH_URL=https://conta-gest-frontend.vercel.app/api/v1/hipico-bot/bridge/health
HIPICO_GROUP_BRIDGE_TOKEN=$token
HIPICO_DATA_DIR=$dataForEnv
HIPICO_SOURCE_GROUP_MATCHES=CLUB HIPICO TRIPLE COWN|CLUB HIPICO TRIPLE CROWN
HIPICO_SOURCE_GROUP_ID=$sourceGroupId
HIPICO_SOURCE_CHANNEL_KEY=club-hipico-triple-crown-official
HIPICO_SOURCE_AUTO_REPLY_ENABLED=$sourceAutoReplyValue
HIPICO_LAB_GROUP_NAME=$LabGroupName
HIPICO_LAB_GROUP_ID=$labGroupId
HIPICO_LAB_CHANNEL_KEY=control-hipico-lab
HIPICO_REQUIRE_PINNED_GROUP_IDS=true
HIPICO_LAB_SEND_ENABLED=$labSendValue
HIPICO_LAB_TEST_INPUT_ENABLED=$labInputValue
HIPICO_POLL_MS=1000
HIPICO_BACKEND_TIMEOUT_MS=15000
HIPICO_BACKEND_MAX_RPS=4
HIPICO_BACKEND_MAX_PER_FLUSH=20
HIPICO_BACKEND_BASE_BACKOFF_MS=5000
HIPICO_BACKEND_MAX_BACKOFF_MS=900000
HIPICO_TRAINING_JOURNAL_ENABLED=true
HIPICO_DIAGNOSTIC_SCREENSHOTS_ENABLED=false
HIPICO_SOURCE_BASELINE_IGNORE_HISTORY=true
HIPICO_LAB_TEST_POLL_MS=5000
HIPICO_LAB_TEST_BOOTSTRAP_LIMIT=8
HIPICO_REPORT_INCLUDE_SAMPLES=false
HIPICO_HISTORY_SYNC_ON_START=false
"@
[IO.File]::WriteAllText($envPath,$envText,[Text.UTF8Encoding]::new($false))
Write-Host "LAB UTF-8 configurado: $LabGroupName" -ForegroundColor Green
Write-Host "Binding IDs: $([bool]$bindings)" -ForegroundColor Green
if ($EnableSourceAutoReply) {
  Write-Host 'AUTO-REPLY SOURCE habilitado: solo respuestas autorizadas por backend, sin autoridad financiera/estado.' -ForegroundColor Yellow
} else {
  Write-Host 'AUTO-REPLY SOURCE deshabilitado. Fuente en solo lectura.' -ForegroundColor Green
}
if ($EnableLabSend) {
  Write-Host 'ENVÍO LAB habilitado explícitamente para esta ejecución de QA.' -ForegroundColor Yellow
} else {
  Write-Host 'ENVÍO LAB deshabilitado.' -ForegroundColor Green
}

if (Test-Path -LiteralPath $profileResetFlag) { Quarantine-BridgeProfile 'reparación pendiente detectada' }

Write-Host '[1/2] Validando backend, token y persistencia...' -ForegroundColor Cyan
& $npmCmd run production:check
if ($LASTEXITCODE -ne 0) {
  Fail 'El backend no cumple el gate de producción. Confirma despliegue, token y /bridge/health antes de reintentar.'
}

Write-Host '[2/2] Iniciando listener oficial...' -ForegroundColor Cyan
Write-Host "FUENTE: CLUB HIPICO TRIPLE COWN/CROWN - AUTO-REPLY=$($sourceAutoReplyValue.ToUpperInvariant())" -ForegroundColor Green
Write-Host "LAB: $LabGroupName - SEND=$($labSendValue.ToUpperInvariant()) INPUT=$($labInputValue.ToUpperInvariant())" -ForegroundColor Green
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
  if ($code -ne 0) { Fail "El Bridge terminó con código $code. Revisa $dataDir\bridge.log y health.json." }
  break
}) { return $null }
    if ($labId -notmatch '^(?:\d{5,}-\d+|\d{10,})@g\.us$') { return $null }
    if ($sourceId -eq $labId) { return $null }
    return @{ SourceId = $sourceId; LabId = $labId }
  } catch { return $null }
}

$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$baseDir = Join-Path $env:LOCALAPPDATA 'ControlHipicoBridge'
$runtimeRoot = Join-Path $baseDir "runtime-v$Version"
$dataDir = Join-Path $baseDir 'data'

if (-not $RuntimeMode) {
  try { Copy-Runtime $sourceRoot $runtimeRoot }
  catch { Fail "No pude preparar el runtime de usuario en $runtimeRoot. Error: $($_.Exception.Message)" }

  $runtimeArgs = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $runtimeRoot 'INICIAR.ps1'),'-RuntimeMode')
  if ($SetupOnly) { $runtimeArgs += '-SetupOnly' }
  if ($CaptureGroupIds) { $runtimeArgs += '-CaptureGroupIds' }
  if ($EnableSourceAutoReply) { $runtimeArgs += '-EnableSourceAutoReply' }
  if ($EnableLabSend) { $runtimeArgs += '-EnableLabSend' }
  if ($EnableLabInput) { $runtimeArgs += '-EnableLabInput' }
  & powershell.exe @runtimeArgs
  exit $LASTEXITCODE
}

$runtimeRoot = Assert-ChildPath $baseDir $runtimeRoot
$dataDir = Assert-ChildPath $baseDir $dataDir
$profileDir = Assert-ChildPath $dataDir (Join-Path $dataDir 'chrome-profile')
$profileResetFlag = Assert-ChildPath $dataDir (Join-Path $dataDir 'profile-reset-required.flag')
$bindingsPath = Assert-ChildPath $dataDir (Join-Path $dataDir 'group-bindings.json')
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
Write-Host ' PRODUCCIÓN · BACKEND PERSISTENTE · AUTONOMÍA CONVERSACIONAL SEGURA' -ForegroundColor Cyan
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

if ($SetupOnly) {
  Write-Host '[SETUP 1/3] Instalando dependencias bloqueadas...' -ForegroundColor Cyan
  & $npmCmd ci --no-fund --no-audit
  if ($LASTEXITCODE -ne 0) { Fail 'npm ci terminó con error.' }

  Write-Host '[SETUP 2/3] Verificando sintaxis y contratos...' -ForegroundColor Cyan
  & $npmCmd run qa
  if ($LASTEXITCODE -ne 0) { Fail 'Los checks/tests del Bridge fallaron.' }

  Write-Host '[SETUP 3/3] Probando Chrome/Edge controlado...' -ForegroundColor Cyan
  & $npmCmd run selftest
  if ($LASTEXITCODE -ne 0) { Fail 'Chrome/Edge no pasó el self-test.' }

  Write-Host ''
  Write-Host 'Setup del Bridge completado. El inicio diario no ejecutará npm ci.' -ForegroundColor Green
  Write-Host 'Usa INICIAR-HIPICO-WHATSAPP.cmd para iniciar la operación diaria.' -ForegroundColor Green
  exit 0
}

if (-not (Test-Path -LiteralPath (Join-Path $runtimeRoot 'node_modules') -PathType Container)) {
  Fail 'Dependencias no instaladas. Ejecuta primero HIPICO-SETUP.ps1 desde la raíz del proyecto.'
}

if ($CaptureGroupIds) {
  Write-Host '[BINDING] Capturando IDs estables @g.us sin enviar mensajes...' -ForegroundColor Cyan
  $env:HIPICO_DATA_DIR = $dataDir
  & $npmCmd run capture:groups
  if ($LASTEXITCODE -ne 0) { Fail 'No se pudieron capturar los IDs de grupos.' }
  Write-Host "Binding terminado. Archivo local: $bindingsPath" -ForegroundColor Green
  exit 0
}

$bindings = Read-GroupBindings $bindingsPath
if (($EnableSourceAutoReply -or $EnableLabSend -or $EnableLabInput) -and -not $bindings) {
  Fail "Auto-reply/LAB requiere IDs @g.us verificados. Ejecuta primero: .\INICIAR.ps1 -CaptureGroupIds"
}
$sourceGroupId = if ($bindings) { $bindings.SourceId } else { '' }
$labGroupId = if ($bindings) { $bindings.LabId } else { '' }

$token = Load-ProtectedToken $tokenPath
if ([string]::IsNullOrWhiteSpace($token)) {
  $token = New-BridgeToken $nodeExe
  if ([string]::IsNullOrWhiteSpace($token) -or $token.Length -lt 32) { Fail 'No pude generar un token seguro.' }
  Save-ProtectedToken $token $tokenPath
  Write-Host 'Token DPAPI nuevo creado. Debe configurarse en el backend/Vercel antes de producción.' -ForegroundColor Yellow
} else {
  Write-Host 'Token DPAPI existente cargado sin exponerlo.' -ForegroundColor Green
}

$dataForEnv = ($dataDir -replace '\\','/')
$sourceAutoReplyValue = if ($EnableSourceAutoReply) { 'true' } else { 'false' }
$labSendValue = if ($EnableLabSend) { 'true' } else { 'false' }
$labInputValue = if ($EnableLabInput) { 'true' } else { 'false' }
$envText = @"
HIPICO_RUNTIME_MODE=production
HIPICO_BACKEND_SYNC_ENABLED=true
HIPICO_INGEST_URL=https://conta-gest-frontend.vercel.app/api/v1/hipico-bot/bridge/events
HIPICO_BRIDGE_HEALTH_URL=https://conta-gest-frontend.vercel.app/api/v1/hipico-bot/bridge/health
HIPICO_GROUP_BRIDGE_TOKEN=$token
HIPICO_DATA_DIR=$dataForEnv
HIPICO_SOURCE_GROUP_MATCHES=CLUB HIPICO TRIPLE COWN|CLUB HIPICO TRIPLE CROWN
HIPICO_SOURCE_GROUP_ID=$sourceGroupId
HIPICO_SOURCE_CHANNEL_KEY=club-hipico-triple-crown-official
HIPICO_SOURCE_AUTO_REPLY_ENABLED=$sourceAutoReplyValue
HIPICO_LAB_GROUP_NAME=$LabGroupName
HIPICO_LAB_GROUP_ID=$labGroupId
HIPICO_LAB_CHANNEL_KEY=control-hipico-lab
HIPICO_REQUIRE_PINNED_GROUP_IDS=true
HIPICO_LAB_SEND_ENABLED=$labSendValue
HIPICO_LAB_TEST_INPUT_ENABLED=$labInputValue
HIPICO_POLL_MS=1000
HIPICO_BACKEND_TIMEOUT_MS=15000
HIPICO_BACKEND_MAX_RPS=4
HIPICO_BACKEND_MAX_PER_FLUSH=20
HIPICO_BACKEND_BASE_BACKOFF_MS=5000
HIPICO_BACKEND_MAX_BACKOFF_MS=900000
HIPICO_TRAINING_JOURNAL_ENABLED=true
HIPICO_DIAGNOSTIC_SCREENSHOTS_ENABLED=false
HIPICO_SOURCE_BASELINE_IGNORE_HISTORY=true
HIPICO_LAB_TEST_POLL_MS=5000
HIPICO_LAB_TEST_BOOTSTRAP_LIMIT=8
HIPICO_REPORT_INCLUDE_SAMPLES=false
HIPICO_HISTORY_SYNC_ON_START=false
"@
[IO.File]::WriteAllText($envPath,$envText,[Text.UTF8Encoding]::new($false))
Write-Host "LAB UTF-8 configurado: $LabGroupName" -ForegroundColor Green
Write-Host "Binding IDs: $([bool]$bindings)" -ForegroundColor Green
if ($EnableSourceAutoReply) {
  Write-Host 'AUTO-REPLY SOURCE habilitado: solo respuestas autorizadas por backend, sin autoridad financiera/estado.' -ForegroundColor Yellow
} else {
  Write-Host 'AUTO-REPLY SOURCE deshabilitado. Fuente en solo lectura.' -ForegroundColor Green
}
if ($EnableLabSend) {
  Write-Host 'ENVÍO LAB habilitado explícitamente para esta ejecución de QA.' -ForegroundColor Yellow
} else {
  Write-Host 'ENVÍO LAB deshabilitado.' -ForegroundColor Green
}

if (Test-Path -LiteralPath $profileResetFlag) { Quarantine-BridgeProfile 'reparación pendiente detectada' }

Write-Host '[1/2] Validando backend, token y persistencia...' -ForegroundColor Cyan
& $npmCmd run production:check
if ($LASTEXITCODE -ne 0) {
  Fail 'El backend no cumple el gate de producción. Confirma despliegue, token y /bridge/health antes de reintentar.'
}

Write-Host '[2/2] Iniciando listener oficial...' -ForegroundColor Cyan
Write-Host "FUENTE: CLUB HIPICO TRIPLE COWN/CROWN - AUTO-REPLY=$($sourceAutoReplyValue.ToUpperInvariant())" -ForegroundColor Green
Write-Host "LAB: $LabGroupName - SEND=$($labSendValue.ToUpperInvariant()) INPUT=$($labInputValue.ToUpperInvariant())" -ForegroundColor Green
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
  if ($code -ne 0) { Fail "El Bridge terminó con código $code. Revisa $dataDir\bridge.log y health.json." }
  break
}) { return $null }
    if ($sourceId -eq $labId) { return $null }
    return @{ SourceId = $sourceId; LabId = $labId }
  } catch { return $null }
}

$sourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$baseDir = Join-Path $env:LOCALAPPDATA 'ControlHipicoBridge'
$runtimeRoot = Join-Path $baseDir "runtime-v$Version"
$dataDir = Join-Path $baseDir 'data'

if (-not $RuntimeMode) {
  try { Copy-Runtime $sourceRoot $runtimeRoot }
  catch { Fail "No pude preparar el runtime de usuario en $runtimeRoot. Error: $($_.Exception.Message)" }

  $runtimeArgs = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $runtimeRoot 'INICIAR.ps1'),'-RuntimeMode')
  if ($SetupOnly) { $runtimeArgs += '-SetupOnly' }
  if ($CaptureGroupIds) { $runtimeArgs += '-CaptureGroupIds' }
  if ($EnableSourceAutoReply) { $runtimeArgs += '-EnableSourceAutoReply' }
  if ($EnableLabSend) { $runtimeArgs += '-EnableLabSend' }
  if ($EnableLabInput) { $runtimeArgs += '-EnableLabInput' }
  & powershell.exe @runtimeArgs
  exit $LASTEXITCODE
}

$runtimeRoot = Assert-ChildPath $baseDir $runtimeRoot
$dataDir = Assert-ChildPath $baseDir $dataDir
$profileDir = Assert-ChildPath $dataDir (Join-Path $dataDir 'chrome-profile')
$profileResetFlag = Assert-ChildPath $dataDir (Join-Path $dataDir 'profile-reset-required.flag')
$bindingsPath = Assert-ChildPath $dataDir (Join-Path $dataDir 'group-bindings.json')
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
Write-Host ' PRODUCCIÓN · BACKEND PERSISTENTE · AUTONOMÍA CONVERSACIONAL SEGURA' -ForegroundColor Cyan
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

if ($SetupOnly) {
  Write-Host '[SETUP 1/3] Instalando dependencias bloqueadas...' -ForegroundColor Cyan
  & $npmCmd ci --no-fund --no-audit
  if ($LASTEXITCODE -ne 0) { Fail 'npm ci terminó con error.' }

  Write-Host '[SETUP 2/3] Verificando sintaxis y contratos...' -ForegroundColor Cyan
  & $npmCmd run qa
  if ($LASTEXITCODE -ne 0) { Fail 'Los checks/tests del Bridge fallaron.' }

  Write-Host '[SETUP 3/3] Probando Chrome/Edge controlado...' -ForegroundColor Cyan
  & $npmCmd run selftest
  if ($LASTEXITCODE -ne 0) { Fail 'Chrome/Edge no pasó el self-test.' }

  Write-Host ''
  Write-Host 'Setup del Bridge completado. El inicio diario no ejecutará npm ci.' -ForegroundColor Green
  Write-Host 'Usa INICIAR-HIPICO-WHATSAPP.cmd para iniciar la operación diaria.' -ForegroundColor Green
  exit 0
}

if (-not (Test-Path -LiteralPath (Join-Path $runtimeRoot 'node_modules') -PathType Container)) {
  Fail 'Dependencias no instaladas. Ejecuta primero HIPICO-SETUP.ps1 desde la raíz del proyecto.'
}

if ($CaptureGroupIds) {
  Write-Host '[BINDING] Capturando IDs estables @g.us sin enviar mensajes...' -ForegroundColor Cyan
  $env:HIPICO_DATA_DIR = $dataDir
  & $npmCmd run capture:groups
  if ($LASTEXITCODE -ne 0) { Fail 'No se pudieron capturar los IDs de grupos.' }
  Write-Host "Binding terminado. Archivo local: $bindingsPath" -ForegroundColor Green
  exit 0
}

$bindings = Read-GroupBindings $bindingsPath
if (($EnableSourceAutoReply -or $EnableLabSend -or $EnableLabInput) -and -not $bindings) {
  Fail "Auto-reply/LAB requiere IDs @g.us verificados. Ejecuta primero: .\INICIAR.ps1 -CaptureGroupIds"
}
$sourceGroupId = if ($bindings) { $bindings.SourceId } else { '' }
$labGroupId = if ($bindings) { $bindings.LabId } else { '' }

$token = Load-ProtectedToken $tokenPath
if ([string]::IsNullOrWhiteSpace($token)) {
  $token = New-BridgeToken $nodeExe
  if ([string]::IsNullOrWhiteSpace($token) -or $token.Length -lt 32) { Fail 'No pude generar un token seguro.' }
  Save-ProtectedToken $token $tokenPath
  Write-Host 'Token DPAPI nuevo creado. Debe configurarse en el backend/Vercel antes de producción.' -ForegroundColor Yellow
} else {
  Write-Host 'Token DPAPI existente cargado sin exponerlo.' -ForegroundColor Green
}

$dataForEnv = ($dataDir -replace '\\','/')
$sourceAutoReplyValue = if ($EnableSourceAutoReply) { 'true' } else { 'false' }
$labSendValue = if ($EnableLabSend) { 'true' } else { 'false' }
$labInputValue = if ($EnableLabInput) { 'true' } else { 'false' }
$envText = @"
HIPICO_RUNTIME_MODE=production
HIPICO_BACKEND_SYNC_ENABLED=true
HIPICO_INGEST_URL=https://conta-gest-frontend.vercel.app/api/v1/hipico-bot/bridge/events
HIPICO_BRIDGE_HEALTH_URL=https://conta-gest-frontend.vercel.app/api/v1/hipico-bot/bridge/health
HIPICO_GROUP_BRIDGE_TOKEN=$token
HIPICO_DATA_DIR=$dataForEnv
HIPICO_SOURCE_GROUP_MATCHES=CLUB HIPICO TRIPLE COWN|CLUB HIPICO TRIPLE CROWN
HIPICO_SOURCE_GROUP_ID=$sourceGroupId
HIPICO_SOURCE_CHANNEL_KEY=club-hipico-triple-crown-official
HIPICO_SOURCE_AUTO_REPLY_ENABLED=$sourceAutoReplyValue
HIPICO_LAB_GROUP_NAME=$LabGroupName
HIPICO_LAB_GROUP_ID=$labGroupId
HIPICO_LAB_CHANNEL_KEY=control-hipico-lab
HIPICO_REQUIRE_PINNED_GROUP_IDS=true
HIPICO_LAB_SEND_ENABLED=$labSendValue
HIPICO_LAB_TEST_INPUT_ENABLED=$labInputValue
HIPICO_POLL_MS=1000
HIPICO_BACKEND_TIMEOUT_MS=15000
HIPICO_BACKEND_MAX_RPS=4
HIPICO_BACKEND_MAX_PER_FLUSH=20
HIPICO_BACKEND_BASE_BACKOFF_MS=5000
HIPICO_BACKEND_MAX_BACKOFF_MS=900000
HIPICO_TRAINING_JOURNAL_ENABLED=true
HIPICO_DIAGNOSTIC_SCREENSHOTS_ENABLED=false
HIPICO_SOURCE_BASELINE_IGNORE_HISTORY=true
HIPICO_LAB_TEST_POLL_MS=5000
HIPICO_LAB_TEST_BOOTSTRAP_LIMIT=8
HIPICO_REPORT_INCLUDE_SAMPLES=false
HIPICO_HISTORY_SYNC_ON_START=false
"@
[IO.File]::WriteAllText($envPath,$envText,[Text.UTF8Encoding]::new($false))
Write-Host "LAB UTF-8 configurado: $LabGroupName" -ForegroundColor Green
Write-Host "Binding IDs: $([bool]$bindings)" -ForegroundColor Green
if ($EnableSourceAutoReply) {
  Write-Host 'AUTO-REPLY SOURCE habilitado: solo respuestas autorizadas por backend, sin autoridad financiera/estado.' -ForegroundColor Yellow
} else {
  Write-Host 'AUTO-REPLY SOURCE deshabilitado. Fuente en solo lectura.' -ForegroundColor Green
}
if ($EnableLabSend) {
  Write-Host 'ENVÍO LAB habilitado explícitamente para esta ejecución de QA.' -ForegroundColor Yellow
} else {
  Write-Host 'ENVÍO LAB deshabilitado.' -ForegroundColor Green
}

if (Test-Path -LiteralPath $profileResetFlag) { Quarantine-BridgeProfile 'reparación pendiente detectada' }

Write-Host '[1/2] Validando backend, token y persistencia...' -ForegroundColor Cyan
& $npmCmd run production:check
if ($LASTEXITCODE -ne 0) {
  Fail 'El backend no cumple el gate de producción. Confirma despliegue, token y /bridge/health antes de reintentar.'
}

Write-Host '[2/2] Iniciando listener oficial...' -ForegroundColor Cyan
Write-Host "FUENTE: CLUB HIPICO TRIPLE COWN/CROWN - AUTO-REPLY=$($sourceAutoReplyValue.ToUpperInvariant())" -ForegroundColor Green
Write-Host "LAB: $LabGroupName - SEND=$($labSendValue.ToUpperInvariant()) INPUT=$($labInputValue.ToUpperInvariant())" -ForegroundColor Green
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
  if ($code -ne 0) { Fail "El Bridge terminó con código $code. Revisa $dataDir\bridge.log y health.json." }
  break
}