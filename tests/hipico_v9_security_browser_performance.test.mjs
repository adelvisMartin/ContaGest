import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), 'utf8');

test('v9 security gate includes provider/document/agent/replay boundaries already owned by test:hipico', async () => {
  const [workflow, agentSecurity, providerProbe, documentPolicy, productionE2E] = await Promise.all([
    read('.github/workflows/hipico-production-gates-v290.yml'),
    read('backend/src/modules/hipico/agent-route-security.test.ts'),
    read('backend/src/modules/hipico/provider-live-probe.test.ts'),
    read('backend/src/modules/hipico/document-policy.test.ts'),
    read('backend/src/modules/hipico-bot/production-e2e-v290.ts')
  ]);

  assert.match(workflow, /security-regression:/);
  assert.match(workflow, /npm run test:hipico/);
  assert.match(agentSecurity, /operator token|OPERATOR/i);
  assert.match(agentSecurity, /owner|group/i);
  assert.match(providerProbe, /rejects missing or malformed stage ids/);
  assert.match(providerProbe, /never serializes upstream error messages or secrets/);
  assert.match(documentPolicy, /financialAuthority|review|operator/i);
  assert.match(productionE2E, /duplicate/);
  assert.match(productionE2E, /group/i);
});

test('Hípico browser release matrix includes 360/390/430, keyboard focus, reduced motion and semantic WCAG smoke', async () => {
  const [config, catalog, spec, css] = await Promise.all([
    read('playwright.hipico-matrix.config.mjs'),
    read('qa/support/hipico-visual-catalog-v105.mjs'),
    read('qa/hipico-visual-functional-v105.spec.mjs'),
    read('frontend/public/hipico-control/assets/css/app.css')
  ]);

  for (const browser of ['chromium', 'firefox', 'webkit']) assert.ok(config.includes(`name: '${browser}'`));
  for (const width of ['width: 360', 'width: 390', 'width: 430']) assert.ok(catalog.includes(width), `missing viewport ${width}`);
  for (const marker of [
    'keyboard focus remains visible and operable',
    'reduced motion collapses transitions and smooth scrolling',
    'semantic accessibility smoke has language, live region and named controls'
  ]) assert.ok(spec.includes(marker), `missing Hípico accessibility check: ${marker}`);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /:focus-visible/);
});

test('v9 performance evidence preserves deterministic 100/500/2000 workload and separates physical acceptance', async () => {
  const load = await read('backend/scripts/hipico-load-profile-v290.ts');
  assert.match(load, /\[100, 500, 2000\]/);
  assert.match(load, /memorySnapshot\(\)/);
  assert.match(load, /EXPLAIN \(ANALYZE,BUFFERS,FORMAT JSON\)/);
  assert.match(load, /acceptance:\s*'NOT_EXECUTED'/);
  assert.match(load, /Intel Core i5 6th generation \/ 16 GB RAM/);
});

test('PWA release contract keeps static shell versioned, purges old shell cache and never caches runtime authority metadata', async () => {
  const [sw, build] = await Promise.all([
    read('frontend/public/hipico-control/sw.js'),
    read('frontend/public/hipico-control/build-info.json')
  ]);
  assert.match(sw, /CACHE_VERSION/);
  assert.match(sw, /keys\.filter\(\(key\) => key\.startsWith\('hipico-control-'\) && key !== SHELL_CACHE\)/);
  assert.match(sw, /runtime-config\.js/);
  assert.match(sw, /build-info\.json/);
  assert.match(sw, /cache:\s*'no-store'/);
  const info = JSON.parse(build);
  assert.equal(info.product, 'control-hipico');
  assert.equal(typeof info.compatibility.workspaceSchema, 'number');
});
