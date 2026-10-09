import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyChangeRisk } from '../qa/support/change-risk-classifier-v667.mjs';

function profiles(files, override) { return classifyChangeRisk(files, override).profiles; }

test('migration always selects database plus backend and records critical scope', () => {
  const actual = classifyChangeRisk(['backend/prisma/migrations/20261009_test/migration.sql']);
  assert.deepEqual(actual.profiles, ['backend', 'database']);
  assert.equal(actual.critical, true);
  assert.ok(actual.domains.some(({ id }) => id === 'database-migration'));
});

test('finance, taxes and FX retain financial and database gates', () => {
  for (const file of ['backend/src/modules/accounting/accounting.routes.ts', 'backend/src/modules/fiscal/fiscal.routes.ts', 'backend/src/modules/currency/currency.routes.ts', 'qa/financial-fx-v560.test.ts']) {
    assert.ok(profiles([file]).includes('financial'), file);
    assert.ok(profiles([file]).includes('database'), file);
  }
});

test('auth, tenant boundaries and CRUD factory select adversarial security coverage', () => {
  for (const file of ['backend/src/modules/auth/auth.routes.ts', 'backend/src/database/runtime-tenant-context.ts', 'backend/src/modules/crud.factory.ts']) {
    const actual = profiles([file]);
    assert.ok(actual.includes('security'), file);
    assert.ok(actual.includes('database'), file);
    assert.ok(actual.includes('backend'), file);
  }
});

test('frontend styles, controls and pages select affected visual/browser profiles', () => {
  assert.deepEqual(profiles(['frontend/src/styles/erp-runtime.css']), ['frontend', 'ui']);
  assert.deepEqual(profiles(['frontend/src/components/ui/Button.jsx']), ['frontend', 'ui']);
  assert.deepEqual(profiles(['frontend/src/pages/BankingPage.jsx']), ['frontend', 'ui-routes']);
});

test('ops and dependency changes select build/infra; plain docs remain lightweight', () => {
  assert.deepEqual(profiles(['ops/docker/Dockerfile']), ['infra']);
  assert.deepEqual(profiles(['package-lock.json']), ['infra']);
  assert.deepEqual(profiles(['docs/architecture/overview.md', 'README.md']), ['docs']);
  assert.deepEqual(profiles(['AGENTS.md']), ['docs', 'agent']);
});

test('combined changes union gates, sort deterministically, and remove duplicate paths', () => {
  const paths = ['frontend/src/pages/BankingPage.jsx', 'backend/src/modules/fiscal/fiscal.routes.ts', 'README.md'];
  const a = classifyChangeRisk(paths);
  const b = classifyChangeRisk([...paths].reverse().concat(paths[0]));
  assert.deepEqual(a, b);
  assert.deepEqual(a.profiles, ['docs', 'backend', 'frontend', 'database', 'financial', 'ui-routes']);
  assert.equal(a.matches.length, 3);
});

test('unknown source fails safe but does not automatically run the full suite', () => {
  assert.deepEqual(profiles(['tools/unrecognized/new-entry.cjs']), ['backend', 'frontend']);
  assert.deepEqual(profiles([]), ['backend']);
});

test('overrides can extend but reductions demand an auditable justification', () => {
  assert.deepEqual(profiles(['README.md'], { addProfiles: ['security'] }), ['docs', 'security']);
  assert.throws(() => profiles(['backend/src/modules/auth/auth.routes.ts'], { removeProfiles: ['security'] }), /RISK_REDUCTION_REQUIRES_JUSTIFICATION/);
  const reduced = classifyChangeRisk(['backend/src/modules/auth/auth.routes.ts'], { removeProfiles: ['security'], reason: 'Reviewed by owner: security unaffected' });
  assert.deepEqual(reduced.override.removed, ['security']);
  assert.equal(reduced.override.requiresReview, true);
  assert.throws(() => profiles(['README.md'], { addProfiles: ['fictional'] }), /RISK_PROFILE_UNKNOWN/);
});

test('malformed traversal paths cannot silently evade classification', () => {
  assert.throws(() => profiles(['../backend/src/modules/auth/auth.routes.ts']), /RISK_FILE_INVALID/);
  assert.deepEqual(profiles(['frontend\\src\\pages\\ClientsPage.js']), ['frontend', 'ui-routes']);
});
