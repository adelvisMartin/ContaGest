import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PAGE_REGISTRY } from '../frontend/src/data/pageRegistry.js';
import { MODULE_VISUAL_CATALOG } from '../qa/support/module-visual-catalog.mjs';
import { MODULE_VERIFICATION_CATALOG } from '../qa/support/module-verification-catalog.mjs';
import { buildCoverageManifest, FUNCTIONAL_STAGES } from '../scripts/functional-coverage-v659.mjs';

const SHA = 'a'.repeat(40);
const createFixture = (fn) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cg-659-'));
  try { return fn(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
};
const cases = () => ({
  registry: { demo: ['./pages/Demo.js', 'DemoPage'] },
  visualCatalog: [{ route: 'demo', label: 'Demo', family: 'core', priority: 'high' }],
  verificationCatalog: [{
    route: 'demo', label: 'Demo', family: 'core', priority: 'high', domain: 'demo',
    persistence: 'crud', gates: ['visual', 'interaction', 'frontendE2E', 'backendPersistence', 'domain']
  }]
});
function artifact(root, value = 'verified QA log') {
  const name = 'artifacts/qa/659/test.log';
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
  return { name, sha256: crypto.createHash('sha256').update(value).digest('hex') };
}
function pass(root, stage = 'visual') {
  const { name, sha256 } = artifact(root, stage);
  return {
    status: 'PASS', candidateSha: SHA, command: 'node --test tests/functional_coverage_v659.test.mjs',
    environment: 'node-22 isolated fixture', artifact: name, artifactSha256: sha256
  };
}
function build(root, options = {}) {
  return buildCoverageManifest({ candidateSha: SHA, root, ...cases(), ...options });
}

test('catalog parity now covers all 60 registered routes, including sedes and price books', () => {
  assert.equal(Object.keys(PAGE_REGISTRY).length, 60);
  assert.equal(MODULE_VISUAL_CATALOG.length, 60);
  assert.equal(MODULE_VERIFICATION_CATALOG.length, 60);
  assert.deepEqual(MODULE_VERIFICATION_CATALOG.map((item) => item.route).sort(), Object.keys(PAGE_REGISTRY).sort());
  for (const route of ['sedes', 'listas-precio']) {
    const entry = MODULE_VERIFICATION_CATALOG.find((row) => row.route === route);
    assert.ok(entry && entry.persistence === 'crud' && entry.gates.length === 5);
  }
});

test('unexecuted proof never becomes VERIFIED because files or routes exist', () => {
  createFixture((root) => {
    const report = buildCoverageManifest({ candidateSha: SHA, root });
    assert.equal(report.summary.routes, 60);
    assert.equal(report.summary.counts.VERIFIED, 0);
    assert.equal(report.summary.counts.NOT_VERIFIED, 60);
    assert.equal(report.summary.readiness, 'NO_GO');
    assert.ok(report.summary.unverifiedCriticalHigh.includes('ventas'));
    assert.deepEqual(report.routes[0].flow, FUNCTIONAL_STAGES);
  });
});

test('registry, visual and verification catalog drift is rejected', () => createFixture((root) => {
  assert.throws(() => build(root, { verificationCatalog: [] }), /COVERAGE_ROUTE_DRIFT/);
  assert.throws(() => build(root, { registry: {}, visualCatalog: [], verificationCatalog: [] }), /COVERAGE_EMPTY_CATALOG/);
  const fixture = cases();
  fixture.visualCatalog.push({ ...fixture.visualCatalog[0] });
  assert.throws(() => build(root, fixture), /COVERAGE_ROUTE_DRIFT/);
  assert.throws(() => build(root, { registry: { other: ['./pages/X.js', 'X'] } }), /COVERAGE_ROUTE_DRIFT/);
}));

test('unknown gates and routes are rejected instead of silently dropped', () => createFixture((root) => {
  assert.throws(() => build(root, { evidence: { schemaVersion: 1, candidateSha: SHA, routes: { other: {} } } }), /COVERAGE_UNKNOWN_ROUTE/);
  assert.throws(() => build(root, { evidence: { schemaVersion: 1, candidateSha: SHA, routes: { demo: { gates: { invented: {} } } } } }), /COVERAGE_UNKNOWN_GATE/);
}));

test('evidence candidate SHA, schema and invalid status fail closed', () => createFixture((root) => {
  assert.throws(() => build(root, { candidateSha: 'bad' }), /COVERAGE_CANDIDATE_SHA_INVALID/);
  assert.throws(() => build(root, { evidence: { schemaVersion: 1, candidateSha: 'b'.repeat(40), routes: {} } }), /COVERAGE_EVIDENCE_SCHEMA_OR_SHA_MISMATCH/);
  assert.throws(() => build(root, { evidence: { schemaVersion: 1, candidateSha: SHA, routes: { demo: { gates: { visual: { status: 'GREEN' } } } } } }), /COVERAGE_STATUS_INVALID/);
}));

test('a PASS requires command, environment, SHA and artifact digest', () => createFixture((root) => {
  const evidence = { schemaVersion: 1, candidateSha: SHA, routes: { demo: { gates: { visual: { status: 'PASS' } } } } };
  assert.throws(() => build(root, { evidence }), /COVERAGE_PASS_PROVENANCE_MISSING/);
  const stale = { ...pass(root), command: 'x', environment: {} };
  assert.throws(() => build(root, { evidence: { schemaVersion: 1, candidateSha: SHA, routes: { demo: { gates: { visual: stale } } } } }), /COVERAGE_PASS_PROVENANCE_MISSING/);
}));

test('a PASS with missing, corrupted or escaped artifact is rejected', () => createFixture((root) => {
  const good = pass(root);
  const data = (visual) => ({ schemaVersion: 1, candidateSha: SHA, routes: { demo: { gates: { visual } } } });
  assert.throws(() => build(root, { evidence: data({ ...good, artifact: 'artifacts/../escape' }) }), /COVERAGE_ARTIFACT_PATH_INVALID/);
  assert.throws(() => build(root, { evidence: data({ ...good, artifact: 'artifacts/qa/659/missing.log' }) }), /COVERAGE_ARTIFACT_NOT_FOUND/);
  assert.throws(() => build(root, { evidence: data({ ...good, artifactSha256: '0'.repeat(64) }) }), /COVERAGE_ARTIFACT_HASH_MISMATCH/);
  assert.throws(() => build(root, { evidence: data({ ...good, candidateSha: 'b'.repeat(40) }) }), /COVERAGE_PASS_PROVENANCE_MISSING/);
}));

test('symlink escape cannot masquerade as an artifact', () => createFixture((root) => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cg659-external-'));
  try {
    const { name } = artifact(root);
    fs.rmSync(path.join(root, name));
    fs.symlinkSync(path.join(outside, 'external.log'), path.join(root, name));
    fs.writeFileSync(path.join(outside, 'external.log'), 'external');
    const proof = { ...pass(root, 'symlink'), artifactSha256: crypto.createHash('sha256').update('external').digest('hex') };
    // pass() above replaced the symlink with regular file; restore the escape for the actual assertion.
    fs.rmSync(path.join(root, name));
    fs.symlinkSync(path.join(outside, 'external.log'), path.join(root, name));
    const evidence = { schemaVersion: 1, candidateSha: SHA, routes: { demo: { gates: { visual: proof } } } };
    assert.throws(() => build(root, { evidence }), /COVERAGE_ARTIFACT_ESCAPE/);
  } finally { fs.rmSync(outside, { recursive: true, force: true }); }
}));

test('a verified artifact for one gate is only PARTIAL, never full route coverage', () => createFixture((root) => {
  const evidence = { schemaVersion: 1, candidateSha: SHA, routes: { demo: { gates: { visual: pass(root) } } } };
  const report = build(root, { evidence });
  assert.equal(report.routes[0].state, 'PARTIAL');
  assert.equal(report.summary.readiness, 'NO_GO');
  assert.ok(report.routes[0].missing.includes('backendPersistence'));
}));

test('all five valid gate proofs plus a real page file can mark a fixture VERIFIED', () => createFixture((root) => {
  const page = path.join(root, 'frontend/src/pages/Demo.js');
  fs.mkdirSync(path.dirname(page), { recursive: true });
  fs.writeFileSync(page, 'export const DemoPage = {};');
  const gates = {};
  for (const gate of cases().verificationCatalog[0].gates) {
    const proof = pass(root, gate);
    const dest = 'artifacts/qa/659/' + gate + '.log';
    fs.renameSync(path.join(root, proof.artifact), path.join(root, dest));
    gates[gate] = { ...proof, artifact: dest };
  }
  const evidence = { schemaVersion: 1, candidateSha: SHA, routes: { demo: { gates } } };
  const report = build(root, { evidence });
  assert.equal(report.routes[0].state, 'VERIFIED');
  assert.equal(report.summary.counts.VERIFIED, 1);
  assert.equal(report.summary.readiness, 'REVIEW_REQUIRED');
}));

test('NOT_APPLICABLE is not a loophole for an unverified backend or finance route', () => createFixture((root) => {
  const skip = { status: 'NOT_APPLICABLE', reason: 'No backend write for static help route' };
  const evidence = { schemaVersion: 1, candidateSha: SHA, routes: { demo: { gates: { backendPersistence: skip } } } };
  assert.throws(() => build(root, { evidence }), /COVERAGE_NA_UNJUSTIFIED/);
  assert.throws(() => build(root, { evidence: { ...evidence, routes: { demo: { gates: { visual: skip } } } } }), /COVERAGE_NA_UNJUSTIFIED/);
}));

test('FAIL or BLOCKED evidence stays PARTIAL rather than becoming a passing route', () => createFixture((root) => {
  for (const status of ['FAIL', 'BLOCKED']) {
    const evidence = { schemaVersion: 1, candidateSha: SHA, routes: { demo: { gates: { interaction: { status } } } } };
    assert.equal(build(root, { evidence }).routes[0].state, 'PARTIAL');
  }
}));
