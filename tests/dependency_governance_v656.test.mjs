import test from 'node:test';
import assert from 'node:assert/strict';
import { auditDependencyGovernance } from '../scripts/dependency-governance-v656.mjs';

function fixture() {
  const rootPackage = { name: 'fixture-root', version: '1.0.0', workspaces: ['backend', 'frontend'], devDependencies: { test: '1.0.0' } };
  const workspacePackages = {
    backend: { name: 'backend', version: '1.0.0', dependencies: { server: '2.0.0', backendAlias: '3.0.0' } },
    frontend: { name: 'frontend', version: '1.0.0', dependencies: { backend: 'file:../backend', browser: '4.0.0' } },
  };
  const lock = { lockfileVersion: 3, packages: {
    '': { name: 'fixture-root', version: '1.0.0', devDependencies: { test: '1.0.0' } },
    backend: { name: 'backend', version: '1.0.0', dependencies: { server: '2.0.0', backendAlias: '3.0.0' } },
    frontend: { name: 'frontend', version: '1.0.0', dependencies: { backend: 'file:../backend', browser: '4.0.0' } },
    'node_modules/test': { version: '1.0.0', license: 'MIT', dev: true },
    'node_modules/server': { version: '2.0.0', license: 'MIT' },
    'node_modules/backendAlias': { version: '3.0.0', license: 'Apache-2.0' },
    'node_modules/backend': { link: true, resolved: 'backend' },
    'node_modules/browser': { version: '4.0.0', license: 'MIT' },
  } };
  const catalog = { schemaVersion: 656, dependencies: {
    'root:test': { owner: 'QA', purpose: 'Test' }, 'backend:server': { owner: 'API', purpose: 'Server' },
    'backend:backendAlias': { owner: 'API', purpose: 'Library' }, 'frontend:backend': { owner: 'Shared', purpose: 'Contract' },
    'frontend:browser': { owner: 'UI', purpose: 'Browser' },
  }, overlapReviews: [] };
  return { rootPackage, workspacePackages, lock, catalog };
}

test('valid lock and direct ownership generate stable, classified entries', () => {
  const f = fixture(); const a = auditDependencyGovernance(f); const b = auditDependencyGovernance(f);
  assert.deepEqual(a, b); assert.equal(a.status, 'PASS'); assert.equal(a.directCount, 5);
  assert.equal(a.direct.find((x) => x.name === 'test').classification, 'devDependencies');
  assert.equal(a.direct.find((x) => x.name === 'backend').resolutionPath, 'backend');
  assert.equal(a.externalEvidence.advisoryAudit, 'NOT_EXECUTED');
});
test('missing resolution fails closed, even when direct manifest exists', () => {
  const f = fixture(); delete f.lock.packages['node_modules/server'];
  const result = auditDependencyGovernance(f);
  assert.equal(result.status, 'FAIL'); assert.ok(result.findings.some((x) => x.code === 'LOCK_RESOLUTION_MISSING'));
});
test('unowned direct dependency is P1; owner record cannot cover wrong workspace', () => {
  const f = fixture(); delete f.catalog.dependencies['backend:server'];
  assert.ok(auditDependencyGovernance(f).findings.some((x) => x.code === 'DEPENDENCY_OWNER_MISSING' && x.subject === 'backend:server'));
});
test('a potentially restrictive direct license requires explicit independent review', () => {
  const f = fixture(); f.lock.packages['node_modules/server'].license = 'AGPL-3.0-only';
  assert.ok(auditDependencyGovernance(f).findings.some((x) => x.code === 'LICENSE_REVIEW_REQUIRED' && x.severity === 'P1'));
});
test('license without evidence cannot be advertised as verified', () => {
  const f = fixture(); delete f.lock.packages['node_modules/server'].license;
  const result = auditDependencyGovernance(f);
  assert.equal(result.status, 'REVIEW_REQUIRED'); assert.ok(result.findings.some((x) => x.code === 'LICENSE_NOT_IN_LOCK'));
});
test('lock declaration drift remains reviewable and does not fabricate frozen install failure', () => {
  const f = fixture(); f.lock.packages.backend.dependencies.server = '^2.0.0';
  const result = auditDependencyGovernance(f);
  assert.equal(result.status, 'REVIEW_REQUIRED'); assert.ok(result.findings.some((x) => x.code === 'LOCK_DECLARATION_DRIFT'));
});
test('exact pin different from resolved version blocks', () => {
  const f = fixture(); f.lock.packages['node_modules/server'].version = '2.1.0';
  assert.ok(auditDependencyGovernance(f).findings.some((x) => x.code === 'EXACT_PIN_MISMATCH'));
});
test('missing workspace symlink rejects local file dependency', () => {
  const f = fixture(); delete f.lock.packages['node_modules/backend'];
  assert.ok(auditDependencyGovernance(f).findings.some((x) => x.code === 'LOCK_RESOLUTION_MISSING' && x.subject === 'frontend:backend'));
});
test('unexpected schema version and missing catalog block audit', () => {
  const f = fixture(); f.lock.lockfileVersion = 2;
  assert.throws(() => auditDependencyGovernance(f), /GOVERNANCE_LOCKFILE_V3_REQUIRED/);
  const g = fixture(); g.catalog.dependencies = undefined;
  assert.throws(() => auditDependencyGovernance(g), /GOVERNANCE_OWNER_CATALOG_REQUIRED/);
});
test('orphan catalog and unsupported workspace changes remain visible', () => {
  const f = fixture(); f.catalog.dependencies['backend:removed'] = { owner: 'QA', purpose: 'Old' };
  f.rootPackage.workspaces = ['backend'];
  const result = auditDependencyGovernance(f);
  assert.ok(result.findings.some((x) => x.code === 'STALE_OWNER_RECORD'));
  assert.ok(result.findings.some((x) => x.code === 'WORKSPACE_SCOPE_DRIFT'));
});
