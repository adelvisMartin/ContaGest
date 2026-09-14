import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rootPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const rootVercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const frontendVercel = JSON.parse(readFileSync(new URL('../frontend/vercel.json', import.meta.url), 'utf8'));
const browserPreqa = readFileSync(new URL('../scripts/vercel-browser-preqa-v16.mjs', import.meta.url), 'utf8');

const EXPECTED_INSTALL_COMMAND = 'npm ci --no-audit --no-fund';
const EXPECTED_DEPLOYMENT_POLICY = {
  '**': false,
  main: true,
  'release/**': true,
  'qa/postmerge-58x5-verification': true,
  'fix/post-312-gates-mobile-hardening': true
};

function assertLockedInstall(config, label) {
  assert.equal(config.installCommand, EXPECTED_INSTALL_COMMAND, `${label} must use the exact lockfile install`);
  assert.doesNotMatch(config.installCommand, /npm\s+install(?:\s|$)/);
}

function assertDeploymentBudget(config, label) {
  const deploymentEnabled = config.git?.deploymentEnabled;
  assert.equal(typeof deploymentEnabled, 'object', `${label} deploymentEnabled must be a branch allowlist object`);
  assert.deepEqual(deploymentEnabled, EXPECTED_DEPLOYMENT_POLICY, `${label} deployment budget drifted`);
}

test('Vercel installs the exact locked workspace dependency graph on the repository Node contract', () => {
  assert.equal(rootPackage.engines?.node, '22.x');
  assert.equal(lock.lockfileVersion, 3);
  assert.deepEqual(lock.packages?.['']?.workspaces, ['frontend', 'backend']);
  assert.equal(lock.packages?.['']?.engines?.node, '22.x');
  assertLockedInstall(rootVercel, 'root vercel.json');
  assertLockedInstall(frontendVercel, 'frontend/vercel.json');
});

test('browser pre-QA reuses the locked Vercel install and only adds the pinned serverless Chromium runtime', () => {
  assert.doesNotMatch(browserPreqa, /execute\('npm',\['install','--include=dev'/);
  assert.match(browserPreqa, /SERVERLESS_CHROMIUM_VERSION='149\.0\.0'/);
  assert.match(browserPreqa, /@sparticuz\/chromium@\$\{SERVERLESS_CHROMIUM_VERSION\}/);
  assert.match(browserPreqa, /'--no-save'/);
  assert.match(browserPreqa, /'--package-lock=false'/);
});

test('Vercel auto-deploy budget is fail-closed in root and effective frontend project config', () => {
  assertDeploymentBudget(rootVercel, 'root vercel.json');
  assertDeploymentBudget(frontendVercel, 'frontend/vercel.json');
});
