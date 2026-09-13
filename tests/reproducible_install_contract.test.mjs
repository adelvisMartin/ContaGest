import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rootPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const browserPreqa = readFileSync(new URL('../scripts/vercel-browser-preqa-v16.mjs', import.meta.url), 'utf8');

test('Vercel installs the exact locked workspace dependency graph on the repository Node contract', () => {
  assert.equal(rootPackage.engines?.node, '22.x');
  assert.equal(lock.lockfileVersion, 3);
  assert.deepEqual(lock.packages?.['']?.workspaces, ['frontend', 'backend']);
  assert.equal(lock.packages?.['']?.engines?.node, '22.x');
  assert.equal(vercel.installCommand, 'npm ci --no-audit --no-fund');
  assert.doesNotMatch(vercel.installCommand, /npm\s+install(?:\s|$)/);
});

test('browser pre-QA reuses the locked Vercel install and only adds the pinned serverless Chromium runtime', () => {
  assert.doesNotMatch(browserPreqa, /execute\('npm',\['install','--include=dev'/);
  assert.match(browserPreqa, /SERVERLESS_CHROMIUM_VERSION='149\.0\.0'/);
  assert.match(browserPreqa, /@sparticuz\/chromium@\$\{SERVERLESS_CHROMIUM_VERSION\}/);
  assert.match(browserPreqa, /'--no-save'/);
  assert.match(browserPreqa, /'--package-lock=false'/);
});

test('Vercel auto-deploy budget is fail-closed except for production, release and explicit QA evidence branches', () => {
  const deploymentEnabled = vercel.git?.deploymentEnabled;
  assert.equal(typeof deploymentEnabled, 'object');
  assert.equal(deploymentEnabled['**'], false);
  assert.equal(deploymentEnabled.main, true);
  assert.equal(deploymentEnabled['release/**'], true);
  assert.equal(deploymentEnabled['qa/postmerge-58x5-verification'], true);
  assert.equal(deploymentEnabled['fix/post-312-gates-mobile-hardening'], true);
});
