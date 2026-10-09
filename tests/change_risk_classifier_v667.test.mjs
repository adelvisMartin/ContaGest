import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyChangeRisk } from '../qa/support/change-risk-classifier-v667.mjs';
import { buildProfilePlan } from '../scripts/local-verification-runner-v630.mjs';

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

test('the local runner contains executable QA for all classifier profiles', () => {
  for (const profile of ['docs', 'agent', 'backend', 'frontend', 'database', 'financial', 'security', 'ui', 'ui-routes', 'infra']) {
    const plan = buildProfilePlan(profile);
    assert.ok(plan.length > 0, profile);
    assert.ok(plan.every((gate) => gate.required && gate.command), profile);
  }
  assert.deepEqual(buildProfilePlan('docs').map(({ command }) => command), [
    'node --test tests/change_risk_classifier_v667.test.mjs',
  ]);
  assert.ok(buildProfilePlan('security').some(({ command }) => command.includes('test:auth-bootstrap:unit')));
  assert.ok(buildProfilePlan('infra').some(({ command }) => command === 'npm run build'));
});

function dryRunFor(file) {
  const root = mkdtempSync(join(tmpdir(), 'cg667-'));
  try {
    const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    git('init', '-b', 'main');
    git('config', 'user.email', 'qa@example.invalid');
    git('config', 'user.name', 'QA');
    writeFileSync(join(root, 'baseline.txt'), 'baseline\n');
    git('add', '.');
    git('commit', '-m', 'baseline');
    git('checkout', '-b', 'feature');
    mkdirSync(join(root, file.split('/').slice(0, -1).join('/')), { recursive: true });
    writeFileSync(join(root, file), 'new file\n');
    git('add', '.');
    git('commit', '-m', 'candidate');
    const script = fileURLToPath(new URL('../scripts/local-verification-runner-v630.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [script, '--profile', 'changed', '--base', 'main', '--dry-run'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('real git diff -> local runner dry-run: documentation only stays lightweight', () => {
  const actual = dryRunFor('docs/qa/change.md');
  assert.deepEqual(actual.derivedProfiles, ['docs']);
  assert.deepEqual(actual.gates.map(({ command }) => command), ['node --test tests/change_risk_classifier_v667.test.mjs']);
  assert.equal(actual.riskDecision.override.requiresReview, false);
  assert.equal(actual.gates[0].status, 'NOT_EXECUTED');
});

test('real git diff -> local runner dry-run: auth requests backend, DB and security', () => {
  const actual = dryRunFor('backend/src/modules/auth/auth.routes.ts');
  assert.deepEqual(actual.derivedProfiles, ['backend', 'database', 'security']);
  assert.equal(actual.riskDecision.critical, true);
  assert.ok(actual.gates.some(({ command }) => command.includes('canonical-database-gate-v632')));
  assert.ok(actual.gates.some(({ command }) => command.includes('test:auth-bootstrap:unit')));
});
