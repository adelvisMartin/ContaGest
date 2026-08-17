$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$envPath = Join-Path $here '.env'
$examplePath = Join-Path $here '.env.example'
$historyReportPath = Join-Path $here 'data\history-sync-report.json'
$appDataDir = Join-Path $env:APPDATA 'ControlHipico'
$protectedTokenPath = Join-Path $appDataDir 'bridge-token.dpapi'
$vercelEnvUrl = 'https://vercel.com/adelvismartin-6485s-projects/conta-gest-frontend/settings/environment-variables'
$vercelDeployUrl = 'https://vercel.com/adelvismartin-6485s-projects/conta-gest-frontend/deployments'
$ingestUrl = 'https://conta-gest-frontend.vercel.app/api/v1/hipico-bot/bridge/events'
$sourceMatch = 'CLUB HIPICO TRIPLE CROWN'
$sourceKey = 'club-hipico-triple-crown-official'
$labGroupName = 'Control h' + [char]0x00ED + 'pico lab'
$labKey = 'control-hipico-lab'

function Fail([string]$Message) {
  Write-Host ''
  Write-Host $Message -ForegroundColor Red
  Write-Host ''
  Read-Host 'Presiona ENTER para cerrar'
  exit 1
}

function Set-EnvValue([string]$Text,[string]$Name,[string]$Value) {
  $escaped=[Regex]::Escape($Name)
  if($Text -match "(?m)^$escaped=") {
    return [Regex]::Replace($Text,"(?m)^$escaped=.*$","$Name=$Value")
  }
  if(-not $Text.EndsWith("`n")){$Text+="`r`n"}
  return $Text+"$Name=$Value`r`n"
}

function Get-EnvValue([string]$Text,[string]$Name,[string]$Fallback='') {
  $match=[Regex]::Match($Text,"(?m)^$([Regex]::Escape($Name))=(.*)$")
  if($match.Success){return $match.Groups[1].Value.Trim()}
  return $Fallback
}

function Save-ProtectedToken([string]$Token) {
  New-Item -ItemType Directory -Force -Path $appDataDir | Out-Null
  $secure = ConvertTo-SecureString $Token -AsPlainText -Force
  $protected = ConvertFrom-SecureString $secure
  [IO.File]::WriteAllText($protectedTokenPath, $protected, [Text.UTF8Encoding]::new($false))
}

function Load-ProtectedToken {
  if(-not (Test-Path $protectedTokenPath)){ return $null }
  try {
    $protected = Get-Content $protectedTokenPath -Raw
    $secure = ConvertTo-SecureString $protected
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
  } catch { return $null }
}

function New-Token {
  return (& node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")
}

function Validate-Token([string]$Token) {
  $headers=@{'x-hipico-bridge-token'=$Token;'content-type'='application/json'}
  try {
    Invoke-WebRequest -Uri $ingestUrl -Method POST -Headers $headers -Body '{}' -UseBasicParsing -ErrorAction Stop | Out-Null
    return 'ok'
  } catch {
    $status = $null
    try { $status = [int]$_.Exception.Response.StatusCode } catch {}
    if($status -eq 400){ return 'ok' }
    if($status -eq 401){ return 'unauthorized' }
    if($status -eq 429){ return 'rate-limited' }
    if($status -eq 404){ return 'not-found' }
    return "error:$status"
  }
}

function History-IsComplete {
  if(-not (Test-Path $historyReportPath)){return $false}
  try {
    $report=Get-Content $historyReportPath -Raw | ConvertFrom-Json
    return ($report.stopReason -eq 'stable_oldest_available' -and [int]$report.pending -eq 0)
  } catch { return $false }
}

Write-Host ''
Write-Host '========================================================'
Write-Host ' CONTROL HIPICO - WHATSAPP WEB BRIDGE v1.3.0'
Write-Host ' HISTORICO + OFICIAL READ-ONLY -> LAB SHADOW'
Write-Host ' Chrome/Edge oficial + Playwright 1.62.1'
Write-Host '========================================================'
Write-Host ''
Write-Host 'Regla dura: este Bridge NUNCA envia al grupo oficial.' -ForegroundColor Green
Write-Host 'TRIPLE CROWN se usa como fuente de aprendizaje shadow auditable.' -ForegroundColor Green
Write-Host ''

if(-not (Get-Command node -ErrorAction SilentlyContinue)){Fail 'No encuentro Node.js.'}
if(-not (Get-Command npm -ErrorAction SilentlyContinue)){Fail 'No encuentro npm.'}

$nodeVersion = node -p "process.versions.node"
$nodeMajor = [int]($nodeVersion.Split('.')[0])
if($nodeMajor -lt 20){Fail "Se requiere Node.js 20 o superior. Detectado: v$nodeVersion"}
Write-Host "Node.js detectado: v$nodeVersion - OK" -ForegroundColor Green

Set-Location $here
if(-not (Test-Path $envPath)){Copy-Item $examplePath $envPath}
$content = Get-Content $envPath -Raw

$tokenMatch = [Regex]::Match($content,'(?m)^HIPICO_GROUP_BRIDGE_TOKEN=(.*)$')
$token = if($tokenMatch.Success){$tokenMatch.Groups[1].Value.Trim()}else{''}
if([string]::IsNullOrWhiteSpace($token) -or $token -eq 'CAMBIA_ESTE_SECRETO_LARGO'){$token = Load-ProtectedToken}
if([string]::IsNullOrWhiteSpace($token)){
  $token = New-Token
  if([string]::IsNullOrWhiteSpace($token) -or $token.Length -lt 32){Fail 'No pude generar el token criptografico.'}
  Save-ProtectedToken $token
  Write-Host 'Token nuevo generado y guardado con Windows DPAPI.' -ForegroundColor Green
} else {
  Save-ProtectedToken $token
  Write-Host 'Token protegido local encontrado.' -ForegroundColor Green
}

$content = Set-EnvValue $content 'HIPICO_INGEST_URL' $ingestUrl
$content = Set-EnvValue $content 'HIPICO_GROUP_BRIDGE_TOKEN' $token
$content = Set-EnvValue $content 'HIPICO_SOURCE_GROUP_MATCH' $sourceMatch
$content = Set-EnvValue $content 'HIPICO_SOURCE_CHANNEL_KEY' $sourceKey
$content = Set-EnvValue $content 'HIPICO_LAB_GROUP_NAME' $labGroupName
$content = Set-EnvValue $content 'HIPICO_LAB_CHANNEL_KEY' $labKey
$content = Set-EnvValue $content 'HIPICO_POLL_MS' '1000'
$content = Set-EnvValue $content 'HIPICO_BACKEND_TIMEOUT_MS' '15000'

foreach($pair in @(
  @('HIPICO_HISTORY_SYNC_ON_START','true'),
  @('HIPICO_HISTORY_MAX_MESSAGES','50000'),
  @('HIPICO_HISTORY_MAX_MINUTES','90'),
  @('HIPICO_HISTORY_IDLE_ROUNDS','8'),
  @('HIPICO_HISTORY_PAGE_WAIT_MS','1200'),
  @('HIPICO_HISTORY_UPLOAD_CONCURRENCY','4')
)){
  if([string]::IsNullOrWhiteSpace((Get-EnvValue $content $pair[0] ''))){
    $content=Set-EnvValue $content $pair[0] $pair[1]
  }
}

$existingSend = [Regex]::Match($content,'(?m)^HIPICO_LAB_SEND_ENABLED=(.*)$')
$sendEnabled = if($existingSend.Success -and $existingSend.Groups[1].Value.Trim().ToLower() -eq 'true'){'true'}else{'false'}
$content = Set-EnvValue $content 'HIPICO_LAB_SEND_ENABLED' $sendEnabled
[IO.File]::WriteAllText($envPath,$content,[Text.UTF8Encoding]::new($false))

Write-Host ''
Write-Host '[1/6] Validando token del backend...'
$validation = Validate-Token $token
if($validation -ne 'ok'){
  try { Set-Clipboard -Value $token } catch {}
  Write-Host ''
  Write-Host 'Debemos sincronizar UNA VEZ HIPICO_GROUP_BRIDGE_TOKEN en Vercel.' -ForegroundColor Yellow
  Write-Host 'El token ya esta en el portapapeles. Edita la variable existente, guarda y redeploy de main.' -ForegroundColor Cyan
  Start-Process $vercelEnvUrl
  Read-Host 'Cuando hayas guardado y lanzado el Redeploy, vuelve aqui y presiona ENTER'
  $ok = $false
  for($i=1; $i -le 30; $i++){
    $validation = Validate-Token $token
    if($validation -eq 'ok'){$ok=$true;break}
    if($validation -eq 'not-found'){Fail 'El endpoint del Bridge no existe en produccion.'}
    Write-Host "Intento $i/30: esperando Vercel..."
    Start-Sleep -Seconds 10
  }
  if(-not $ok){Start-Process $vercelDeployUrl;Fail 'Vercel no reconocio el token en 5 minutos.'}
}
Write-Host 'Backend autenticado: OK' -ForegroundColor Green

Write-Host ''
Write-Host '[2/6] Instalando/verificando Playwright Core 1.62.1...'
npm install --no-fund --no-audit
if($LASTEXITCODE -ne 0){Fail 'npm install termino con error.'}

Write-Host ''
Write-Host '[3/6] Verificando codigo...'
npm run check
if($LASTEXITCODE -ne 0){Fail 'La verificacion de codigo fallo.'}

Write-Host ''
Write-Host '[4/6] Probando Chrome/Edge con Playwright...'
npm run selftest
if($LASTEXITCODE -ne 0){Fail 'El navegador no paso el self-test.'}

$content = Get-Content $envPath -Raw
$historyEnabled = (Get-EnvValue $content 'HIPICO_HISTORY_SYNC_ON_START' 'true').ToLowerInvariant() -eq 'true'
Write-Host ''
Write-Host '[5/6] Historico oficial TRIPLE CROWN...'
if($historyEnabled -and -not (History-IsComplete)){
  Write-Host 'Se ejecutara el backfill de todo el historico que WhatsApp Web permita cargar.' -ForegroundColor Cyan
  Write-Host 'Puede tardar bastante si existen miles de mensajes. Es reanudable e idempotente.' -ForegroundColor Cyan
  npm run history
  if($LASTEXITCODE -ne 0){
    Write-Host 'El historico no termino completamente. Los pendientes quedaron guardados; continuaremos en vivo y el proximo arranque reintentara.' -ForegroundColor Yellow
  }
} elseif($historyEnabled) {
  Write-Host 'Historico ya marcado como completo respecto de lo disponible en WhatsApp Web. Se omite el backfill.' -ForegroundColor Green
} else {
  Write-Host 'Backfill historico deshabilitado por HIPICO_HISTORY_SYNC_ON_START=false.' -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'Fuente oficial: CLUB HIPICO TRIPLE CROWN (solo lectura)' -ForegroundColor Green
Write-Host "Laboratorio: $labGroupName" -ForegroundColor Green
Write-Host "Espejo hacia LAB actualmente: $sendEnabled" -ForegroundColor Yellow
if($sendEnabled -ne 'true'){
  $answer = Read-Host 'Quieres habilitar AHORA respuestas simuladas SOLO en el grupo LAB? escribe SI para habilitar'
  if($answer.Trim().ToUpperInvariant() -eq 'SI'){
    $content = Get-Content $envPath -Raw
    $content = Set-EnvValue $content 'HIPICO_LAB_SEND_ENABLED' 'true'
    [IO.File]::WriteAllText($envPath,$content,[Text.UTF8Encoding]::new($false))
    Write-Host 'Espejo LAB habilitado. El grupo oficial sigue sin ruta de envio.' -ForegroundColor Green
  } else {
    Write-Host 'Espejo LAB seguira deshabilitado; solo se almacenaran predicciones shadow.' -ForegroundColor Yellow
  }
}

Write-Host ''
Write-Host '[6/6] Iniciando escucha en tiempo real...' -ForegroundColor Cyan
Write-Host 'El grupo fuente puede permanecer archivado: se usa tambien la busqueda global.' -ForegroundColor Green
Write-Host 'NO desarchives ni cambies el grupo solo para el Bridge.' -ForegroundColor Green
Write-Host ''

npm start
if($LASTEXITCODE -ne 0){Fail 'El Bridge termino con error. Envia data\bridge.log, data\history-sync-report.json y data\last-error.png si existe.'}
