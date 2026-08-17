$ErrorActionPreference = 'Stop'

$bridgeDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $bridgeDir '..\..')
$envPath = Join-Path $bridgeDir '.env'
$envExamplePath = Join-Path $bridgeDir '.env.example'
$groupName = 'Control h' + [char]0x00ED + 'pico lab'

function Require-Command([string]$Name, [string]$InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "No se encontro '$Name'. $InstallHint"
  }
}

function New-BridgeToken {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  }
  finally {
    $rng.Dispose()
  }
  return ([System.BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}

Write-Host ''
Write-Host '==============================================='
Write-Host ' Control Hipico - WhatsApp Group Bridge'
Write-Host ' Configuracion automatica para Windows'
Write-Host '==============================================='
Write-Host ''

Require-Command 'git' 'Instala Git para Windows y vuelve a ejecutar este archivo.'
Require-Command 'node' 'Instala Node.js 22 o superior y vuelve a ejecutar este archivo.'
Require-Command 'npm' 'npm debe instalarse junto con Node.js.'

$nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 22) {
  throw "Control Hipico requiere Node.js 22 o superior. Version detectada: $(node -v)"
}

Write-Host '[1/5] Actualizando el repositorio...'
Push-Location $repoRoot
try {
  git pull --ff-only
  if ($LASTEXITCODE -ne 0) {
    throw 'git pull fallo. Revisa si tienes cambios locales o si GitHub pide autenticacion.'
  }
}
finally {
  Pop-Location
}

Write-Host '[2/5] Instalando dependencias del Bridge sin descargar Chromium...'
Push-Location $bridgeDir
try {
  # whatsapp-web.js usa Puppeteer, pero en Windows el Bridge usa Chrome/Edge ya instalado.
  # Esto evita el postinstall que intenta descargar chrome-headless-shell y puede fallar
  # por archivos parciales/EPERM en la cache local de Puppeteer.
  $env:PUPPETEER_SKIP_DOWNLOAD = 'true'
  $env:PUPPETEER_SKIP_CHROME_HEADLESS_SHELL_DOWNLOAD = 'true'
  npm install
  if ($LASTEXITCODE -ne 0) {
    throw 'npm install fallo.'
  }
}
finally {
  Pop-Location
}

Write-Host '[3/5] Preparando .env local...'
if (-not (Test-Path $envExamplePath)) {
  throw "No existe $envExamplePath"
}
if (-not (Test-Path $envPath)) {
  Copy-Item $envExamplePath $envPath
}

$content = Get-Content $envPath -Raw

function Set-EnvValue([string]$Text, [string]$Name, [string]$Value) {
  $escaped = [Regex]::Escape($Name)
  if ($Text -match "(?m)^$escaped=") {
    return [Regex]::Replace($Text, "(?m)^$escaped=.*$", "$Name=$Value")
  }
  if (-not $Text.EndsWith("`n")) { $Text += "`r`n" }
  return $Text + "$Name=$Value`r`n"
}

$content = Set-EnvValue $content 'HIPICO_INGEST_URL' 'https://conta-gest-frontend.vercel.app/api/v1/hipico-bot/bridge/events'
$content = Set-EnvValue $content 'HIPICO_GROUP_NAME' $groupName
$content = Set-EnvValue $content 'HIPICO_SHADOW_MODE' 'false'
$content = Set-EnvValue $content 'HIPICO_ALLOW_SEND' 'false'
$content = Set-EnvValue $content 'HIPICO_INCLUDE_OWN_MESSAGES' 'true'

$currentToken = ''
$tokenMatch = [Regex]::Match($content, '(?m)^HIPICO_GROUP_BRIDGE_TOKEN=(.*)$')
if ($tokenMatch.Success) {
  $currentToken = $tokenMatch.Groups[1].Value.Trim()
}

if ([string]::IsNullOrWhiteSpace($currentToken) -or $currentToken -eq 'CAMBIA_ESTE_SECRETO_LARGO') {
  $currentToken = New-BridgeToken
  $content = Set-EnvValue $content 'HIPICO_GROUP_BRIDGE_TOKEN' $currentToken
  try { Set-Clipboard -Value $currentToken } catch {}
  Write-Host ''
  Write-Host 'Se genero HIPICO_GROUP_BRIDGE_TOKEN y se copio al portapapeles.'
  Write-Host 'Edita la variable HIPICO_GROUP_BRIDGE_TOKEN que YA existe en Vercel Production y pega este valor.'
}

[System.IO.File]::WriteAllText($envPath, $content, [System.Text.UTF8Encoding]::new($false))

Write-Host '[4/5] Configuracion lista.'
Write-Host "  Grupo: $groupName"
Write-Host '  Envios al grupo: DESACTIVADOS'
Write-Host '  Modo backend: SHADOW'
Write-Host ''
Write-Host '[5/5] Iniciando WhatsApp Bridge...'
Write-Host ''
Write-Host 'Cuando aparezca el QR:'
Write-Host 'WhatsApp/WhatsApp Business > Dispositivos vinculados > Vincular dispositivo.'
Write-Host 'Escanealo con el segundo numero que pertenece al grupo de laboratorio.'
Write-Host ''

Push-Location $bridgeDir
try {
  npm start
  if ($LASTEXITCODE -ne 0) {
    throw 'El Bridge termino con error.'
  }
}
finally {
  Pop-Location
}
