import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { deployMigrations, isEphemeralDatabase } from './prisma-deploy-safe.mjs';

const { Client } = pg;
const BACKEND_ROOT = process.cwd();
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');
const MIGRATIONS_ROOT = path.join(BACKEND_ROOT, 'prisma', 'migrations');
const MANIFEST_PATH = path.join(REPO_ROOT, 'config', 'migration-chain-v626.json');
const PREPARE_SQL = path.join(REPO_ROOT, 'ops', 'database', 'prepare-supabase-ephemeral.sql');
const ARTIFACT_ROOT = path.join(REPO_ROOT, 'artifacts', 'migration-chain-v626');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
  }
  return value;
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function sanitizedPsqlUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.search = '';
  return url.toString();
}

function run(command, args, { cwd = BACKEND_ROOT, env = process.env } = {}) {
  const executable = process.platform === 'win32' && command === 'npx' ? 'npx.cmd' : command;
  const result = spawnSync(executable, args, { cwd, env, stdio: 'inherit', shell: false });
  if (result.error) throw new Error(`MISSING_PREREQUISITE:${command}:${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`MIGRATION_APPLY_FAILED:${command} ${args.join(' ')}:exit=${result.status}`);
  }
}

async function readAuthority() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  if (manifest.version !== 626 || !Array.isArray(manifest.supportedSnapshots) || manifest.supportedSnapshots.length < 2) {
    throw new Error('SNAPSHOT_PROVENANCE_INVALID:manifest-shape');
  }
  const seen = new Set();
  for (const snapshot of manifest.supportedSnapshots) {
    if (!snapshot.id || !snapshot.lastAppliedMigration || !snapshot.provenance || seen.has(snapshot.id)) {
      throw new Error(`SNAPSHOT_PROVENANCE_INVALID:${snapshot.id || 'missing-id'}`);
    }
    seen.add(snapshot.id);
  }
  return manifest;
}

async function migrationDirectories() {
  return (await readdir(MIGRATIONS_ROOT, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function timestampPrefix(name) {
  const match = /^(\d{14})_/.exec(name);
  return match?.[1] || null;
}

async function auditMigrationOrder(authority) {
  const migrations = await migrationDirectories();
  const groups = new Map();
  for (const migration of migrations) {
    const prefix = timestampPrefix(migration);
    if (!prefix) continue;
    const group = groups.get(prefix) || [];
    group.push(migration);
    groups.set(prefix, group);
  }

  const allowlist = new Map((authority.duplicateTimestampAllowlist || []).map((item) => [item.prefix, [...item.migrations].sort()]));
  for (const [prefix, group] of groups.entries()) {
    if (group.length < 2) continue;
    const expected = allowlist.get(prefix);
    const actual = [...group].sort();
    if (!expected || JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`MIGRATION_DUPLICATE_AUTHORITY:${prefix}:${actual.join(',')}`);
    }
  }

  for (const snapshot of authority.supportedSnapshots) {
    if (!migrations.includes(snapshot.lastAppliedMigration)) {
      throw new Error(`SNAPSHOT_PROVENANCE_INVALID:${snapshot.id}:missing-boundary=${snapshot.lastAppliedMigration}`);
    }
  }
  return migrations;
}

function databaseUrl() {
  const raw = String(process.env.DATABASE_URL || '').trim();
  if (!raw) throw new Error('MISSING_PREREQUISITE:DATABASE_URL');
  if (!isEphemeralDatabase(raw)) throw new Error(`UNSAFE_PRODUCTION_COMMAND:${new URL(raw).pathname.replace(/^\//, '')}`);
  return raw;
}

async function resetEphemeralDatabase(rawUrl) {
  const client = new Client({ connectionString: rawUrl });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS storage CASCADE');
    await client.query('DROP SCHEMA IF EXISTS auth CASCADE');
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }
}

function prepareHistoricalBaseline(rawUrl) {
  run('psql', ['--dbname', sanitizedPsqlUrl(rawUrl), '-v', 'ON_ERROR_STOP=1', '-f', PREPARE_SQL], { cwd: REPO_ROOT });
}

async function physicalManifest(rawUrl) {
  const client = new Client({ connectionString: rawUrl });
  await client.connect();
  try {
    const columns = await client.query(`
      select table_name, column_name, ordinal_position, data_type, udt_name, is_nullable,
             coalesce(column_default, '') as column_default
        from information_schema.columns
       where table_schema='public' and table_name <> '_prisma_migrations'
       order by table_name, ordinal_position
    `);
    const fks = await client.query(`
      select c.conname as constraint_name,
             src.relname as table_name,
             sa.attname as column_name,
             dst.relname as foreign_table_name,
             da.attname as foreign_column_name,
             c.confdeltype as delete_action,
             c.confupdtype as update_action
        from pg_constraint c
        join pg_class src on src.oid = c.conrelid
        join pg_namespace n on n.oid = src.relnamespace and n.nspname='public'
        join pg_class dst on dst.oid = c.confrelid
        join lateral unnest(c.conkey) with ordinality sk(attnum, ord) on true
        join lateral unnest(c.confkey) with ordinality dk(attnum, ord) on dk.ord = sk.ord
        join pg_attribute sa on sa.attrelid = src.oid and sa.attnum = sk.attnum
        join pg_attribute da on da.attrelid = dst.oid and da.attnum = dk.attnum
       where c.contype='f' and src.relname <> '_prisma_migrations'
       order by src.relname, c.conname, sk.ord
    `);
    const schema = { columns: columns.rows, foreignKeys: fks.rows };
    return { schema, sha256: hash(schema) };
  } finally {
    await client.end();
  }
}

async function verifyCriticalColumns(rawUrl, authority, errorCode) {
  const client = new Client({ connectionString: rawUrl });
  await client.connect();
  try {
    for (const critical of authority.criticalColumns || []) {
      const result = await client.query(
        `select data_type, udt_name
           from information_schema.columns
          where table_schema='public' and table_name=$1 and column_name=$2`,
        [critical.table, critical.column]
      );
      if (!result.rows[0]) throw new Error(`${errorCode}:missing=${critical.table}.${critical.column}`);
      const actual = result.rows[0].data_type === 'USER-DEFINED' ? result.rows[0].udt_name : result.rows[0].data_type;
      if (actual !== critical.type) {
        throw new Error(`${errorCode}:type=${critical.table}.${critical.column}:expected=${critical.type}:actual=${actual}`);
      }
    }
  } finally {
    await client.end();
  }
}

async function writeArtifact(name, value) {
  await mkdir(ARTIFACT_ROOT, { recursive: true });
  const target = path.join(ARTIFACT_ROOT, name);
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return target;
}

async function fromZero({ quiet = false } = {}) {
  const rawUrl = databaseUrl();
  const authority = await readAuthority();
  await auditMigrationOrder(authority);
  await resetEphemeralDatabase(rawUrl);
  prepareHistoricalBaseline(rawUrl);
  await deployMigrations();
  await verifyCriticalColumns(rawUrl, authority, 'FROM_ZERO_SCHEMA_MISMATCH');
  const manifest = await physicalManifest(rawUrl);
  await writeArtifact('from-zero-manifest.json', manifest);
  if (!quiet) console.log(`[migration-v626] FROM_ZERO_PASS sha256=${manifest.sha256}`);
  return manifest;
}

async function createSnapshotSchema(snapshot, migrations) {
  const root = await mkdtemp(path.join(os.tmpdir(), `contagest-v626-${snapshot.id}-`));
  const prismaRoot = path.join(root, 'prisma');
  const targetMigrations = path.join(prismaRoot, 'migrations');
  await mkdir(targetMigrations, { recursive: true });
  await cp(path.join(BACKEND_ROOT, 'prisma', 'schema.prisma'), path.join(prismaRoot, 'schema.prisma'));
  await cp(path.join(BACKEND_ROOT, 'prisma', 'migration_lock.toml'), path.join(prismaRoot, 'migration_lock.toml'));

  const boundary = migrations.indexOf(snapshot.lastAppliedMigration);
  if (boundary < 0) throw new Error(`SNAPSHOT_PROVENANCE_INVALID:${snapshot.id}:missing-boundary`);
  for (const migration of migrations.slice(0, boundary + 1)) {
    await cp(path.join(MIGRATIONS_ROOT, migration), path.join(targetMigrations, migration), { recursive: true });
  }
  return { root, schemaPath: path.join(prismaRoot, 'schema.prisma') };
}

async function upgrade(fromId = null) {
  const rawUrl = databaseUrl();
  const authority = await readAuthority();
  const migrations = await auditMigrationOrder(authority);
  const baseline = await fromZero({ quiet: true });
  const snapshots = fromId
    ? authority.supportedSnapshots.filter((snapshot) => snapshot.id === fromId)
    : authority.supportedSnapshots;
  if (!snapshots.length) throw new Error(`SNAPSHOT_PROVENANCE_INVALID:unknown=${fromId}`);

  const evidence = [];
  for (const snapshot of snapshots) {
    let temporary = null;
    try {
      temporary = await createSnapshotSchema(snapshot, migrations);
      await resetEphemeralDatabase(rawUrl);
      prepareHistoricalBaseline(rawUrl);
      await deployMigrations({ schemaPath: temporary.schemaPath });
      await deployMigrations();
      await verifyCriticalColumns(rawUrl, authority, 'UPGRADE_DIVERGENCE');
      const upgraded = await physicalManifest(rawUrl);
      if (upgraded.sha256 !== baseline.sha256) {
        throw new Error(`UPGRADE_DIVERGENCE:${snapshot.id}:expected=${baseline.sha256}:actual=${upgraded.sha256}`);
      }
      evidence.push({ snapshot: snapshot.id, boundary: snapshot.lastAppliedMigration, sha256: upgraded.sha256 });
      console.log(`[migration-v626] UPGRADE_PASS snapshot=${snapshot.id} sha256=${upgraded.sha256}`);
    } finally {
      if (temporary?.root) await rm(temporary.root, { recursive: true, force: true });
    }
  }
  await writeArtifact('upgrade-manifest.json', { baselineSha256: baseline.sha256, snapshots: evidence });
  return evidence;
}

async function manifestCommand() {
  const rawUrl = databaseUrl();
  const authority = await readAuthority();
  await auditMigrationOrder(authority);
  await verifyCriticalColumns(rawUrl, authority, 'FROM_ZERO_SCHEMA_MISMATCH');
  const manifest = await physicalManifest(rawUrl);
  await writeArtifact('current-manifest.json', manifest);
  console.log(JSON.stringify(manifest, null, 2));
  return manifest;
}

async function main() {
  const [command = 'manifest', ...args] = process.argv.slice(2);
  const from = args.find((arg) => arg.startsWith('--from='))?.slice('--from='.length) || null;
  if (command === 'from-zero') return fromZero();
  if (command === 'upgrade') return upgrade(from);
  if (command === 'manifest') return manifestCommand();
  throw new Error(`MISSING_PREREQUISITE:unknown-command=${command}`);
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) {
  main().catch((error) => {
    console.error('[migration-v626]', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { auditMigrationOrder, fromZero, manifestCommand, physicalManifest, upgrade };
