import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const json = async (path) => JSON.parse(await read(path));

test('Control Hípico release version is identical across policy, PWA, Android package and Android lock metadata', async () => {
  const [policy, buildInfo, androidPackage, androidLock, config, index, sw] = await Promise.all([
    json('products/hipico-control/release-policy.json'),
    json('frontend/public/hipico-control/build-info.json'),
    json('android/hipico-control-v1130/package.json'),
    json('android/hipico-control-v1130/package-lock.json'),
    read('frontend/public/hipico-control/assets/js/config.js'),
    read('frontend/public/hipico-control/index.html'),
    read('frontend/public/hipico-control/sw.js')
  ]);

  const appVersion = config.match(/APP_VERSION\s*=\s*["']([^"']+)["']/)?.[1];
  const htmlVersion = index.match(/name=["']application-version["'][^>]*content=["']([^"']+)["']/i)?.[1]
    || index.match(/content=["']([^"']+)["'][^>]*name=["']application-version["']/i)?.[1];
  const cacheVersion = sw.match(/CACHE_VERSION\s*=\s*["']hipico-control-v([^"']+)["']/)?.[1];

  assert.equal(policy.version, '1.13.0-rc3');
  assert.equal(buildInfo.version, policy.version);
  assert.equal(androidPackage.version, policy.version);
  assert.equal(androidLock.version, policy.version);
  assert.equal(androidLock.packages?.['']?.version, policy.version);
  assert.equal(appVersion, policy.version);
  assert.equal(htmlVersion, policy.version);
  assert.equal(cacheVersion, policy.version);
  assert.equal(policy.versionCode, 1130003);
});

test('offline shell caches the canonical CSS dependency graph and excludes retired patch layers', async () => {
  const sw = await read('frontend/public/hipico-control/sw.js');
  for (const required of ['./assets/css/app.css', './assets/css/_foundation.css']) assert.ok(sw.includes(required), `missing ${required}`);
  for (const retired of ['mobile-accessibility.css', 'operational-copy-center.css', 'operational-access-guard.css']) {
    assert.equal(sw.includes(retired), false, `${retired} must not remain in the offline shell`);
  }
});
