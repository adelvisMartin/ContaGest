#requires -Version 5.1
# Control Hipico #837: disposable PostgreSQL17 QA on Docker Desktop for Windows.
# No shared databases, no persistent volumes, and no remote host access.
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$composeFile = Join-Path $repoRoot 'ops/qa/hipico-domain-snapshot-pg17.compose.yml'
$project = 'hipico837' + [guid]::NewGuid().ToString('N').Substring(0, 12)
$dockerArgs = @('compose', '-p', $project, '-f', $composeFile)
$envNames = @(
  'HIPICO_QA_PG_PASSWORD', 'HIPICO_E2E_ADMIN_URL', 'HIPICO_E2E_RUN_ID',
  'HIPICO_E2E_STATE_FILE', 'HIPICO_E2E_DATABASE_NAME', 'DATABASE_URL',
  'DIRECT_DATABASE_URL'
)
$original = @{}
foreach ($name in $envNames) {
  $original[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}
$composeStarted = $false
$testPassed = $false
$headSha = ''
$cleanupFailures = New-Object 'System.Collections.Generic.List[string]'
$stateFile = Join-Path $repoRoot ('artifacts/qa/hipico-v290/database-state-' + $project + '.json')

function Assert-Exit([string]$activity) {
  if ($LASTEXITCODE -ne 0) {
    throw ('PG17 QA failed at ' + $activity + ', exit=' + $LASTEXITCODE)
  }
}
function Set-QAEnv([string]$name, [string]$value) {
  [Environment]::SetEnvironmentVariable($name, $value, 'Process')
}

Push-Location $repoRoot
try {
  # Refuse inherited privileged/runtime connection overrides before any SQL.
  if ($env:DATABASE_RUNTIME_URL -or $env:VERCEL_ENV -or $env:NODE_ENV -eq 'production' -or $env:GITHUB_ENV) {
    throw 'PG17 QA refuses production/serverless/runtime credentials and CI environment overrides.'
  }
  foreach ($command in @('docker', 'node', 'npm', 'git')) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
      throw ('PG17 QA requires ' + $command)
    }
  }
  & docker compose version
  Assert-Exit 'docker compose version'
  & docker info --format '{{.ServerVersion}}'
  Assert-Exit 'Docker Desktop connectivity'
  & node -v
  Assert-Exit 'node version'
  $nodeVersion = (& node -p "process.versions.node.split('.')[0]").Trim()
  if ($nodeVersion -ne '22') {
    throw 'PG17 QA requires Node.js 22.'
  }

  $headSha = (& git rev-parse HEAD).Trim()
  Assert-Exit 'resolve candidate SHA'
  if ($headSha -notmatch '^[0-9a-f]{40}$') { throw 'Candidate SHA invalid.' }
  $dirty = (& git status --porcelain --untracked-files=normal)
  Assert-Exit 'candidate worktree status'
  if ($dirty) { throw 'Refusing to certify a dirty worktree; commit or stash changes first.' }

  & node --test tests/hipico_domain_snapshot_workflow_contract.test.mjs
  Assert-Exit 'static PG17 QA workflow contracts'
  & npm ci --workspace backend --include-workspace-root --no-audit --no-fund
  Assert-Exit 'locked dependency install'
  & node scripts/agent-ticket-router.mjs gates --base origin/main --type bugfix
  Assert-Exit 'Agent System v3 domain routing'
  & npm --workspace backend run lint
  Assert-Exit 'backend lint/typecheck'
  & npm --workspace backend run test:hipico
  Assert-Exit 'backend Hípico unit/contracts'
  & npm --workspace backend run build
  Assert-Exit 'backend build'

  $qaPassword = 'hipico_qa_' + [guid]::NewGuid().ToString('N')
  Set-QAEnv 'HIPICO_QA_PG_PASSWORD' $qaPassword
  Set-QAEnv 'HIPICO_E2E_RUN_ID' $project
  Set-QAEnv 'HIPICO_E2E_STATE_FILE' $stateFile

  # Compose --wait watches the service health check instead of using fixed sleeps.
  & docker @dockerArgs config --quiet
  Assert-Exit 'isolated Compose configuration'
  $composeStarted = $true
  & docker @dockerArgs up -d --wait --wait-timeout 120
  Assert-Exit 'isolated PG17 startup'
  $binding = (& docker @dockerArgs port postgres17 5432 | Select-Object -First 1)
  Assert-Exit 'loopback port lookup'
  if (-not ([string]$binding -match '^127\.0\.0\.1:(\d+)$')) {
    throw 'Unsafe Docker published address; required 127.0.0.1 with ephemeral port.'
  }
  $hostPort = [int]$Matches[1]
  $adminUrl = 'postgresql://postgres:' + $qaPassword + '@127.0.0.1:' + $hostPort + '/postgres'
  Set-QAEnv 'HIPICO_E2E_ADMIN_URL' $adminUrl

  & node scripts/hipico-ephemeral-db-v290.mjs create
  Assert-Exit 'ephemeral database creation'
  $state = Get-Content $stateFile -Raw -Encoding UTF8 | ConvertFrom-Json
  $database = [string]$state.databaseName
  if ($database -notmatch '^hipico_e2e_[a-z0-9_]{8,63}$') {
    throw 'Ephemeral database allocator returned an unexpected database name.'
  }
  Set-QAEnv 'HIPICO_E2E_DATABASE_NAME' $database
  $url = 'postgresql://postgres:' + $qaPassword + '@127.0.0.1:' + $hostPort + '/' + $database
  Set-QAEnv 'DATABASE_URL' $url
  Set-QAEnv 'DIRECT_DATABASE_URL' $url

  $roles = @'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END
$$;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO authenticated;
'@
  $roles | & docker @dockerArgs exec -T postgres17 psql -v ON_ERROR_STOP=1 -U postgres -d $database
  Assert-Exit 'QA-only role and auth.uid fixture'

  # Copy migration files as bytes to avoid PowerShell's native-process pipe encoding.
  $containerId = (& docker @dockerArgs ps -q postgres17 | Select-Object -First 1)
  Assert-Exit 'Compose service lookup'
  if (-not ([string]$containerId -match '^[0-9a-f]{12,64}$')) {
    throw 'Cannot identify isolated QA container.'
  }
  $migrations = @(
    'supabase/sql/hipico_v14_canonical_domain.sql',
    'supabase/sql/hipico_v16_operator_confirmation_audit.sql',
    'backend/prisma/migrations/20260911211500_hipico_domain_source_identity/migration.sql',
    'backend/prisma/migrations/20261119144500_hipico_domain_recorded_order_index/migration.sql'
  )
  for ($index = 0; $index -lt $migrations.Count; $index++) {
    $from = Join-Path $repoRoot $migrations[$index]
    $target = '/tmp/hipico-qa-migration-' + $index + '.sql'
    & docker cp $from ($containerId + ':' + $target)
    Assert-Exit ('copy migration ' + $migrations[$index])
    & docker @dockerArgs exec -T postgres17 psql -v ON_ERROR_STOP=1 -U postgres -d $database -f $target
    Assert-Exit ('apply migration ' + $migrations[$index])
  }
  'GRANT SELECT ON public.hipico_domain_aggregates, public.hipico_domain_events TO authenticated;' |
    & docker @dockerArgs exec -T postgres17 psql -v ON_ERROR_STOP=1 -U postgres -d $database
  Assert-Exit 'fixture-only RLS reader grants'

  & npm --workspace backend exec -- tsx --test src/modules/hipico-bot/hipico-domain-query.pg17.integration.ts
  Assert-Exit 'real PG17 snapshot, concurrency and RLS'
  $dirtyAfter = (& git status --porcelain --untracked-files=normal)
  Assert-Exit 'post-test candidate worktree status'
  if ($dirtyAfter) { throw 'Generated or test files modified the candidate worktree.' }
  $testPassed = $true
}
finally {
  try {
    if (Test-Path $stateFile) {
      & node scripts/hipico-ephemeral-db-v290.mjs drop
      if ($LASTEXITCODE -ne 0) { $cleanupFailures.Add('ephemeral DB drop') }
    }
  }
  catch { $cleanupFailures.Add('ephemeral DB drop: ' + $_.Exception.Message) }
  try {
    if ($composeStarted) {
      & docker @dockerArgs down --volumes --remove-orphans
      if ($LASTEXITCODE -ne 0) { $cleanupFailures.Add('Docker Compose down') }
    }
  }
  catch { $cleanupFailures.Add('Docker Compose down: ' + $_.Exception.Message) }
  foreach ($name in $envNames) {
    [Environment]::SetEnvironmentVariable($name, $original[$name], 'Process')
  }
  Pop-Location
  if ($cleanupFailures.Count -gt 0) {
    throw ('PG17 QA cleanup incomplete: ' + ($cleanupFailures -join '; '))
  }
  if ($testPassed) {
    Write-Output ('PG17 QA PASS at SHA ' + $headSha + ': backend lint, tests, build, repeatable-read concurrency, RLS A/B and disposable database cleanup.')
  }
}
