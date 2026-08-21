param([switch]$SkipInstall)

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
Write-Host '==============================================================' -ForegroundColor Cyan
Write-Host ' CONTAGEST · QA VISUAL SYSTEM v12' -ForegroundColor Cyan
Write-Host '==============================================================' -ForegroundColor Cyan
Write-Host 'Viewports objetivo: 360, 390, 430, 768, 1024 y 1440 px.' -ForegroundColor DarkGray
Write-Host 'Valida: overflow, solapamientos, jerarquía, KPI, forms, tablas y light/dark.' -ForegroundColor DarkGray
Write-Host ''

if (-not $SkipInstall) {
  Write-Host '[1/3] Instalando dependencias bloqueadas...' -ForegroundColor Cyan
  & $npm.Source ci --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Fail 'npm ci falló.' }
}

Write-Host '[2/3] Contrato estático del sistema visual...' -ForegroundColor Cyan
& $npm.Source run test:visual
if ($LASTEXITCODE -ne 0) { Fail 'El contrato estático visual falló.' }

Write-Host '[3/3] Playwright visual/responsive en rutas ERP...' -ForegroundColor Cyan
& $npm.Source run test:browser:visual
if ($LASTEXITCODE -ne 0) { Fail 'El QA visual de navegador falló. Revisa la ruta y viewport reportados.' }

Write-Host ''
Write-Host 'QA VISUAL: PASS' -ForegroundColor Green
Write-Host 'Antes de merge, revisa también manualmente dashboard, ventas, contabilidad, admin y verticales críticas.' -ForegroundColor Green
