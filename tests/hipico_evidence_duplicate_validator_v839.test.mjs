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

function verify(root) {
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
  return report.optional.find((item) => item.id === 'authRecovery');
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
