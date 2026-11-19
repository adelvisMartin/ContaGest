import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

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
  return section === 'browser' ? report.browser : report[section].find((item) => item.id === id);
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

function syntheticPng() {
  // Real, valid PNG bytes produced without a browser: never authoritative
  // without an independent exact-SHA Chromium execution artifact.
  const crc32 = (bytes) => {
    let crc = 0xffffffff;
    for (const value of bytes) {
      crc ^= value;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data = Buffer.alloc(0)) => {
    const label = Buffer.from(type, 'ascii');
    const body = Buffer.concat([label, data]);
    const header = Buffer.alloc(4);
    header.writeUInt32BE(data.length);
    const trailer = Buffer.alloc(4);
    trailer.writeUInt32BE(crc32(body));
    return Buffer.concat([header, body, trailer]);
  };
  const width = 400, height = 250;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // RGBA, 8 bits/channel
  ihdr[9] = 6;
  const pixels = Buffer.alloc(height * (width * 4 + 1));
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(pixels)), chunk('IEND')
  ]);
}

test('#839 a PNG alone never fabricates browser PASS without exact-SHA Chromium', (t) => {
  const root = fixture(t);
  const dir = join(root, 'artifacts/qa/hipico-v105', SHA);
  mkdirSync(dir, { recursive: true });
  const imagePath = join(dir, 'browser-400.png');
  writeFileSync(imagePath, syntheticPng());

  let result = verify(root, 'browserVisualEvidence', 'browser');
  assert.equal(result.status, 'NOT_EXECUTED');
  assert.equal(result.reason, 'CHROMIUM_GATE_NOT_VERIFIED');
  assert.equal(result.screenshotCount, 1);

  writeFileSync(join(root, 'artifacts/qa/first/chromium-gate.json'), JSON.stringify({
    schema: 'hipico-browser-gate.v290-current',
    sha: SHA, status: 'PASS'
  }));
  result = verify(root, 'browserVisualEvidence', 'browser');
  assert.equal(result.status, 'PASS');
  assert.equal(result.screenshotCount, 1);

  writeFileSync(imagePath, 'invalid empty screenshot placeholder');
  result = verify(root, 'browserVisualEvidence', 'browser');
  assert.equal(result.status, 'NOT_EXECUTED');
  assert.equal(result.screenshotCount, 0);
  assert.equal(result.reason, 'BROWSER_EVIDENCE_MISSING');
});
