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

function assertDeploymentBudget(config, label, { allowFullyDisabled = false } = {}) {
  const deploymentEnabled = config.git?.deploymentEnabled;
  // A full disable is STRICTER than the allowlist, and is authorized only
  // for the repository-root config. It must never become a blanket escape.
  if (allowFullyDisabled && deploymentEnabled === false) return;
  assert.ok(deploymentEnabled && typeof deploymentEnabled === 'object' && !Array.isArray(deploymentEnabled),
    `${label} deploymentEnabled must be the exact branch allowlist`);
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
  assertDeploymentBudget(rootVercel, 'root vercel.json', { allowFullyDisabled: true });
  assertDeploymentBudget(frontendVercel, 'frontend/vercel.json');
});

test('Vercel deployment policy rejects true, wildcards, missing policies, and frontend full-disable drift', () => {
  const root = { allowFullyDisabled: true };
  for (const unsafe of [
    undefined, null, true, [], { '**': true }, { ...EXPECTED_DEPLOYMENT_POLICY, 'feature/**': true }
  ]) {
    assert.throws(() => assertDeploymentBudget({ git: { deploymentEnabled: unsafe } }, 'root', root));
  }
  assert.throws(() => assertDeploymentBudget({ git: { deploymentEnabled: false } }, 'frontend'));
  assert.doesNotThrow(() => assertDeploymentBudget({ git: { deploymentEnabled: false } }, 'root', root));
});
