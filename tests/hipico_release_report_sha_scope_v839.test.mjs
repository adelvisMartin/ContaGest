import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REQUIRED_HIPICO_EVIDENCE_IDS, OPTIONAL_HIPICO_EVIDENCE_IDS,
  validHipicoVerificationReport
} from '../scripts/hipico-release-verification-integrity-v839.mjs';

const SHA = 'a'.repeat(40);
const OTHER_SHA = 'b'.repeat(40);
const reportScript = fileURLToPath(new URL('../scripts/hipico-release-report-v290.mjs', import.meta.url));
const proof = (id) => ({ id, status: 'PASS', file: `synthetic/${id}.json` });
const verification = (sha) => ({
  schema: 'hipico-evidence-verification.v290-current',
  sha, status: 'PASS', checkedAt: new Date().toISOString(),
  required: REQUIRED_HIPICO_EVIDENCE_IDS.map(proof),
  optional: OPTIONAL_HIPICO_EVIDENCE_IDS.map(proof),
  browser: { id: 'browserVisualEvidence', status: 'PASS', screenshotCount: 1 }
});

test('#839 report never attributes optional physical/soak/DR PASS from a different SHA', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'hipico-839-report-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const output = join(root, 'artifacts/qa/hipico-v290');
  mkdirSync(output, { recursive: true });
  const run = (artifact) => {
    writeFileSync(join(output, 'evidence-verification.json'), JSON.stringify(artifact));
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

  const stale = run(verification(OTHER_SHA));
  assert.equal(stale.gates.evidence, 'NOT_EXECUTED');
  for (const gate of ['physicalQa', 'soak', 'drRestore']) {
    assert.equal(stale.gates[gate], 'NOT_EXECUTED', gate);
  }
  assert.equal(stale.evidence.authRecoveryArtifact, 'NOT_EXECUTED');
  assert.equal(stale.evidence.productionSchemaArtifact, 'NOT_EXECUTED');

  const current = run(verification(SHA));
  assert.equal(current.gates.evidence, 'PASS');
  for (const gate of ['physicalQa', 'soak', 'drRestore']) {
    assert.equal(current.gates[gate], 'PASS', gate);
  }
  assert.equal(current.evidence.authRecoveryArtifact, 'PASS');
  assert.equal(current.evidence.productionSchemaArtifact, 'PASS');
  assert.notEqual(current.stablePromotionStatus, 'PASS');
});

test('#839 report rejects incomplete or contradictory verifier JSON even with matching SHA', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'hipico-839-forged-report-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const output = join(root, 'artifacts/qa/hipico-v290');
  mkdirSync(output, { recursive: true });
  const run = (artifact) => {
    writeFileSync(join(output, 'evidence-verification.json'), JSON.stringify(artifact));
    const result = spawnSync(process.execPath, [reportScript], {
      cwd: root, env: { ...process.env, HIPICO_RELEASE_SHA: SHA },
      encoding: 'utf8', windowsHide: true
    });
    assert.equal(result.status, 1, result.stderr);
    return JSON.parse(readFileSync(join(output, 'release-report.json'), 'utf8'));
  };
  const defects = [
    report => { report.required.pop(); },
    report => { report.required[0] = report.required[1]; },
    report => { report.required[0].status = 'FAIL'; },
    report => { report.optional.pop(); },
    report => { report.optional[0] = report.optional[1]; },
    report => { report.optional[0].status = 'OTHER'; },
    report => { report.schema = 'unrecognized'; },
    report => { report.checkedAt = 'invalid'; },
    report => { report.browser.screenshotCount = 0; },
    report => { report.required.find(row => row.id === 'chromiumGate').status = 'NOT_EXECUTED'; },
    report => { report.required[0].file = null; }
  ];
  for (const [i, mutate] of defects.entries()) {
    const artifact = verification(SHA);
    mutate(artifact);
    assert.equal(validHipicoVerificationReport(artifact, SHA), false, 'pure guard #' + i);
    const report = run(artifact);
    assert.equal(report.gates.evidence, 'NOT_EXECUTED', 'report gate #' + i);
    for (const gate of ['physicalQa', 'soak', 'drRestore']) {
      assert.equal(report.gates[gate], 'NOT_EXECUTED', 'optional gate #' + i + ':' + gate);
    }
    assert.equal(report.readiness.productionReady, false);
  }
});

test('#839 verifier/reporter required and optional gate inventories do not silently diverge', () => {
  const source = readFileSync(new URL('../scripts/hipico-verify-evidence-v290.mjs', import.meta.url), 'utf8');
  const requiredSection = source.slice(source.indexOf('const requiredDescriptors = ['),
    source.indexOf('// #119'));
  const optionalSection = source.slice(source.indexOf('const optionalDescriptors = ['),
    source.indexOf('async function findDescriptor('));
  const ids = section => [...section.matchAll(/\bid: '([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(ids(requiredSection), [...REQUIRED_HIPICO_EVIDENCE_IDS]);
  assert.deepEqual(ids(optionalSection), [...OPTIONAL_HIPICO_EVIDENCE_IDS]);
});
