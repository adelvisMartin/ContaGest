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
Write-Host ' CONTAGEST · QA VISUAL CONSOLIDATION v13 · 58 MODULOS' -ForegroundColor Cyan
Write-Host '====================================================================' -ForegroundColor Cyan
Write-Host 'Gate estricto: skills/agents, ownership CSS, seis pilares, temas, rutas,' -ForegroundColor DarkGray
Write-Host 'overflow, solapamientos, KPI, forms, tablas, accesibilidad y light/dark.' -ForegroundColor DarkGray
Write-Host 'Viewports objetivo: 360, 390, 430, 768, 1024 y 1440 px.' -ForegroundColor DarkGray
Write-Host ''

$total = if ($SkipDeepBrowser) { 5 } else { 6 }
$step = 1

if (-not $SkipInstall) {
  Write-Host "[$step/$total] Instalando dependencias bloqueadas..." -ForegroundColor Cyan
  & $npm.Source ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Fail 'npm ci fallo.' }
  $step++
}

Write-Host "[$step/$total] Verificando skills/agentes pinned..." -ForegroundColor Cyan
& $npm.Source run skills:check
if ($LASTEXITCODE -ne 0) { Fail 'La verificacion de skills/agentes fallo.' }
$step++

Write-Host "[$step/$total] Auditoria ESTRICTA de rutas + source + cascada..." -ForegroundColor Cyan
& $npm.Source run audit:visual:strict
if ($LASTEXITCODE -ne 0) { Fail 'El gate estructural visual v13 fallo. Revisa artifacts\qa\visual-source-audit.md.' }
$step++

Write-Host "[$step/$total] Contratos estaticos visuales v12/v13..." -ForegroundColor Cyan
& $npm.Source run test:visual
if ($LASTEXITCODE -ne 0) { Fail 'Los contratos estaticos visuales fallaron.' }
$step++

Write-Host "[$step/$total] Playwright visual/responsive base..." -ForegroundColor Cyan
& $npm.Source run test:browser:visual
if ($LASTEXITCODE -ne 0) { Fail 'El QA visual base fallo. Revisa ruta, estado y viewport reportados.' }
$step++

if (-not $SkipDeepBrowser) {
  Write-Host "[$step/$total] Playwright profundo: 58 rutas + moviles criticos..." -ForegroundColor Cyan
  & $npm.Source run test:browser:visual:deep
  if ($LASTEXITCODE -ne 0) { Fail 'La matriz visual profunda detecto problemas. Revisa screenshots y detalle de rutas.' }
}

Write-Host ''
Write-Host 'QA VISUAL v13: PASS' -ForegroundColor Green
Write-Host 'Reportes:' -ForegroundColor Green
Write-Host '  artifacts\qa\visual-source-audit.md' -ForegroundColor DarkGray
Write-Host '  artifacts\qa\visual-source-audit.json' -ForegroundColor DarkGray
Write-Host ''
Write-Host 'Este PASS solo se imprime si source gate, contratos y Playwright ejecutados arriba finalizaron en verde.' -ForegroundColor Green
