$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$envPath = Join-Path $here '.env'
$examplePath = Join-Path $here '.env.example'
$appDataDir = Join-Path $env:APPDATA 'ControlHipico'
$protectedTokenPath = Join-Path $appDataDir 'bridge-token.dpapi'
$vercelEnvUrl = 'https://vercel.com/adelvismartin-6485s-projects/conta-gest-frontend/settings/environment-variables'
$vercelDeployUrl = 'https://vercel.com/adelvismartin-6485s-projects/conta-gest-frontend/deployments'
$ingestUrl = 'https://conta-gest-frontend.vercel.app/api/v1/hipico-bot/bridge/events'
$groupName = 'Control h' + [char]0x00ED + 'pico lab'

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

Write-Host ''
Write-Host '========================================================'
Write-Host ' CONTROL HIPICO - WHATSAPP WEB BRIDGE v1.0.0'
Write-Host ' Chrome oficial + Playwright 1.62.1'
Write-Host '========================================================'
Write-Host ''
Write-Host 'No depende de ninguna carpeta o version anterior.'
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
$content = Set-EnvValue $content 'HIPICO_GROUP_NAME' $groupName
$content = Set-EnvValue $content 'HIPICO_ALLOW_SEND' 'false'
$content = Set-EnvValue $content 'HIPICO_POLL_MS' '1000'
$content = Set-EnvValue $content 'HIPICO_BACKEND_TIMEOUT_MS' '15000'
[IO.File]::WriteAllText($envPath,$content,[Text.UTF8Encoding]::new($false))

Write-Host ''
Write-Host '[1/5] Validando token del backend...'
$validation = Validate-Token $token
if($validation -ne 'ok'){
  try { Set-Clipboard -Value $token } catch {}
  Write-Host ''
  Write-Host 'Debemos sincronizar UNA VEZ la variable existente de Vercel.' -ForegroundColor Yellow
  Write-Host 'No crees otra variable. El token nuevo ya esta en el portapapeles.' -ForegroundColor Yellow
  Write-Host 'Edita HIPICO_GROUP_BRIDGE_TOKEN, manten Production, guarda y redeploy de main.' -ForegroundColor Cyan
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
  if(-not $ok){Start-Process $vercelDeployUrl;Fail 'Vercel no reconocio el token en 5 minutos. Comprueba que el deployment termino READY.'}
}
Write-Host 'Backend autenticado: OK' -ForegroundColor Green

Write-Host ''
Write-Host '[2/5] Instalando Playwright Core 1.62.1...'
npm install --no-fund --no-audit
if($LASTEXITCODE -ne 0){Fail 'npm install termino con error.'}

Write-Host ''
Write-Host '[3/5] Verificando codigo...'
npm run check
if($LASTEXITCODE -ne 0){Fail 'La verificacion de codigo fallo.'}

Write-Host ''
Write-Host '[4/5] Probando Chrome/Edge con Playwright...'
npm run selftest
if($LASTEXITCODE -ne 0){Fail 'El navegador no paso el self-test.'}

Write-Host ''
Write-Host '[5/5] Abriendo WhatsApp Web OFICIAL...' -ForegroundColor Cyan
Write-Host 'La ventana usa web.whatsapp.com real. Deja abierto Control hipico lab.' -ForegroundColor Green
Write-Host 'HIPICO_ALLOW_SEND=false: el Bridge no puede responder.' -ForegroundColor Green
Write-Host ''

npm start
if($LASTEXITCODE -ne 0){Fail 'El Bridge termino con error. Envia data\bridge.log y data\last-error.png si existe.'}
