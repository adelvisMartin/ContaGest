#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { introspectDatabase } from './database-drift/snapshot.mjs';
import {
  MigrationChainError,
  assertEphemeralDatabase,
  physicalSchemaHash,
} from './migration-chain/core.mjs';
import {
  ROOT,
  MIGRATIONS_DIR,
  applyMigration,
  assertCriticalSchema,
  buildState,
  compareSchemaHashes,
  executePsqlCompatibleFile,
  loadSnapshotConfig,
  manifestEnvelope,
  resetEphemeralDatabase,
} from './migration-chain/runner.mjs';

const { Client } = pg;
const OUTPUT_DIR = path.join(ROOT, 'artifacts/database/migration-chain');

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

function repoSha() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); }
  catch { return process.env.GITHUB_SHA || 'unknown'; }
}

function runAuthorityPreflight() {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/database-authority-audit-v6775.mjs')], { cwd: ROOT, stdio: 'inherit' });
}

async function physicalSnapshot(url, applicationName) {
  return introspectDatabase(url, { applicationName });
}

function writeManifest(name, value) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const file = path.join(OUTPUT_DIR, `${name}.json`);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  console.log(`[migration-chain] manifest=${path.relative(ROOT, file)}`);
}

async function runFromZero(client, url, catalog) {
  await buildState(client);
  await assertCriticalSchema(client);
  const physical = await physicalSnapshot(url, 'contagest-migration-chain-626-from-zero');
  const schemaHash = physicalSchemaHash(physical);
  const manifest = manifestEnvelope({ repoSha: repoSha(), catalog, snapshot: physical, schemaHash, scenario: 'from-zero' });
  writeManifest('from-zero', manifest);
  return { schemaHash, physical, manifest };
}

async function runUpgrade(client, url, config, snapshotMeta, expectedHash) {
  await buildState(client, { through: snapshotMeta.lastMigration });
  await executePsqlCompatibleFile(client, path.join(ROOT, snapshotMeta.fixture));
  const names = config.catalog.migrations.map((entry) => entry.name);
  const boundary = names.indexOf(snapshotMeta.lastMigration);
  for (let i = boundary + 1; i < names.length; i += 1) await applyMigration(client, MIGRATIONS_DIR, names[i]);
  await assertCriticalSchema(client);
  const physical = await physicalSnapshot(url, `contagest-migration-chain-626-upgrade-${snapshotMeta.id}`);
  const schemaHash = physicalSchemaHash(physical);
  compareSchemaHashes(expectedHash, schemaHash, snapshotMeta.id);
  writeManifest(`upgrade-${snapshotMeta.id}`, manifestEnvelope({ repoSha: repoSha(), catalog: config.catalog, snapshot: physical, schemaHash, scenario: `upgrade:${snapshotMeta.id}` }));
}

export async function main() {
  const command = process.argv[2] || 'all';
  if (!['from-zero','upgrade','manifest','all'].includes(command)) throw new MigrationChainError('MISSING_PREREQUISITE', `unknown command ${command}`);
  const url = String(process.env.DATABASE_URL || '').trim();
  assertEphemeralDatabase(url);
  runAuthorityPreflight();
  const config = loadSnapshotConfig();
  const client = new Client({ connectionString: url, application_name: 'contagest-migration-chain-626' });
  await client.connect();
  try {
    const fromZero = await runFromZero(client, url, config.catalog);
    if (command === 'from-zero' || command === 'manifest') return;
    const requested = argValue('--from');
    const snapshots = requested ? config.snapshots.filter((item) => item.id === requested) : config.snapshots;
    if (requested && snapshots.length !== 1) throw new MigrationChainError('SNAPSHOT_PROVENANCE_INVALID', `unsupported snapshot ${requested}`);
    for (const snapshotMeta of snapshots) await runUpgrade(client, url, config, snapshotMeta, fromZero.schemaHash);
  } finally {
    try {
      await resetEphemeralDatabase(client);
    } finally {
      await client.end();
    }
  }
}

const invokedAsScript = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedAsScript) {
  main().catch((error) => {
    const code = error instanceof MigrationChainError ? error.code : 'MIGRATION_APPLY_FAILED';
    console.error(`[migration-chain] ${code}`, error instanceof Error ? error.message : String(error));
    if (error?.details) console.error(JSON.stringify(error.details));
    process.exitCode = 1;
  });
}
