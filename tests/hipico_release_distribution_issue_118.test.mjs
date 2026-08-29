import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(path.join(root, relative), 'utf8');
const json = (relative) => JSON.parse(read(relative));

function versionCodeFor(version) {
  const match = String(version).match(/^(\d+)\.(\d+)\.(\d+)(?:-rc(\d+))?$/i);
  assert.ok(match, `versión no soportada: ${version}`);
  const [, major, minor, patch, rc = '99'] = match;
  return Number(major) * 1_000_000 + Number(minor) * 10_000 + Number(patch) * 100 + Number(rc);
}

test('#118 canonical policy matches every committed runtime version declaration', () => {
  const policy = json('products/hipico-control/release-policy.json');
  const buildInfo = json('frontend/public/hipico-control/build-info.json');
  const androidPackage = json('android/hipico-control-v1130/package.json');
  const capacitor = json('android/hipico-control-v1130/capacitor.config.json');
  const config = read('frontend/public/hipico-control/assets/js/config.js');
  const index = read('frontend/public/hipico-control/index.html');
  const sw = read('frontend/public/hipico-control/sw.js');
  const workspace = read('frontend/public/hipico-control/assets/js/workspace.js');

  assert.equal(policy.version, buildInfo.version);
  assert.equal(policy.version, androidPackage.version);
  assert.equal(policy.channel, buildInfo.channel);
  assert.equal(policy.workspaceSchema, buildInfo.compatibility.workspaceSchema);
  assert.equal(policy.parserContract, buildInfo.compatibility.parserContract);
  assert.equal(policy.androidApplicationId, capacitor.appId);
  assert.equal(policy.versionCode, versionCodeFor(policy.version));
  assert.match(config, new RegExp(`APP_VERSION\\s*=\\s*["']${policy.version.replaceAll('.', '\\.')}["']`));
  assert.match(index, new RegExp(`application-version["'][^>]*content=["']${policy.version.replaceAll('.', '\\.')}`));
  assert.match(sw, new RegExp(`CACHE_VERSION\\s*=\\s*["']hipico-control-v${policy.version.replaceAll('.', '\\.')}`));
  assert.match(workspace, new RegExp(`schemaVersion\\s*=\\s*${policy.workspaceSchema}`));
});

test('#118 release gate executes deterministically and writes SHA-bound evidence', () => {
  const candidateSha = '1181181181181181181181181181181181181181';
  const outputDir = path.join(root, 'artifacts/qa/hipico-v118', candidateSha);
  rmSync(outputDir, { recursive: true, force: true });
  const stdout = execFileSync(process.execPath, ['scripts/hipico-release-v118.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, HIPICO_RELEASE_SHA: candidateSha, GITHUB_HEAD_REF: 'test/hipico-118' }
  });
  assert.match(stdout, /HIPICO_RELEASE_GATE PASS/);
  const manifest = JSON.parse(readFileSync(path.join(outputDir, 'release-manifest.json'), 'utf8'));
  assert.equal(manifest.candidateSha, candidateSha);
  assert.equal(manifest.status, 'PASS');
  assert.equal(manifest.pwa.state, 'PASS');
  assert.equal(manifest.android.artifact.state, 'NOT_EXECUTED');
  assert.equal(manifest.boundaries.installUpgradeDowngrade, 'REQUIRES_PHYSICAL_QA');
  assert.equal(manifest.android.releaseSigning, 'NOT_EXECUTED');
  assert.ok(manifest.pwa.files.length > 15);
  rmSync(outputDir, { recursive: true, force: true });
});

test('#118 Android build applies policy version metadata after Capacitor sync', () => {
  const wrapperPackage = json('android/hipico-control-v1130/package.json');
  const configure = read('android/hipico-control-v1130/scripts/configure-version.mjs');
  const packageApk = read('android/hipico-control-v1130/scripts/package-qa-apk.mjs');
  assert.match(wrapperPackage.scripts['cap:sync'], /cap sync android && npm run android:version/);
  assert.match(configure, /versionCode/);
  assert.match(configure, /versionName/);
  assert.match(packageApk, /candidateSha/);
  assert.match(packageApk, /parserContract/);
  assert.match(packageApk, /workspaceSchema/);
});

test('#118 signing and promotion policy fail closed by contract', () => {
  const policy = json('products/hipico-control/release-policy.json');
  const gate = read('scripts/hipico-release-v118.mjs');
  assert.equal(policy.signing.release, 'external-secret-only');
  assert.equal(policy.promotion.requiresP0Green, true);
  assert.equal(policy.promotion.requiresPhysicalQa, true);
  assert.equal(policy.promotion.requiresExplicitApproval, true);
  assert.match(gate, /RELEASE_BLOCKED/);
  assert.match(gate, /--require-apk/);
  assert.doesNotMatch(JSON.stringify(policy), /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|password|secretKey/i);
});
