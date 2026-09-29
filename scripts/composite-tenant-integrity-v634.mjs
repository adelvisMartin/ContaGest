#!/usr/bin/env node
import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const CLASSIFICATION = Object.freeze({
  DB_ENFORCEABLE: 'DB_ENFORCEABLE',
  SERVICE_ENFORCED: 'SERVICE_ENFORCED',
  GLOBAL_REFERENCE: 'GLOBAL_REFERENCE',
  PLATFORM_REFERENCE: 'PLATFORM_REFERENCE',
});

const RELATION_RE = /^([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)->([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)$/;
const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;

function relationKey(relation) {
  return `${relation.childTable}.${relation.childColumn}->${relation.parentTable}.${relation.parentColumn}`;
}

function parseRelationKey(value) {
  const match = RELATION_RE.exec(String(value));
  if (!match) throw new Error(`TENANT_RELATION_KEY_INVALID:${value}`);
  return { childTable: match[1], childColumn: match[2], parentTable: match[3], parentColumn: match[4] };
}

function ownerFor(table, policy) {
  for (const rule of policy.ownerRules || []) {
    if (new RegExp(rule.pattern).test(table)) return rule.owner;
  }
  throw new Error(`TENANT_RELATION_OWNER_MISSING:${table}`);
}

function deterministicIdentifier(parts) {
  const raw = parts.join('_').replace(/[^A-Za-z0-9_]/g, '_');
  if (raw.length <= 63) return raw;
  return `${raw.slice(0, 48)}_${crypto.createHash('sha1').update(raw).digest('hex').slice(0, 12)}`;
}

export function expandPolicy(policy) {
  const db = (policy.dbEnforceableRelations || []).map((value) => ({
    ...parseRelationKey(value),
    childTenantColumn: 'tenantId',
    parentTenantColumn: 'tenantId',
    classification: CLASSIFICATION.DB_ENFORCEABLE,
    owner: ownerFor(parseRelationKey(value).childTable, policy),
    reason: 'both sides persist tenant ownership and already have a physical FK',
  }));
  const service = (policy.serviceEnforcedRelations || []).map((value) => ({
    ...parseRelationKey(value),
    childTenantColumn: null,
    parentTenantColumn: 'tenantId',
    classification: CLASSIFICATION.SERVICE_ENFORCED,
    owner: ownerFor(parseRelationKey(value).childTable, policy),
    reason: 'child tenant ownership is derived through its aggregate; enforce at service boundary without redundant tenant column',
  }));
  return [...db, ...service];
}

export function validatePolicy(policy) {
  if (policy.version !== 634) throw new Error('TENANT_RELATION_POLICY_VERSION_INVALID');
  const relations = expandPolicy(policy);
  const keys = relations.map(relationKey);
  if (new Set(keys).size !== keys.length) throw new Error('TENANT_RELATION_POLICY_DUPLICATE');
  const dbCount = relations.filter((relation) => relation.classification === CLASSIFICATION.DB_ENFORCEABLE).length;
  if (dbCount !== Number(policy.baselinePublicDbEnforceableCount)) {
    throw new Error(`TENANT_RELATION_POLICY_DB_COVERAGE:expected=${policy.baselinePublicDbEnforceableCount}:actual=${dbCount}`);
  }
  for (const relation of relations) {
    if (!Object.values(CLASSIFICATION).includes(relation.classification)) throw new Error(`TENANT_RELATION_CLASSIFICATION_INVALID:${relationKey(relation)}`);
    if (!relation.owner || !relation.reason) throw new Error(`TENANT_RELATION_METADATA_MISSING:${relationKey(relation)}`);
  }
  return relations;
}

export function summarizePolicy(policy) {
  const relations = validatePolicy(policy);
  const byClassification = Object.fromEntries(Object.values(CLASSIFICATION).map((value) => [value, relations.filter((relation) => relation.classification === value).length]));
  return {
    total: relations.length,
    byClassification,
    unclassified: relations.filter((relation) => !Object.values(CLASSIFICATION).includes(relation.classification)).length,
  };
}

export function guardNames(relation) {
  return {
    parentUnique: deterministicIdentifier([relation.parentTable, relation.parentTenantColumn, relation.parentColumn, 'tg_uk']),
    childIndex: deterministicIdentifier([relation.childTable, relation.childTenantColumn, relation.childColumn, 'tg_idx']),
    constraint: deterministicIdentifier([relation.childTable, relation.childTenantColumn, relation.childColumn, 'tg_fk']),
  };
}

export function buildGuardStatements(relation) {
  if (relation.classification !== CLASSIFICATION.DB_ENFORCEABLE) return [];
  const names = guardNames(relation);
  return [
    `CREATE UNIQUE INDEX IF NOT EXISTS ${quote(names.parentUnique)} ON ${quote(relation.parentTable)} (${quote(relation.parentTenantColumn)}, ${quote(relation.parentColumn)});`,
    `CREATE INDEX IF NOT EXISTS ${quote(names.childIndex)} ON ${quote(relation.childTable)} (${quote(relation.childTenantColumn)}, ${quote(relation.childColumn)});`,
    `ALTER TABLE ${quote(relation.childTable)} ADD CONSTRAINT ${quote(names.constraint)} FOREIGN KEY (${quote(relation.childTenantColumn)}, ${quote(relation.childColumn)}) REFERENCES ${quote(relation.parentTable)} (${quote(relation.parentTenantColumn)}, ${quote(relation.parentColumn)}) ON DELETE NO ACTION ON UPDATE NO ACTION NOT VALID;`,
    `ALTER TABLE ${quote(relation.childTable)} VALIDATE CONSTRAINT ${quote(names.constraint)};`,
  ];
}

export function buildMigration(policy) {
  const relations = validatePolicy(policy).filter((relation) => relation.classification === CLASSIFICATION.DB_ENFORCEABLE);
  const lines = [
    '-- #634 Composite Tenant Referential Integrity',
    '-- Forward-only integrity guards. Existing FK constraints remain lifecycle owners.',
    '-- No data rewrite/backfill is performed: VALIDATE CONSTRAINT aborts on ambiguous cross-tenant history.',
    '',
  ];
  for (const relation of relations) {
    lines.push(`-- ${relationKey(relation)}`);
    lines.push(...buildGuardStatements(relation), '');
  }
  return `${lines.join('\n')}\n`;
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

function psql(rawUrl, sql, env = process.env) {
  const executable = process.platform === 'win32' ? 'psql.exe' : 'psql';
  const result = spawnSync(executable, ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    env: pgEnv(rawUrl, env), encoding: 'utf8', shell: false,
  });
  if (result.error) throw new Error(`TENANT_RELATION_PSQL_BLOCKED:${result.error.message}`);
  if (result.status !== 0) throw new Error(`TENANT_RELATION_PSQL_FAILED:${result.stderr || result.stdout}`);
  return String(result.stdout).trim();
}

export async function verifyDatabase({ rawUrl, policy, env = process.env }) {
  const { assertDestructiveDatabaseSafe } = await import('./canonical-database-gate-v632.mjs');
  assertDestructiveDatabaseSafe(rawUrl);
  const version = Number(psql(rawUrl, `SELECT current_setting('server_version_num')`, env));
  if (!Number.isInteger(version) || version < 170000) throw new Error(`TENANT_RELATION_POSTGRES_17_REQUIRED:${version}`);

  const missing = [];
  for (const relation of validatePolicy(policy).filter((item) => item.classification === CLASSIFICATION.DB_ENFORCEABLE)) {
    const names = guardNames(relation);
    const exists = psql(rawUrl, `SELECT count(*) FROM pg_constraint WHERE conrelid=${quote(relation.childTable)}::regclass AND conname='${names.constraint.replaceAll("'", "''")}' AND contype='f' AND convalidated`, env);
    if (exists !== '1') missing.push(relationKey(relation));
  }
  if (missing.length) throw new Error(`TENANT_RELATION_GUARDS_MISSING:${missing.join(',')}`);
  return { postgresVersionNum: version, checkedGuards: Number(policy.baselinePublicDbEnforceableCount) };
}

async function cli() {
  const policy = JSON.parse(await readFile(new URL('../config/composite-tenant-integrity-v634.json', import.meta.url), 'utf8'));
  const summary = summarizePolicy(policy);
  if (process.argv.includes('--print-migration')) {
    process.stdout.write(buildMigration(policy));
    return;
  }
  if (process.argv.includes('--verify-database')) {
    const rawUrl = String(process.env.DATABASE_URL || '').trim();
    if (!rawUrl) throw new Error('TENANT_RELATION_DATABASE_URL_REQUIRED');
    const result = await verifyDatabase({ rawUrl, policy });
    console.log(`[tenant-integrity-v634][PASS] db=${result.checkedGuards} pg=${result.postgresVersionNum}`);
    return;
  }
  console.log(`[tenant-integrity-v634][PASS] total=${summary.total} db=${summary.byClassification.DB_ENFORCEABLE} service=${summary.byClassification.SERVICE_ENFORCED}`);
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) cli().catch((error) => {
  console.error(`[tenant-integrity-v634][FAIL] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
