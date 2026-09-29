#!/usr/bin/env node
import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const CATEGORY = Object.freeze({
  AUTHORITY_CONFLICT: 'AUTHORITY_CONFLICT',
  MIGRATION_HISTORY_MUTATED: 'MIGRATION_HISTORY_MUTATED',
  FROM_ZERO_FAILED: 'FROM_ZERO_FAILED',
  UPGRADE_DIVERGENCE: 'UPGRADE_DIVERGENCE',
  TYPE_MISMATCH: 'TYPE_MISMATCH',
  CONSTRAINT_MISMATCH: 'CONSTRAINT_MISMATCH',
  TENANT_ISOLATION_RISK: 'TENANT_ISOLATION_RISK',
  DRIFT_DETECTED: 'DRIFT_DETECTED',
  PASS: 'PASS',
});

const TEMPORAL_KEYS = new Set(['startedAt', 'finishedAt', 'generatedAt', 'durationMs', 'manifestSha256']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const EPHEMERAL_DATABASE = /(_e2e|_drill|_restore)$/;
const MIGRATIONS_PREFIX = 'backend/prisma/migrations/';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !TEMPORAL_KEYS.has(key))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, stable(nested)])
    );
  }
  return value;
}

export function deterministicManifestHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

export function sanitizeText(value) {
  let text = String(value ?? '');
  text = text.replace(/bearer\s+[^\s]+/gi, 'Bearer [REDACTED]');
  text = text.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, (match) => {
    try {
      const url = new URL(match);
      url.username = '';
      url.password = '';
      return url.toString().replace('://@', '://');
    } catch {
      return '[REDACTED_DATABASE_URL]';
    }
  });
  return text;
}

export function assertDestructiveDatabaseSafe(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || ''));
  } catch {
    throw new Error('DESTRUCTIVE_DATABASE_UNSAFE:INVALID_URL');
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, '').split('/')[0] || '');
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DESTRUCTIVE_DATABASE_UNSAFE:INVALID_PROTOCOL');
  if (!LOOPBACK_HOSTS.has(url.hostname)) throw new Error(`DESTRUCTIVE_DATABASE_UNSAFE:NON_LOOPBACK_HOST=${url.hostname}`);
  if (!EPHEMERAL_DATABASE.test(database)) throw new Error(`DESTRUCTIVE_DATABASE_UNSAFE:NON_EPHEMERAL_DATABASE=${database || 'missing'}`);
  return { database, host: url.hostname };
}

function migrationDirectory(filePath) {
  if (!filePath?.startsWith(MIGRATIONS_PREFIX)) return '';
  return filePath.slice(MIGRATIONS_PREFIX.length).split('/')[0] || '';
}

export function classifyMigrationHistoryChanges(basePaths, changes) {
  const baseDirectories = new Set([...basePaths].map(migrationDirectory).filter(Boolean));
  const mutations = [];
  for (const change of changes) {
    const candidates = [change.oldPath, change.path, change.newPath].filter(Boolean);
    if (candidates.some((filePath) => baseDirectories.has(migrationDirectory(filePath)))) {
      mutations.push(`${change.status}:${candidates.join('->')}`);
    }
  }
  return mutations.length
    ? { category: CATEGORY.MIGRATION_HISTORY_MUTATED, detail: mutations.join(',') }
    : { category: CATEGORY.PASS, detail: 'approved migration history immutable' };
}

export function classifyStepFailure(stepId, output = '') {
  const text = String(output);
  if (stepId === 'history') return { category: CATEGORY.MIGRATION_HISTORY_MUTATED, detail: sanitizeText(text) };
  if (stepId === 'authority' || /MIGRATION_DUPLICATE_AUTHORITY|AUTHORITY_CONFLICT|DUPLICATE_AUTHORITY/i.test(text)) {
    return { category: CATEGORY.AUTHORITY_CONFLICT, detail: sanitizeText(text) };
  }
  if (stepId === 'upgrade' || /UPGRADE_DIVERGENCE/i.test(text)) return { category: CATEGORY.UPGRADE_DIVERGENCE, detail: sanitizeText(text) };
  if (stepId === 'tenant-isolation') return { category: CATEGORY.TENANT_ISOLATION_RISK, detail: sanitizeText(text) };
  if (stepId === 'drift') return { category: CATEGORY.DRIFT_DETECTED, detail: sanitizeText(text) };
  if (stepId === 'prisma-validate' || stepId === 'postgres-version' || /TYPE_MISMATCH|SCHEMA_MISMATCH.*type=/i.test(text)) {
    return { category: CATEGORY.TYPE_MISMATCH, detail: sanitizeText(text) };
  }
  if (stepId === 'raw-sql-security' || /CONSTRAINT|FOREIGN KEY|RLS|GRANT|TRIGGER/i.test(text)) {
    return { category: CATEGORY.CONSTRAINT_MISMATCH, detail: sanitizeText(text) };
  }
  return { category: CATEGORY.FROM_ZERO_FAILED, detail: sanitizeText(text) };
}

export function tenantIsolationSmokeSql() {
  return `BEGIN;
INSERT INTO public."Tenant" ("id","rif","name","plan","status","settings","createdAt","updatedAt") VALUES
('cg632-tenant-a','CG632-A','CG632 Tenant A','trial','active','{}'::jsonb,now(),now()),
('cg632-tenant-b','CG632-B','CG632 Tenant B','trial','active','{}'::jsonb,now(),now());
INSERT INTO public."Role" ("id","tenantId","name","system","createdAt","updatedAt") VALUES
('cg632-role-a','cg632-tenant-a','cg632-shared-role',false,now(),now()),
('cg632-role-b','cg632-tenant-b','cg632-shared-role',false,now(),now());
DO $cg632$
BEGIN
  BEGIN
    INSERT INTO public."Role" ("id","tenantId","name","system","createdAt","updatedAt")
    VALUES ('cg632-role-dup','cg632-tenant-a','cg632-shared-role',false,now(),now());
    RAISE EXCEPTION 'CG632_EXPECTED_UNIQUE_VIOLATION_NOT_RAISED';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public."Role" ("id","tenantId","name","system","createdAt","updatedAt")
    VALUES ('cg632-role-orphan','cg632-tenant-missing','cg632-orphan-role',false,now(),now());
    RAISE EXCEPTION 'CG632_EXPECTED_FOREIGN_KEY_VIOLATION_NOT_RAISED';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END
$cg632$;
ROLLBACK;`;
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function parseNameStatus(text) {
  return String(text || '').split(/\r?\n/).filter(Boolean).map((line) => {
    const parts = line.split('\t');
    const status = parts[0] || '';
    if (/^R|^C/.test(status)) return { status, oldPath: parts[1], newPath: parts[2], path: parts[2] };
    return { status, path: parts[1] };
  });
}

function migrationHistory(repoRoot, baseRef) {
  const candidateSha = git(repoRoot, ['rev-parse', 'HEAD']);
  const baseSha = git(repoRoot, ['merge-base', baseRef, 'HEAD']);
  const baseList = git(repoRoot, ['ls-tree', '-r', '--name-only', baseSha, '--', 'backend/prisma/migrations']);
  const basePaths = new Set(baseList.split(/\r?\n/).filter(Boolean));
  const diff = git(repoRoot, ['diff', '--name-status', `${baseSha}...HEAD`, '--', 'backend/prisma/migrations']);
  const result = classifyMigrationHistoryChanges(basePaths, parseNameStatus(diff));
  const baseTree = git(repoRoot, ['ls-tree', '-r', baseSha, '--', 'backend/prisma/migrations']);
  const candidateTree = git(repoRoot, ['ls-tree', '-r', 'HEAD', '--', 'backend/prisma/migrations']);
  return {
    ...result,
    candidateSha,
    baseSha,
    approvedHistorySha256: crypto.createHash('sha256').update(baseTree).digest('hex'),
    candidateHistorySha256: crypto.createHash('sha256').update(candidateTree).digest('hex'),
  };
}

function pgEnv(rawUrl, env) {
  const url = new URL(rawUrl);
  return {
    ...env,
    PGHOST: url.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: url.port || '5432',
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, '')),
    PGUSER: decodeURIComponent(url.username || ''),
    PGPASSWORD: decodeURIComponent(url.password || ''),
  };
}

function run(command, args, { cwd, env = process.env, input = null } = {}) {
  const executable = process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command;
  const result = spawnSync(executable, args, { cwd, env, input, encoding: 'utf8', shell: false });
  const output = sanitizeText([result.stdout || '', result.stderr || '', result.error?.message || ''].join('\n')).trim();
  return { status: result.error ? null : result.status, output };
}

function runRequired(stepId, command, args, options) {
  const result = run(command, args, options);
  if (result.status !== 0) {
    const mapped = classifyStepFailure(stepId, result.output || `exit=${result.status ?? 'spawn-error'}`);
    const error = new Error(`${mapped.category}:${mapped.detail}`);
    error.category = mapped.category;
    error.stepId = stepId;
    throw error;
  }
  return result;
}

function checkPostgres17(repoRoot, rawUrl, env) {
  const result = runRequired('postgres-version', 'psql', ['-Atqc', 'SHOW server_version_num'], {
    cwd: repoRoot,
    env: pgEnv(rawUrl, env),
  });
  const versionNum = Number(result.output.split(/\s+/).find((token) => /^\d+$/.test(token)) || 0);
  if (versionNum < 170000 || versionNum >= 180000) {
    const error = new Error(`${CATEGORY.TYPE_MISMATCH}:POSTGRES_VERSION_EXPECTED_17:actual=${versionNum || 'unknown'}`);
    error.category = CATEGORY.TYPE_MISMATCH;
    error.stepId = 'postgres-version';
    throw error;
  }
  return versionNum;
}

function runTenantSmoke(repoRoot, rawUrl, env) {
  runRequired('tenant-isolation', 'psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-f', '-'], {
    cwd: repoRoot,
    env: pgEnv(rawUrl, env),
    input: tenantIsolationSmokeSql(),
  });
}

async function readCurrentSchemaManifest(repoRoot) {
  const manifestPath = path.join(repoRoot, 'artifacts', 'migration-chain-v626', 'current-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!manifest.sha256) throw new Error(`${CATEGORY.CONSTRAINT_MISMATCH}:MIGRATION_MANIFEST_HASH_MISSING`);
  return { sha256: manifest.sha256 };
}

async function runOptionalDrift(repoRoot, candidateSha, rawUrl, env, checks) {
  const target = String(env.DATABASE_GATE_DRIFT_TARGET_URL || '').trim();
  if (!target) {
    checks.push({ id: 'drift', status: 'NOT_APPLICABLE', category: CATEGORY.PASS, detail: 'no read-only drift target supplied' });
    return null;
  }
  const projectRef = String(env.DATABASE_GATE_DRIFT_PROJECT_REF || '').trim();
  if (!projectRef) {
    const error = new Error(`${CATEGORY.DRIFT_DETECTED}:DATABASE_GATE_DRIFT_PROJECT_REF_REQUIRED`);
    error.category = CATEGORY.DRIFT_DETECTED;
    error.stepId = 'drift';
    throw error;
  }
  const outDir = path.join('artifacts', 'database-gate-v632', candidateSha, 'drift');
  runRequired('drift', 'node', [
    'scripts/database-drift-audit.mjs',
    '--project-ref', projectRef,
    '--repo-sha', candidateSha,
    '--out', outDir,
  ], {
    cwd: repoRoot,
    env: { ...env, DRIFT_EXPECTED_DATABASE_URL: rawUrl, DRIFT_ACTUAL_DATABASE_URL: target },
  });
  const absolute = path.join(repoRoot, outDir);
  const jsonName = (await readdir(absolute)).find((name) => name.endsWith('.json'));
  if (!jsonName) throw new Error(`${CATEGORY.DRIFT_DETECTED}:DRIFT_MANIFEST_MISSING`);
  const drift = JSON.parse(await readFile(path.join(absolute, jsonName), 'utf8'));
  const total = Number(drift.summary?.total || 0);
  if (total > 0) {
    const error = new Error(`${CATEGORY.DRIFT_DETECTED}:findings=${total}:digest=${drift.deterministicDigest || 'unknown'}`);
    error.category = CATEGORY.DRIFT_DETECTED;
    error.stepId = 'drift';
    throw error;
  }
  checks.push({ id: 'drift', status: 'PASS', category: CATEGORY.PASS, detail: `findings=0 digest=${drift.deterministicDigest || 'unknown'}` });
  return { findings: total, deterministicDigest: drift.deterministicDigest || null };
}

function parseArgs(argv) {
  const out = { base: 'main', expectedSha: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--base') out.base = argv[++index] || 'main';
    else if (arg.startsWith('--base=')) out.base = arg.slice('--base='.length);
    else if (arg === '--expected-sha') out.expectedSha = argv[++index] || '';
    else if (arg.startsWith('--expected-sha=')) out.expectedSha = arg.slice('--expected-sha='.length);
    else throw new Error(`DATABASE_GATE_ARGUMENT_UNKNOWN:${arg}`);
  }
  return out;
}

function humanReport(manifest) {
  const lines = [
    '# Canonical Database Gate #632',
    '',
    `- candidate: \`${manifest.candidateSha}\``,
    `- base: \`${manifest.baseSha}\` (${manifest.baseRef})`,
    `- local verdict: **${manifest.category}**`,
    `- remote CI: ${manifest.remote.ci}`,
    `- remote deploy: ${manifest.remote.deploy}`,
    `- deterministic manifest: \`${manifest.manifestSha256}\``,
    '',
    '## Checks',
    '',
    ...manifest.checks.map((check) => `- ${check.id}: ${check.status} / ${check.category} — ${check.detail}`),
  ];
  return `${lines.join('\n')}\n`;
}

async function executeGate({ repoRoot, baseRef, expectedSha, env }) {
  const dirty = git(repoRoot, ['status', '--porcelain']);
  if (dirty) throw new Error('DATABASE_GATE_WORKTREE_DIRTY');
  const history = migrationHistory(repoRoot, baseRef);
  if (expectedSha && history.candidateSha !== expectedSha) {
    throw new Error(`DATABASE_GATE_SHA_MISMATCH:expected=${expectedSha}:actual=${history.candidateSha}`);
  }
  const rawUrl = String(env.DATABASE_URL || '').trim();
  if (!rawUrl) throw new Error('DATABASE_GATE_DATABASE_URL_REQUIRED:use verify:local database profile or an isolated PostgreSQL 17 URL');
  assertDestructiveDatabaseSafe(rawUrl);

  const checks = [];
  const record = (id, detail = 'PASS') => checks.push({ id, status: 'PASS', category: CATEGORY.PASS, detail });

  runRequired('authority', 'node', ['scripts/database-authority-audit-v6775.mjs'], { cwd: repoRoot, env });
  record('authority', 'declared structural/policy/legacy authorities consistent');

  if (history.category !== CATEGORY.PASS) {
    const error = new Error(`${history.category}:${history.detail}`);
    error.category = history.category;
    error.stepId = 'history';
    throw error;
  }
  record('migration-history', `immutable base=${history.approvedHistorySha256} candidate=${history.candidateHistorySha256}`);

  runRequired('prisma-validate', 'npm', ['--workspace', 'backend', 'exec', '--', 'prisma', 'validate', '--schema', 'prisma/schema.prisma'], { cwd: repoRoot, env });
  record('prisma-validate');

  const postgresVersionNum = checkPostgres17(repoRoot, rawUrl, env);
  record('postgres-17', `server_version_num=${postgresVersionNum}`);

  runRequired('from-zero', 'npm', ['run', 'migration:test:from-zero'], { cwd: repoRoot, env });
  record('from-zero', 'reused #626 migration:test:from-zero');

  runTenantSmoke(repoRoot, rawUrl, env);
  record('tenant-isolation', 'two tenants share scoped role name; same-tenant duplicate and orphan tenant rejected; transaction rolled back');

  runRequired('upgrade', 'npm', ['run', 'migration:test:upgrade'], { cwd: repoRoot, env });
  record('upgrade', 'reused #626 supported snapshot upgrades');

  runRequired('manifest', 'npm', ['run', 'migration:manifest'], { cwd: repoRoot, env });
  const schemaManifest = await readCurrentSchemaManifest(repoRoot);
  record('schema-manifest', `sha256=${schemaManifest.sha256}`);

  runRequired('raw-sql-security', 'npm', ['run', 'audit:raw-sql-security'], { cwd: repoRoot, env });
  record('raw-sql-security', 'classified RLS/grant/SECURITY DEFINER contracts consistent');

  const drift = await runOptionalDrift(repoRoot, history.candidateSha, rawUrl, env, checks);
  return { history, checks, schemaManifest, drift };
}

async function cli() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const startedAt = new Date().toISOString();
  let core;
  let failure = null;
  try {
    const configuredDatabaseUrl = String(process.env.DATABASE_URL || '').trim();
    if (configuredDatabaseUrl) {
      assertDestructiveDatabaseSafe(configuredDatabaseUrl);
      core = await executeGate({ repoRoot, baseRef: args.base, expectedSha: args.expectedSha, env: process.env });
    } else {
      const candidateSha = git(repoRoot, ['rev-parse', 'HEAD']);
      const { withEphemeralDatabase } = await import('./local-verification-runner-v630.mjs');
      core = await withEphemeralDatabase({ candidateSha, cwd: repoRoot, env: process.env }, async (ephemeralEnv) =>
        executeGate({ repoRoot, baseRef: args.base, expectedSha: args.expectedSha, env: ephemeralEnv })
      );
    }
  } catch (error) {
    failure = error;
    const candidateSha = (() => { try { return git(repoRoot, ['rev-parse', 'HEAD']); } catch { return 'UNKNOWN'; } })();
    const baseSha = (() => { try { return git(repoRoot, ['merge-base', args.base, 'HEAD']); } catch { return 'UNKNOWN'; } })();
    core = { history: { candidateSha, baseSha }, checks: [] };
  }

  const category = failure?.category || (failure ? classifyStepFailure(failure.stepId || 'from-zero', failure.message).category : CATEGORY.PASS);
  if (failure) core.checks.push({
    id: failure.stepId || 'gate',
    status: 'FAIL',
    category,
    detail: sanitizeText(failure.message),
  });
  const manifest = {
    schemaVersion: 632,
    candidateSha: core.history.candidateSha,
    baseSha: core.history.baseSha,
    baseRef: args.base,
    category,
    status: category === CATEGORY.PASS ? 'PASS' : 'FAIL',
    checks: core.checks,
    schemaManifest: core.schemaManifest || null,
    drift: core.drift || null,
    remote: {
      ci: String(process.env.REMOTE_CI || 'NOT_EXECUTED'),
      deploy: String(process.env.REMOTE_DEPLOY || 'NOT_EXECUTED'),
    },
    startedAt,
    finishedAt: new Date().toISOString(),
  };
  manifest.manifestSha256 = deterministicManifestHash(manifest);
  const artifactRoot = path.join(repoRoot, 'artifacts', 'database-gate-v632', manifest.candidateSha);
  await mkdir(artifactRoot, { recursive: true });
  await writeFile(path.join(artifactRoot, 'gate.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  await writeFile(path.join(artifactRoot, 'gate.md'), humanReport(manifest), { mode: 0o600 });
  console.log(`[database-gate-v632][${manifest.status}] category=${manifest.category} sha=${manifest.candidateSha} manifest=${manifest.manifestSha256}`);
  console.log(`[database-gate-v632][${manifest.status}] evidence=${path.relative(repoRoot, artifactRoot)}`);
  if (failure) process.exitCode = 1;
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) cli().catch((error) => {
  console.error(`[database-gate-v632][FAIL] ${sanitizeText(error instanceof Error ? error.message : String(error))}`);
  process.exitCode = 1;
});
