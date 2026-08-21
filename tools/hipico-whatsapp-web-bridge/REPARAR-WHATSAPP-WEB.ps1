$ErrorActionPreference = 'Stop'
$baseDir = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'ControlHipicoBridge'))
$dataDir = [IO.Path]::GetFullPath((Join-Path $baseDir 'data'))
$profileDir = [IO.Path]::GetFullPath((Join-Path $dataDir 'chrome-profile'))
$prefix = $dataDir.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $profileDir.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) {
  throw "Perfil fuera del directorio autorizado: $profileDir"
}
if (-not (Test-Path -LiteralPath $profileDir)) {
  Write-Host 'No existe un perfil dedicado que reparar.' -ForegroundColor Yellow
  exit 0
}
$target = [IO.Path]::GetFullPath((Join-Path $dataDir ("chrome-profile-quarantine-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))))
if (-not $target.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) {
  throw "Destino fuera del directorio autorizado: $target"
}
Move-Item -LiteralPath $profileDir -Destination $target
Write-Host "Perfil preservado en: $target" -ForegroundColor Green
Write-Host 'Ejecuta de nuevo el Bridge para vincular WhatsApp mediante QR.' -ForegroundColor Cyan
