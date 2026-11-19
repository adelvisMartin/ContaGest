import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const reportScript = fileURLToPath(new URL('../scripts/hipico-release-report-v290.mjs', import.meta.url));
const OPTIONAL = ['physicalQa', 'soak', 'drRestore', 'authRecovery', 'productionSchema']
  .map((id) => ({ id, status: 'PASS' }));

test('#839 report never attributes optional physical/soak/DR PASS from a different SHA', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'hipico-839-report-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const output = join(root, 'artifacts/qa/hipico-v290');
  mkdirSync(output, { recursive: true });
  const run = (artifactSha) => {
    writeFileSync(join(output, 'evidence-verification.json'), JSON.stringify({
      schema: 'hipico-evidence-verification.v290-current',
      sha: artifactSha, status: 'PASS', optional: OPTIONAL
    }));
    const proc = spawnSync(process.execPath, [reportScript], {
      cwd: root,
      env: { ...process.env, HIPICO_RELEASE_SHA: SHA },
      encoding: 'utf8',
      windowsHide: true
    });
    // No local static/Postgres/browser gates were executed in this fixture.
    assert.equal(proc.status, 1, proc.stderr);
    const result = JSON.parse(readFileSync(join(output, 'release-report.json'), 'utf8'));
    assert.equal(result.sha, SHA);
    assert.equal(result.readiness.productionReady, false);
    return result;
  };

  const stale = run(OTHER_SHA);
  assert.equal(stale.gates.evidence, 'NOT_EXECUTED');
  for (const gate of ['physicalQa', 'soak', 'drRestore']) {
    assert.equal(stale.gates[gate], 'NOT_EXECUTED', gate);
  }
  assert.equal(stale.evidence.authRecoveryArtifact, 'NOT_EXECUTED');
  assert.equal(stale.evidence.productionSchemaArtifact, 'NOT_EXECUTED');

  const current = run(SHA);
  assert.equal(current.gates.evidence, 'PASS');
  for (const gate of ['physicalQa', 'soak', 'drRestore']) {
    assert.equal(current.gates[gate], 'PASS', gate);
  }
  assert.equal(current.evidence.authRecoveryArtifact, 'PASS');
  assert.equal(current.evidence.productionSchemaArtifact, 'PASS');
  assert.notEqual(current.stablePromotionStatus, 'PASS');
});
