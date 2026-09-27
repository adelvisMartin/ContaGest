import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const spec = fs.readFileSync('qa/benchmark-verticals-v590.spec.mjs', 'utf8');
const runner = fs.readFileSync('scripts/benchmark-verticals-v590.mjs', 'utf8');
const workflow = fs.readFileSync('.github/workflows/benchmark-verticals-v590.yml', 'utf8');

test('#590 names every vertical, desktop/mobile, RBAC and transient states', () => {
  for (const value of ['odontologia', 'gimnasio', 'veterinaria', 'desktop-1366', 'mobile-390', 'loading', 'empty', 'error']) assert.ok(spec.includes(value));
  assert.match(spec, /AccessControlService\.canAccessRoute/);
  assert.match(spec, /keyboard\.press\('Tab'\)/);
});

test('#590 combines real PostgreSQL lifecycle with browser runtime/action gates', () => {
  assert.match(runner, /verticals-backend-real-v4851\.test\.ts/);
  assert.match(runner, /benchmark-verticals-v590\.spec\.mjs/);
  assert.match(runner, /module-actions-runtime-v163\.spec\.mjs/);
});

test('#590 contains no skip/only/sleep shortcuts and produces exact-SHA artifacts', () => {
  for (const source of [spec, runner, workflow]) assert.doesNotMatch(source, /waitForTimeout|test\.skip|\.only\(/);
  assert.match(spec, /CANDIDATE_SHA_REQUIRED_40_HEX/);
  assert.match(workflow, /upload-artifact@v6/);
});
