#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { buildDriftManifest } from './database-drift/core.mjs';
import { introspectDatabase } from './database-drift/snapshot.mjs';
import {
  assertExpectedDatabaseIsEphemeral,
  collectMigrationChain,
  collectRepoAuthority,
  deriveAuthorityGaps,
  resolveRepoSha,
  runDatabaseAuthorityPreflight,
} from './database-drift/repo-metadata.mjs';
import { renderHumanReport } from './database-drift/report.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith('--')) throw new Error(`unexpected argument: ${key}`);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${key}`);
    args[key.slice(2)] = value;
    i += 1;
  }
  return args;
}

async function readSnapshot(file) {
  return JSON.parse(await fs.readFile(path.resolve(repoRoot, file), 'utf8'));
}

async function resolveSnapshot({ snapshotPath, connectionString, label, authority }) {
  if (snapshotPath && connectionString) throw new Error(`${label}: choose snapshot or database URL, not both`);
  if (snapshotPath) return readSnapshot(snapshotPath);
  if (!connectionString) throw new Error(`${label}: missing snapshot and database URL environment variable`);
  if (label === 'expected') assertExpectedDatabaseIsEphemeral(connectionString, authority);
  return introspectDatabase(connectionString, { applicationName: `contagest-drift-${label}-625` });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRef = args['project-ref'] ?? process.env.SUPABASE_PROJECT_REF;
  if (!projectRef) throw new Error('missing --project-ref (logical ref only; never a credential)');

  runDatabaseAuthorityPreflight(repoRoot);

  const allowlist = JSON.parse(await fs.readFile(path.join(repoRoot, 'config/database-drift-platform-allowlist-v1.json'), 'utf8'));
  const repo = await collectRepoAuthority(repoRoot);
  const migrationChain = await collectMigrationChain(repoRoot);
  const repoSha = resolveRepoSha(repoRoot, args['repo-sha']);

  const expected = await resolveSnapshot({
    snapshotPath: args['expected-snapshot'],
    connectionString: process.env.DRIFT_EXPECTED_DATABASE_URL,
    label: 'expected',
    authority: repo.authority,
  });
  const actual = await resolveSnapshot({
    snapshotPath: args['actual-snapshot'],
    connectionString: process.env.DRIFT_ACTUAL_DATABASE_URL,
    label: 'actual',
    authority: repo.authority,
  });

  const manifest = buildDriftManifest({
    repoSha,
    projectRef,
    expected,
    actual,
    allowlist,
    repoAuthority: {
      structuralAuthority: repo.authority.structuralAuthority,
      policyAuthority: repo.authority.policyAuthority,
      legacyCompatibilitySql: repo.authority.legacyCompatibilitySql,
      sidecarSql: repo.sidecarSql,
      prismaSchemaSha256: repo.prismaSchemaSha256,
    },
    prismaVersion: repo.prismaVersion,
    migrationChain,
    authorityGaps: deriveAuthorityGaps(expected, repo.prismaModels),
  });

  const outputDir = path.resolve(repoRoot, args.out ?? 'qa/evidence/database-drift');
  await fs.mkdir(outputDir, { recursive: true });
  const stem = `schema-drift-${projectRef}-${repoSha.slice(0, 12)}`;
  const jsonPath = path.join(outputDir, `${stem}.json`);
  const mdPath = path.join(outputDir, `${stem}.md`);
  await fs.writeFile(jsonPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  await fs.writeFile(mdPath, `${renderHumanReport(manifest)}\n`, { mode: 0o600 });
  console.log(`[database-drift][PASS] sha=${repoSha} project=${projectRef} findings=${manifest.summary.total} p0=${manifest.summary.bySeverity.P0 ?? 0} p1=${manifest.summary.bySeverity.P1 ?? 0}`);
  console.log(`[database-drift][PASS] manifest=${path.relative(repoRoot, jsonPath)} report=${path.relative(repoRoot, mdPath)} digest=${manifest.deterministicDigest}`);
}

main().catch((error) => {
  console.error(`[database-drift][FAIL] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
