import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), 'utf8');

void test('production workflow binds every release job to the exact candidate SHA and keeps PR/scheduled duties separate', async () => {
  const workflow = await read('.github/workflows/hipico-production-gates-v290.yml');
  assert.match(workflow, /HIPICO_CANDIDATE_SHA:\s*\$\{\{ github\.event\.pull_request\.merge_commit_sha \|\| github\.sha \}\}/);
  assert.ok((workflow.match(/ref:\s*\$\{\{ env\.HIPICO_CANDIDATE_SHA \}\}/g) || []).length >= 6, 'all release jobs must checkout exact candidate SHA');
  for (const job of ['static-release:', 'postgres-e2e:', 'browser-chromium:', 'security-regression:', 'browser-matrix:', 'android-debug:', 'final-release-gate:']) {
    assert.ok(workflow.includes(job), `missing ${job}`);
  }
  assert.match(workflow, /postgres:16-alpine/);
  assert.match(workflow, /poppler-utils tesseract-ocr tesseract-ocr-eng/);
  assert.match(workflow, /hipico-ephemeral-db-v290\.mjs create/);
  assert.match(workflow, /if:\s*always\(\)[\s\S]*hipico-ephemeral-db-v290\.mjs drop/);
  assert.match(workflow, /src\/modules\/hipico-bot\/production-e2e-v290\.ts/);
  assert.match(workflow, /browser:\s*\[chromium, firefox, webkit\]/);
  assert.match(workflow, /hipico-verify-evidence-v290\.mjs/);
  assert.match(workflow, /hipico-release-report-v290\.mjs/);
  assert.match(workflow, /actions\/download-artifact@v7/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
  assert.doesNotMatch(workflow, /\|\|\s*true(?:\s|$)/m);
});

void test('release guard validates current canonical architecture and anti-bypass rules instead of obsolete paths', async () => {
  const guard = await read('scripts/hipico-release-guard-v290.mjs');
  for (const path of [
    'backend/src/modules/hipico/hipico-domain.ts',
    'backend/src/modules/hipico/hipico-system.routes.ts',
    'backend/src/modules/hipico/command-center.routes.ts',
    'backend/src/modules/hipico/operator-read.routes.ts',
    'backend/src/modules/hipico-bot/production-e2e-v290.ts',
    'tests/hipico_canonical_facade_290.test.mjs',
    'tests/hipico_command_center_289.test.mjs',
    'qa/hipico-production-v290.spec.mjs',
    '.github/workflows/hipico-production-gates-v290.yml'
  ]) assert.ok(guard.includes(path), `release guard missing current path ${path}`);
  assert.doesNotMatch(guard, /hipico-command-center-v289\.spec|hipico_command_center_issue_289|hipico_production_security_issue_290/);
  for (const marker of ['test.skip/test.only', 'waitForTimeout/sleep', 'forced browser action', 'continue-on-error', 'shell bypass']) {
    assert.ok(guard.includes(marker), `release guard missing anti-bypass marker ${marker}`);
  }
});

void test('root scripts expose an explicit #289/#290 contract suite', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.engines.node, '22.x');
  assert.match(pkg.scripts['test:hipico:command-center'], /hipico_command_center_289\.test\.mjs/);
  assert.match(pkg.scripts['test:hipico:command-center'], /hipico_canonical_facade_290\.test\.mjs/);
  assert.match(pkg.scripts['test:hipico:production-contract'], /hipico_production_pipeline_290\.test\.mjs/);
  assert.match(pkg.scripts['release:hipico:v290'], /hipico-release-guard-v290\.mjs/);
});
