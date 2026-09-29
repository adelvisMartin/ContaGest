import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function runDatabaseAuthorityPreflight(repoRoot) {
  const gatePath = path.join(repoRoot, 'scripts/database-authority-audit-v6775.mjs');
  const result = spawnSync(process.execPath, [gatePath], {
    cwd: repoRoot,
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(`database-authority preflight failed${detail ? `: ${detail}` : ''}`);
  }
  return String(result.stdout || '').trim();
}

export async function collectMigrationChain(repoRoot) {
  const migrationsDir = path.join(repoRoot, 'backend/prisma/migrations');
  const entries = (await fs.readdir(migrationsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const migrations = [];
  for (const name of entries) {
    const file = path.join(migrationsDir, name, 'migration.sql');
    const content = await fs.readFile(file);
    migrations.push({ name, sha256: sha256(content) });
  }
  return {
    count: migrations.length,
    digest: sha256(Buffer.from(JSON.stringify(migrations))),
    migrations,
  };
}

export function classifySidecarSql(authorityConfig) {
  const rows = [];
  for (const path of authorityConfig?.policyAuthority?.sql ?? []) rows.push({ path, classification: 'POLICY_AUTHORITY' });
  for (const path of authorityConfig?.historicalEphemeralBaseline?.sql ?? []) rows.push({ path, classification: 'HISTORICAL_EPHEMERAL_BASELINE' });
  for (const path of authorityConfig?.legacyCompatibilitySql ?? []) rows.push({ path, classification: 'LEGACY_COMPATIBILITY' });
  return rows.sort((a, b) => a.path.localeCompare(b.path) || a.classification.localeCompare(b.classification));
}

export async function collectRepoAuthority(repoRoot) {
  const prismaSchemaPath = path.join(repoRoot, 'backend/prisma/schema.prisma');
  const prismaSchema = await fs.readFile(prismaSchemaPath, 'utf8');
  const backendPackage = JSON.parse(await fs.readFile(path.join(repoRoot, 'backend/package.json'), 'utf8'));
  const authority = JSON.parse(await fs.readFile(path.join(repoRoot, 'config/database-authority-67-75.json'), 'utf8'));
  const models = [...prismaSchema.matchAll(/^model\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm)].map((match) => match[1]).sort();
  return {
    prismaSchema: 'backend/prisma/schema.prisma',
    prismaSchemaSha256: sha256(Buffer.from(prismaSchema)),
    prismaModels: models,
    prismaVersion: backendPackage.dependencies?.prisma ?? backendPackage.devDependencies?.prisma ?? null,
    authority,
    sidecarSql: classifySidecarSql(authority),
  };
}

export function deriveAuthorityGaps(expectedSnapshot, prismaModels) {
  const prisma = new Set(prismaModels);
  const physicalTables = new Set((expectedSnapshot.objects ?? [])
    .filter((object) => object.kind === 'table' && object.schema === 'public' && !object.extensionName)
    .map((object) => object.name));
  const gaps = [];
  for (const table of [...physicalTables].sort()) {
    if (!prisma.has(table)) gaps.push({ kind: 'PHYSICAL_NOT_IN_PRISMA', schema: 'public', name: table });
  }
  for (const model of [...prisma].sort()) {
    if (!physicalTables.has(model)) gaps.push({ kind: 'PRISMA_MODEL_NOT_IN_EXPECTED_DB', schema: 'public', name: model });
  }
  return gaps;
}

export function resolveRepoSha(repoRoot, explicitSha) {
  if (explicitSha) return explicitSha;
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
}

export function assertExpectedDatabaseIsEphemeral(connectionString, authorityConfig) {
  const parsed = new URL(connectionString);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const suffixes = authorityConfig?.historicalEphemeralBaseline?.allowedDatabaseSuffixes ?? ['_e2e', '_drill', '_restore'];
  if (!suffixes.some((suffix) => databaseName.endsWith(suffix))) {
    throw new Error(`expected database must be isolated/ephemeral and end in one of: ${suffixes.join(', ')}`);
  }
}
