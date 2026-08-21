param(
  [switch]$SkipInstall,
  [switch]$SkipDeepBrowser
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Fail([string]$Message) {
  Write-Host "`n$Message" -ForegroundColor Red
  exit 1
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) { Fail 'Falta Node.js 22 LTS.' }
$nodeVersion = & $node.Source -p "process.versions.node"
if ([int]($nodeVersion.Split('.')[0]) -ne 22) { Fail "Se requiere Node.js 22.x. Detectado: v$nodeVersion" }

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) { Fail 'No encuentro npm.cmd.' }

Write-Host ''
Write-Host '====================================================================' -ForegroundColor Cyan
Write-Host ' CONTAGEST · QA VISUAL SYSTEM v12 · ITERACION EXHAUSTIVA POR MODULO' -ForegroundColor Cyan
Write-Host '====================================================================' -ForegroundColor Cyan
Write-Host 'Audita cascada CSS, duplicados, tokens, vistas, overflow, solapamientos,' -ForegroundColor DarkGray
Write-Host 'KPI, tipografia, formularios, tablas, controles y geometria light/dark.' -ForegroundColor DarkGray
Write-Host 'Viewports objetivo: 360, 390, 430, 768, 1024 y 1440 px.' -ForegroundColor DarkGray
Write-Host ''

$total = if ($SkipDeepBrowser) { 4 } else { 5 }
$step = 1

if (-not $SkipInstall) {
  Write-Host "[$step/$total] Instalando dependencias bloqueadas..." -ForegroundColor Cyan
  & $npm.Source ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Fail 'npm ci fallo.' }
  $step++
}

Write-Host "[$step/$total] Auditoria estatica de vistas + cascada CSS..." -ForegroundColor Cyan
& $npm.Source run audit:visual
if ($LASTEXITCODE -ne 0) { Fail 'La auditoria estructural visual fallo.' }
$step++

Write-Host "[$step/$total] Contrato estatico del sistema visual..." -ForegroundColor Cyan
& $npm.Source run test:visual
if ($LASTEXITCODE -ne 0) { Fail 'El contrato estatico visual fallo.' }
$step++

Write-Host "[$step/$total] Playwright visual/responsive base..." -ForegroundColor Cyan
& $npm.Source run test:browser:visual
if ($LASTEXITCODE -ne 0) { Fail 'El QA visual base fallo. Revisa ruta y viewport reportados.' }
$step++

if (-not $SkipDeepBrowser) {
  Write-Host "[$step/$total] Iteracion profunda por todos los modulos..." -ForegroundColor Cyan
  & $npm.Source run test:browser:visual:deep
  if ($LASTEXITCODE -ne 0) { Fail 'La matriz visual profunda detecto problemas. Revisa adjuntos y detalle de rutas.' }
}

Write-Host ''
Write-Host 'QA VISUAL COMPLETO: PASS' -ForegroundColor Green
Write-Host 'Reportes:' -ForegroundColor Green
Write-Host '  artifacts\qa\visual-source-audit.md' -ForegroundColor DarkGray
Write-Host '  artifacts\qa\visual-source-audit.json' -ForegroundColor DarkGray
Write-Host ''
Write-Host 'Un PASS solo significa que las verificaciones realmente ejecutadas pasaron en este equipo.' -ForegroundColor Green
