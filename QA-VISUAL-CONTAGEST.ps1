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
Write-Host ' CONTAGEST · QA ERP UX v15 · 58 MODULOS · LIGHT/DARK' -ForegroundColor Cyan
Write-Host '====================================================================' -ForegroundColor Cyan
Write-Host 'Source ownership, shell, contraste WCAG, responsive, 58 rutas,' -ForegroundColor DarkGray
Write-Host 'formularios, handlers, overflow, KPIs, agendas y browser real.' -ForegroundColor DarkGray
Write-Host 'Viewports objetivo: 360, 390, 430, 768, 1024 y 1440 px.' -ForegroundColor DarkGray
Write-Host ''

$total = if ($SkipDeepBrowser) { 8 } else { 10 }
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

Write-Host "[$step/$total] Auditoria ESTRICTA visual/source/shell..." -ForegroundColor Cyan
& $npm.Source run audit:visual:strict
if ($LASTEXITCODE -ne 0) { Fail 'El gate estructural visual v15 fallo. Revisa artifacts\qa\visual-source-audit.md.' }
$step++

Write-Host "[$step/$total] Auditoria FUNCIONAL ESTRICTA de las 58 rutas..." -ForegroundColor Cyan
& $npm.Source run audit:functions:strict
if ($LASTEXITCODE -ne 0) { Fail 'El gate funcional de las 58 rutas fallo. Revisa artifacts\qa\module-function-audit.md.' }
$step++

Write-Host "[$step/$total] Contratos estaticos visuales/funcionales v15..." -ForegroundColor Cyan
& $npm.Source run test:visual
if ($LASTEXITCODE -ne 0) { Fail 'Los contratos estaticos visuales v15 fallaron.' }
$step++

Write-Host "[$step/$total] Playwright visual/responsive base..." -ForegroundColor Cyan
& $npm.Source run test:browser:visual
if ($LASTEXITCODE -ne 0) { Fail 'El QA visual base fallo. Revisa ruta, estado y viewport reportados.' }
$step++

Write-Host "[$step/$total] Playwright contraste Light/Dark sobre 58 rutas..." -ForegroundColor Cyan
& $npm.Source run test:browser:contrast
if ($LASTEXITCODE -ne 0) { Fail 'El QA de contraste v15 detecto texto insuficientemente legible. Revisa screenshots de Playwright.' }
$step++

Write-Host "[$step/$total] Playwright funcional: rutas, shell y agendas..." -ForegroundColor Cyan
& $npm.Source run test:browser:functional
if ($LASTEXITCODE -ne 0) { Fail 'El smoke funcional browser fallo. Revisa el flujo y trace de Playwright.' }
$step++

if (-not $SkipDeepBrowser) {
  Write-Host "[$step/$total] Playwright profundo: 58 rutas + moviles criticos..." -ForegroundColor Cyan
  & $npm.Source run test:browser:visual:deep
  if ($LASTEXITCODE -ne 0) { Fail 'La matriz visual profunda detecto problemas. Revisa screenshots y detalle de rutas.' }
  $step++

  Write-Host "[$step/$total] Build final del frontend despues del QA..." -ForegroundColor Cyan
  & $npm.Source run build:frontend
  if ($LASTEXITCODE -ne 0) { Fail 'El build final frontend fallo.' }
}

Write-Host ''
Write-Host 'QA ERP UX v15: PASS' -ForegroundColor Green
Write-Host 'Reportes:' -ForegroundColor Green
Write-Host '  artifacts\qa\visual-source-audit.md' -ForegroundColor DarkGray
Write-Host '  artifacts\qa\visual-source-audit.json' -ForegroundColor DarkGray
Write-Host '  artifacts\qa\module-function-audit.md' -ForegroundColor DarkGray
Write-Host '  artifacts\qa\module-function-audit.json' -ForegroundColor DarkGray
Write-Host ''
Write-Host 'Este PASS solo aparece si source, contratos, contraste, browser y build se ejecutaron realmente.' -ForegroundColor Green
