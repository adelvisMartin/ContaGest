import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const protection = JSON.parse(readFileSync(new URL('../ops/github/main-branch-protection-v97.json', import.meta.url), 'utf8'));
const governance = JSON.parse(readFileSync(new URL('../ops/github/main-release-governance-v97.json', import.meta.url), 'utf8'));
const docs = readFileSync(new URL('../docs/release/BRANCH_PROTECTION.md', import.meta.url), 'utf8');
const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const postgres = readFileSync(new URL('../.github/workflows/postgres-tenant-rules-v28.yml', import.meta.url), 'utf8');
const browser = readFileSync(new URL('../.github/workflows/qa-browser.yml', import.meta.url), 'utf8');

test('issue #97 declara PR obligatorio y bloquea force-push/delete', () => {
  assert.ok(protection.required_pull_request_reviews, 'required_pull_request_reviews debe estar configurado');
  assert.equal(protection.enforce_admins, true);
  assert.equal(protection.required_conversation_resolution, true);
  assert.equal(protection.allow_force_pushes, false);
  assert.equal(protection.allow_deletions, false);
});

test('issue #97 no crea bypass general de administradores', () => {
  assert.equal(governance.breakGlass.generalAdminBypass, false);
  assert.equal(governance.breakGlass.authorizedPrincipal, 'repository-owner:adelvisMartin');
  assert.ok(governance.breakGlass.requirements.length >= 5);
  assert.match(docs, /No existe bypass permanente para “todos los administradores”/);
});

test('issue #97 documenta nombres reales de checks existentes', () => {
  const candidates = new Set(governance.requiredChecks.candidates.map((entry) => entry.context));
  assert.ok(candidates.has('ContaGest CI / validate'));
  assert.ok(candidates.has('PostgreSQL #28 · reglas anti-tenant reales / Migraciones + constraints v11.15'));
  assert.ok(candidates.has('ContaGest Browser QA / playwright'));

  assert.match(ci, /^name:\s*ContaGest CI/m);
  assert.match(ci, /^\s{2}validate:/m);
  assert.match(postgres, /^name:\s*PostgreSQL #28 · reglas anti-tenant reales/m);
  assert.match(postgres, /^\s{4}name:\s*Migraciones \+ constraints v11\.15/m);
  assert.match(browser, /^name:\s*ContaGest Browser QA/m);
  assert.match(browser, /^\s{2}playwright:/m);
});

test('issue #97 no promueve checks bloqueados a required', () => {
  assert.deepEqual(governance.requiredChecks.active, []);
  for (const candidate of governance.requiredChecks.candidates) {
    assert.notEqual(candidate.status, 'REQUIRED');
  }
  assert.match(governance.requiredChecks.activationRule, /BLOCKED\/NOT_EXECUTED/);
});

test('issue #97 conserva política P0/P1 independiente sin fabricar approval imposible', () => {
  assert.equal(protection.required_pull_request_reviews.required_approving_review_count, 0);
  assert.equal(governance.policy.p0p1IndependentReview, 'required-by-AGENTS');
  assert.match(docs, /autor de un cambio P0\/P1 no lo apruebe solo/);
});

test('issue #97 documenta rollback y estados exactos de evidencia', () => {
  for (const state of ['PASS', 'FAIL', 'BLOCKED', 'NOT_EXECUTED']) assert.match(docs, new RegExp(`\\b${state}\\b`));
  assert.match(docs, /Rollback de una configuración incorrecta/);
  assert.match(docs, /steps: \[\]/);
});
