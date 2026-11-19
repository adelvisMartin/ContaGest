import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../.github/workflows/performance-route-v1293.yml', import.meta.url), 'utf8');
const trigger = source.split('\n  pull_request:\n')[1]?.split('\n  workflow_dispatch:')[0];
const paths = trigger?.match(/^      - '([^']+)'$/gm)?.map(line => line.slice(9, -1)) || [];

test('#1293 route lab CI rechecks changes to canonical input owners', () => {
  assert.ok(trigger, 'Expected pull_request route-lab trigger');
  for (const dependency of [
    'qa/support/module-visual-catalog.mjs',
    'frontend/src/data/pageRegistry.js',
    'qa/support/erp-system-fixtures-v155.mjs',
    'qa/support/playwright-determinism.mjs',
    'playwright.config.mjs',
  ]) {
    assert.ok(paths.includes(dependency), "Missing required performance lab CI dependency: " + dependency);
  }
});

test('#1293 route lab CI runs on affected frontend render owners', () => {
  for (const owner of [
    'frontend/src/pages/**',
    'frontend/src/components/**',
    'frontend/src/styles/**',
    'frontend/src/app.js',
    'frontend/index.html',
    'frontend/vite.config.js',
  ]) {
    assert.ok(paths.includes(owner), `Missing frontend performance owner: ${owner}`);
  }
});

test('#1293 route lab CI retains exact candidate checkout and Chromium gate', () => {
  assert.match(source, /CANDIDATE_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(source, /ref: \$\{\{ env\.CANDIDATE_SHA \}\}/);
  assert.match(source, /run: npm run test:perf:routes:1293/);
  assert.match(source, /run: npm run perf:routes:1293/);
  assert.match(source, /run: npx playwright install --with-deps chromium/);
});
