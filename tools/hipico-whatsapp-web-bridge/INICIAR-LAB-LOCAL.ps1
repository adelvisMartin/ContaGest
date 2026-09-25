param(
  [switch]$KeepLegacyPending
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$LabGroupName = 'Control h' + [char]0x00ED + 'pico lab'
$SourceGroupMatches = 'CLUB HIPICO TRIPLE COWN|CLUB HIPICO TRIPLE CROWN'
$SourceRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BaseDir = Join-Path $env:LOCALAPPDATA 'ControlHipicoBridge'
$DataDir = Join-Path $BaseDir 'data'
$BindingsPath = Join-Path $DataDir 'group-bindings.json'
$HealthPath = Join-Path $DataDir 'health.json'
$MirrorSpool = Join-Path $DataDir 'spool-lab-mirror'

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

function Read-Bindings {
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

function Protect-LegacyMirrorQueue {
  if ($KeepLegacyPending -or -not (Test-Path -LiteralPath $MirrorSpool)) { return }
  $pending = @(Get-ChildItem -LiteralPath $MirrorSpool -Filter '*.json' -File -ErrorAction SilentlyContinue)
  if ($pending.Count -eq 0) { return }

  $legacyVersion = ''
  if (Test-Path -LiteralPath $HealthPath) {
    try { $legacyVersion = [string]((Get-Content -LiteralPath $HealthPath -Raw -Encoding UTF8 | ConvertFrom-Json).version) } catch {}
  }
  if ($legacyVersion -ne '1.3.3') { return }

  $archive = Join-Path $DataDir ('spool-lab-mirror-v133-preserved-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
  Move-Item -LiteralPath $MirrorSpool -Destination $archive
  New-Item -ItemType Directory -Force -Path $MirrorSpool | Out-Null
  Write-Host "Se preservaron $($pending.Count) mensajes LAB pendientes de v1.3.3 en:" -ForegroundColor Yellow
  Write-Host "  $archive" -ForegroundColor DarkYellow
  Write-Host 'No se enviarán de golpe: fueron generados por el parser anterior y podrían contaminar la comparación nueva.' -ForegroundColor Yellow
}

Set-Location $SourceRoot
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

Write-Host ''
Write-Host '================================================================' -ForegroundColor Cyan
Write-Host ' CONTROL HÍPICO · LAB SHADOW LOCAL' -ForegroundColor Cyan
Write-Host ' FUENTE REAL SOLO LECTURA -> ÚNICAMENTE CONTROL HÍPICO LAB' -ForegroundColor Cyan
Write-Host '================================================================' -ForegroundColor Cyan
Write-Host 'Sin Vercel. Sin escritura en el grupo real. Sin cambios monetarios.' -ForegroundColor Green
Write-Host "LAB canónico UTF-8: $LabGroupName" -ForegroundColor Green
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

Write-Host '[1/4] Dependencias reproducibles...' -ForegroundColor Cyan
& $npmCmd ci --no-fund --no-audit
if ($LASTEXITCODE -ne 0) { Fail 'npm ci terminó con error.' }

Write-Host '[2/4] QA del Bridge y corpus real...' -ForegroundColor Cyan
& $npmCmd run qa
if ($LASTEXITCODE -ne 0) { Fail 'Los checks/tests del Bridge fallaron. No se abrirá WhatsApp.' }

$env:HIPICO_RUNTIME_MODE = 'shadow-local'
$env:HIPICO_BACKEND_SYNC_ENABLED = 'false'
$env:HIPICO_DATA_DIR = $DataDir
$env:HIPICO_SOURCE_GROUP_MATCHES = $SourceGroupMatches
$env:HIPICO_SOURCE_CHANNEL_KEY = 'club-hipico-triple-crown-official'
$env:HIPICO_LAB_GROUP_NAME = $LabGroupName
$env:HIPICO_LAB_CHANNEL_KEY = 'control-hipico-lab'
$env:HIPICO_REQUIRE_PINNED_GROUP_IDS = 'true'
$env:HIPICO_LAB_SEND_ENABLED = 'true'
$env:HIPICO_LAB_TEST_INPUT_ENABLED = 'true'
$env:HIPICO_TRAINING_JOURNAL_ENABLED = 'true'
$env:HIPICO_SOURCE_BASELINE_IGNORE_HISTORY = 'true'
$env:HIPICO_DIAGNOSTIC_SCREENSHOTS_ENABLED = 'true'
$env:HIPICO_POLL_MS = '1000'
$env:HIPICO_LAB_TEST_POLL_MS = '5000'
$env:HIPICO_LAB_TEST_BOOTSTRAP_LIMIT = '8'

$bindings = Read-Bindings
if (-not $bindings) {
  Write-Host '[3/4] No existen bindings seguros. Abriré el asistente para capturar los dos IDs @g.us.' -ForegroundColor Yellow
  Write-Host 'Te pedirá abrir manualmente primero el grupo real y luego Control hípico lab. No envía mensajes.' -ForegroundColor Yellow
  & $npmCmd run capture:groups
  if ($LASTEXITCODE -ne 0) { Fail 'No se pudieron capturar los IDs de los grupos.' }
  $bindings = Read-Bindings
  if (-not $bindings) { Fail 'Los bindings guardados no son válidos.' }
} else {
  Write-Host '[3/4] IDs @g.us ya verificados.' -ForegroundColor Green
}

$env:HIPICO_SOURCE_GROUP_ID = $bindings.SourceId
$env:HIPICO_LAB_GROUP_ID = $bindings.LabId
Protect-LegacyMirrorQueue

Write-Host '[4/4] Iniciando comparación en vivo...' -ForegroundColor Cyan
Write-Host 'FUENTE: CLUB HIPICO TRIPLE CROWN · SOLO LECTURA' -ForegroundColor Green
Write-Host "SALIDA: $LabGroupName · ÚNICO DESTINO DE ESCRITURA" -ForegroundColor Green
Write-Host 'Los mensajes nuevos del grupo real se clasifican y su propuesta se refleja en LAB.' -ForegroundColor Green
Write-Host 'También puedes escribir ejemplos directamente en LAB; el bot los contestará como prueba.' -ForegroundColor Green
Write-Host 'Ctrl+C detiene de forma segura.' -ForegroundColor Cyan
Write-Host ''

& $nodeExe src/index.mjs
$code = $LASTEXITCODE
if ($code -ne 0) { Fail "El Bridge terminó con código $code. Revisa $DataDir\bridge.log, health.json y last-error.png." }
exit 0
