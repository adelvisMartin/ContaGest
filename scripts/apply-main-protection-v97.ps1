param(
  [switch]$Full,
  [switch]$Issue134Recovered
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Falta '$Name' en PATH."
  }
}

Require-Command 'node'
Require-Command 'gh'

Write-Host 'Verificando autenticacion GitHub CLI...'
& gh auth status
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI no esta autenticado.' }

$argsCommon = @()
if ($Full) {
  $argsCommon += '--full'
  if (-not $Issue134Recovered) {
    throw 'El perfil full requiere -Issue134Recovered y evidencia real de que #134 recupero runners.'
  }
  $argsCommon += '--issue-134-recovered'
}

Write-Host 'Plan:'
& node scripts/github-main-protection-v97.mjs plan @argsCommon
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'Aplicando proteccion a main...'
& node scripts/github-main-protection-v97.mjs apply @argsCommon
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'Verificacion independiente:'
& node scripts/github-main-protection-v97.mjs verify @argsCommon
exit $LASTEXITCODE
