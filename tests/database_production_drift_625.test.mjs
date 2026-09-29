import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertManifestSafe,
  buildDriftManifest,
  classifyDrift,
  deterministicDigest,
  normalizeExpression,
} from '../scripts/database-drift/core.mjs';
import { INTROSPECTION_QUERIES } from '../scripts/database-drift/introspection.mjs';
import { assertExpectedDatabaseIsEphemeral, classifySidecarSql, runDatabaseAuthorityPreflight } from '../scripts/database-drift/repo-metadata.mjs';
import { snapshotFromQueryResults } from '../scripts/database-drift/snapshot.mjs';

const allowlist = {
  version: 1,
  schemas: ['auth', 'storage', 'realtime', 'extensions', 'graphql', 'graphql_public', 'vault', 'supabase_functions', 'supabase_migrations'],
  schemaPrefixes: ['pg_'],
  extensionNames: ['pg_graphql', 'pg_stat_statements', 'pgcrypto', 'uuid-ossp', 'supabase_vault'],
};

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(here, 'fixtures/database-drift', name), 'utf8'));
const expected = fixture('expected.json');
const actual = fixture('actual.json');

test('625 classifier covers missing column/type/FK/index/policy and Supabase platform extras', () => {
  const findings = classifyDrift(expected, actual, { allowlist });
  const categories = new Set(findings.map((finding) => finding.category));
  assert.ok(categories.has('MISSING_IN_PROD'));
  assert.ok(categories.has('TYPE_MISMATCH'));
  assert.ok(categories.has('CONSTRAINT_MISMATCH'));
  assert.ok(categories.has('INDEX_MISMATCH'));
  assert.ok(categories.has('POLICY_MISMATCH'));
  assert.ok(categories.has('EXPECTED_PLATFORM_OBJECT'));
  assert.ok(findings.some((finding) => finding.object.name === 'postedAt' && finding.severity === 'P0'));
});

test('625 semantically equivalent indexes/constraints do not drift only because names differ', () => {
  const e = { objects: [
    { kind: 'constraint', schema: 'public', table: 'T', name: 'old_fk', signature: { type: 'f', definition: 'FOREIGN KEY (x) REFERENCES p(id)' } },
    { kind: 'index', schema: 'public', table: 'T', name: 'old_idx', signature: { unique: false, method: 'btree', keys: ['x', 'y'], predicate: null } },
  ] };
  const a = { objects: [
    { kind: 'constraint', schema: 'public', table: 'T', name: 'new_fk', signature: { type: 'f', definition: ' FOREIGN KEY (x)  REFERENCES p(id) ' } },
    { kind: 'index', schema: 'public', table: 'T', name: 'new_idx', signature: { unique: false, method: 'btree', keys: ['x', 'y'], predicate: null } },
  ] };
  assert.deepEqual(classifyDrift(e, a, { allowlist }), []);
});

test('625 deterministic digest ignores temporal metadata but changes on schema findings', () => {
  const base = buildDriftManifest({ repoSha: 'abc123', projectRef: 'project-ref', expected, actual, allowlist, generatedAt: '2026-09-29T00:00:00.000Z' });
  const rerun = buildDriftManifest({ repoSha: 'abc123', projectRef: 'project-ref', expected, actual, allowlist, generatedAt: '2026-09-29T00:01:00.000Z' });
  assert.equal(base.deterministicDigest, rerun.deterministicDigest);
  assert.equal(base.deterministicDigest, deterministicDigest(base));
  const changed = structuredClone(actual);
  changed.objects.push({ kind: 'column', schema: 'public', table: 'LedgerEntry', name: 'unexpected', signature: { type: 'text', nullable: true, default: null } });
  const changedManifest = buildDriftManifest({ repoSha: 'abc123', projectRef: 'project-ref', expected, actual: changed, allowlist, generatedAt: '2026-09-29T00:02:00.000Z' });
  assert.notEqual(base.deterministicDigest, changedManifest.deterministicDigest);
});

test('625 reports never persist connection URLs, passwords or JWT-like secrets', () => {
  const safe = buildDriftManifest({ repoSha: 'abc123', projectRef: 'project-ref', expected, actual, allowlist, generatedAt: '2026-09-29T00:00:00.000Z' });
  assert.doesNotThrow(() => assertManifestSafe(safe));
  const credentialUrl = ['postgresql', '//user', 'password@db.example.test/postgres'].join(':');
  const jwtLike = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxIn0', 'signature'].join('.');
  assert.throws(() => assertManifestSafe({ ...safe, leaked: credentialUrl }), /unsafe/i);
  assert.throws(() => assertManifestSafe({ ...safe, leaked: jwtLike }), /unsafe/i);
});

test('625 introspection catalog is statically read-only', () => {
  assert.ok(INTROSPECTION_QUERIES.length >= 8);
  for (const { name, sql } of INTROSPECTION_QUERIES) {
    const stripped = sql.replace(/--.*$/gm, '').trim();
    assert.match(stripped, /^(SELECT|WITH)\b/i, name);
    assert.doesNotMatch(stripped, /\b(INSERT|UPDATE|DELETE|UPSERT|MERGE|ALTER|DROP|TRUNCATE|CREATE|COPY|CALL|DO|GRANT|REVOKE)\b/i, name);
  }
});

test('625 expression normalization handles common PostgreSQL equivalents without erasing semantics', () => {
  assert.equal(normalizeExpression('CURRENT_TIMESTAMP'), normalizeExpression('now()'));
  assert.equal(normalizeExpression(' ( gen_random_uuid() )::text '), normalizeExpression('gen_random_uuid()::text'));
  assert.notEqual(normalizeExpression('false'), normalizeExpression('true'));
});

test('625 platform-managed extension/version and managed-schema differences remain informational', () => {
  const e = { objects: [
    { kind: 'extension', schema: 'extensions', name: 'pg_graphql', extensionName: 'pg_graphql', signature: { version: '1.5.0', extensionName: 'pg_graphql' } },
  ] };
  const a = { objects: [
    { kind: 'extension', schema: 'extensions', name: 'pg_graphql', extensionName: 'pg_graphql', signature: { version: '1.6.0', extensionName: 'pg_graphql' } },
  ] };
  const findings = classifyDrift(e, a, { allowlist });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].category, 'EXPECTED_PLATFORM_OBJECT');
  assert.equal(findings[0].severity, 'INFO');
});

test('625 known database-owner roles can be declared semantically equivalent', () => {
  const withOwners = { ...allowlist, ownerEquivalenceGroups: [['postgres', 'supabase_admin']] };
  const e = { objects: [{ kind: 'table', schema: 'public', name: 'T', signature: { rlsEnabled: true, owner: 'postgres' } }] };
  const a = { objects: [{ kind: 'table', schema: 'public', name: 'T', signature: { rlsEnabled: true, owner: 'supabase_admin' } }] };
  assert.deepEqual(classifyDrift(e, a, { allowlist: withOwners }), []);
});

test('625 sidecar SQL is explicitly classified by database authority', () => {
  const classified = classifySidecarSql({
    policyAuthority: { sql: ['policy.sql'] },
    historicalEphemeralBaseline: { sql: ['baseline.sql'] },
    legacyCompatibilitySql: ['legacy.sql'],
  });
  assert.deepEqual(classified, [
    { path: 'baseline.sql', classification: 'HISTORICAL_EPHEMERAL_BASELINE' },
    { path: 'legacy.sql', classification: 'LEGACY_COMPATIBILITY' },
    { path: 'policy.sql', classification: 'POLICY_AUTHORITY' },
  ]);
});

test('625 database-authority preflight is mandatory and fail-closed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contagest-625-authority-'));
  const scriptsDir = path.join(root, 'scripts');
  fs.mkdirSync(scriptsDir);
  const gate = path.join(scriptsDir, 'database-authority-audit-v6775.mjs');
  try {
    fs.writeFileSync(gate, 'process.exit(0);\n');
    assert.doesNotThrow(() => runDatabaseAuthorityPreflight(root));
    fs.writeFileSync(gate, 'process.exit(7);\n');
    assert.throws(() => runDatabaseAuthorityPreflight(root), /database-authority preflight failed/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('625 expected live source is fail-closed to isolated database suffixes', () => {
  const authority = { historicalEphemeralBaseline: { allowedDatabaseSuffixes: ['_e2e', '_drill', '_restore'] } };
  const pgUrl = (database) => ['postgresql', '//u', `p@localhost/${database}`].join(':');
  assert.doesNotThrow(() => assertExpectedDatabaseIsEphemeral(pgUrl('contagest_625_drill'), authority));
  assert.throws(() => assertExpectedDatabaseIsEphemeral(pgUrl('postgres'), authority), /isolated\/ephemeral/i);
});

test('625 function bodies are fingerprinted but never persisted in snapshots', () => {
  const snapshot = snapshotFromQueryResults([
    { name: 'metadata', rows: [{ server_version: '17.6', server_version_num: '170006' }] },
    { name: 'routines', rows: [{ schema_name: 'public', routine_name: 'sensitive_fn', routine_kind: 'f', identity_arguments: '', result_type: 'void', language: 'plpgsql', security_definer: true, owner: 'postgres', definition: "CREATE FUNCTION sensitive_fn() RETURNS void AS $$ BEGIN PERFORM 'super-secret-value'; END $$ LANGUAGE plpgsql", extension_name: null }] },
  ]);
  const fn = snapshot.objects.find((object) => object.kind === 'function' && object.name === 'sensitive_fn');
  assert.match(fn.signature.bodySha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(snapshot).includes('super-secret-value'), false);
  assert.equal(fn.signature.owner, 'postgres');
});

test('625 query rows become a physical snapshot without application row values', () => {
  const snapshot = snapshotFromQueryResults([
    { name: 'metadata', rows: [{ server_version: '17.6', server_version_num: '170006' }] },
    { name: 'schemas', rows: [{ schema_name: 'public', owner: 'postgres' }] },
    { name: 'tables', rows: [{ schema_name: 'public', object_name: 'LedgerEntry', relkind: 'r', rls_enabled: true, rls_forced: false, owner: 'postgres', extension_name: null }] },
    { name: 'columns', rows: [{ schema_name: 'public', table_name: 'LedgerEntry', column_name: 'postedAt', data_type: 'timestamp with time zone', nullable: true, default_expr: null, identity_kind: '', generated_kind: '' }] },
    { name: 'constraints', rows: [] }, { name: 'indexes', rows: [] }, { name: 'types', rows: [] }, { name: 'triggers', rows: [] }, { name: 'routines', rows: [] }, { name: 'policies', rows: [] }, { name: 'table_grants', rows: [] }, { name: 'routine_grants', rows: [] }, { name: 'extensions', rows: [] }, { name: 'sequences', rows: [] },
  ]);
  assert.equal(snapshot.metadata.postgresVersion, '17.6');
  assert.ok(snapshot.objects.some((object) => object.kind === 'column' && object.name === 'postedAt'));
  assert.equal(JSON.stringify(snapshot).includes('rows'), false);
});
