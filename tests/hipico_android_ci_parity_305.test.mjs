import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const workflow = fs.readFileSync(path.join(root, '.github/workflows/hipico-qa-foundation-v103.yml'), 'utf8');
const androidLock = JSON.parse(fs.readFileSync(path.join(root, 'android/hipico-control-v1130/package-lock.json'), 'utf8'));

test('Android parity CI generates the untracked www tree before check-only verification', () => {
  const marker = '- name: Verify PWA and wrapper parity';
  const start = workflow.indexOf(marker);
  assert.ok(start >= 0, 'Android parity step must exist');
  const next = workflow.indexOf('\n      - name:', start + marker.length);
  const step = workflow.slice(start, next > 0 ? next : workflow.length);
  const sync = step.indexOf('npm run sync:web');
  const verify = step.indexOf('npm run verify:web');
  assert.ok(sync >= 0, 'parity job must generate www because generated wrapper assets are not versioned');
  assert.ok(verify > sync, 'check-only verification must run after wrapper generation');
});

test('Android package lock keeps nested kleur tarball bound to the declared kleur version', () => {
  const kleur = androidLock.packages?.['node_modules/prompts/node_modules/kleur'];
  assert.ok(kleur, 'nested kleur package must remain present in the Android lockfile');
  assert.equal(
    kleur.resolved,
    `https://registry.npmjs.org/kleur/-/kleur-${kleur.version}.tgz`,
    'lockfile must never bind a kleur package entry to another package tarball'
  );
});


test('Android RC Java setup must not require Gradle files before Capacitor sync', () => {
  const androidRc = fs.readFileSync(path.join(root, '.github/workflows/hipico-android-rc.yml'), 'utf8');
  const jdkStart = androidRc.indexOf('- name: Set up JDK 21');
  const sdkStart = androidRc.indexOf('- name: Set up Android SDK', jdkStart);
  assert.ok(jdkStart >= 0 && sdkStart > jdkStart, 'Android RC must configure JDK before the Android SDK');
  const jdkStep = androidRc.slice(jdkStart, sdkStart);
  assert.doesNotMatch(
    jdkStep,
    /cache:\s*gradle/,
    'setup-java runs before Capacitor creates Gradle files, so Gradle caching here makes the workflow fail before the build'
  );
});
