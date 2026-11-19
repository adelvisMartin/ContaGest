import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA = 'a'.repeat(40);
const verifier = fileURLToPath(new URL('../scripts/hipico-verify-evidence-v290.mjs', import.meta.url));

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'hipico-839-evidence-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const relative of [
    'products/hipico-control', 'ops/backup', 'artifacts/qa/first', 'artifacts/qa/second'
  ]) mkdirSync(join(root, relative), { recursive: true });
  copyFileSync(new URL('../products/hipico-control/soak-policy-v120.json', import.meta.url),
    join(root, 'products/hipico-control/soak-policy-v120.json'));
  copyFileSync(new URL('../ops/backup/hipico-public-tables.txt', import.meta.url),
    join(root, 'ops/backup/hipico-public-tables.txt'));
  return root;
}

function authArtifact(complete) {
  return {
    schema: 'hipico-auth-recovery-e2e.v28',
    candidateSha: SHA, status: 'PASS',
    phase: complete ? 'COMPLETE' : 'NOT_EXECUTED',
    e2eComplete: complete
  };
}

function verify(root, id = 'authRecovery', section = 'optional') {
  const result = spawnSync(process.execPath, [verifier], {
    cwd: root,
    env: {
      ...process.env,
      HIPICO_RELEASE_SHA: SHA,
      HIPICO_EVIDENCE_ROOT: join(root, 'artifacts/qa')
    },
    encoding: 'utf8',
    windowsHide: true
  });
  // Other mandatory evidence is intentionally absent from this isolated
  // fixture; the release must remain blocked in both branches of the test.
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(readFileSync(
    join(root, 'artifacts/qa/hipico-v290/evidence-verification.json'), 'utf8'));
  assert.equal(report.sha, SHA);
  assert.notEqual(report.status, 'PASS');
  return report[section].find((item) => item.id === id);
}

test('#839 a malformed PASS sibling cannot be hidden by a valid PASS artifact', (t) => {
  const root = fixture(t);
  const first = join(root, 'artifacts/qa/first/auth-recovery-evidence.json');
  const second = join(root, 'artifacts/qa/second/auth-recovery-evidence.json');
  writeFileSync(first, JSON.stringify(authArtifact(true)));
  writeFileSync(second, JSON.stringify(authArtifact(false)));

  const invalid = verify(root);
  assert.deepEqual(
    { status: invalid.status, reason: invalid.reason },
    { status: 'FAIL', reason: 'EVIDENCE_CONTRACT_MISMATCH' }
  );

  writeFileSync(second, JSON.stringify(authArtifact(true)));
  assert.equal(verify(root).status, 'PASS');
});

test('#839 corrupt JSON sibling blocks a valid PASS instead of disappearing', (t) => {
  const root = fixture(t);
  const first = join(root, 'artifacts/qa/first/auth-recovery-evidence.json');
  const second = join(root, 'artifacts/qa/second/auth-recovery-evidence.json');
  writeFileSync(first, JSON.stringify(authArtifact(true)));
  writeFileSync(second, '{"schema":"hipico-auth-recovery-e2e.v28","status":"PASS"');

  assert.deepEqual(
    (({ status, reason }) => ({ status, reason }))(verify(root)),
    { status: 'FAIL', reason: 'EVIDENCE_JSON_INVALID' }
  );

  writeFileSync(second, JSON.stringify(authArtifact(true)));
  assert.equal(verify(root).status, 'PASS');
});

test('#839 PostgreSQL gate rejects old PG16 evidence on a PG17 release', (t) => {
  const root = fixture(t);
  const proofPath = join(root, 'artifacts/qa/first/postgres-gate.json');
  const artifact = (database) => ({
    schema: 'hipico-postgres-gate.v290-current',
    sha: SHA,
    status: 'PASS',
    database,
    migrations: 'v12-v27',
    testChannelReplay: 'PASS',
    agentPolicyMetrics: 'PASS',
    restartRecovery: 'PASS',
    loadProfile: 'PASS'
  });
  writeFileSync(proofPath, JSON.stringify(artifact('isolated-ephemeral-postgresql-16')));
  assert.deepEqual(
    (({ status, reason }) => ({ status, reason }))(verify(root, 'postgresGate', 'required')),
    { status: 'FAIL', reason: 'EVIDENCE_CONTRACT_MISMATCH' }
  );

  writeFileSync(proofPath, JSON.stringify(artifact('isolated-ephemeral-postgresql-17')));
  assert.equal(verify(root, 'postgresGate', 'required').status, 'PASS');
});
