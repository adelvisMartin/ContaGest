import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('frontend/src/app.js');
const authService = read('frontend/src/services/authService.js');
const loginEnhancer = read('frontend/src/services/loginEnhancer.js');
const legalEnhancer = read('frontend/src/services/legalAcceptanceEnhancer.js');
const runtimeCss = read('frontend/src/styles/erp-runtime.css');
const veterinary = read('frontend/src/pages/VeterinaryClinicPageV1123.jsx');
const hipicoIndex = read('frontend/public/hipico-control/index.html');
const hipicoCss = read('frontend/public/hipico-control/assets/css/app.css');
const hipicoStore = read('frontend/public/hipico-control/assets/js/store-v2.js');
const hipicoManifest = read('frontend/public/hipico-control/manifest.webmanifest');
const hipicoSw = read('frontend/public/hipico-control/sw.js');
const forbiddenLegacyBrand = ['Triple','Crown'].join(' ');

test('ContaGest uses one universal runtime CSS entrypoint', () => {
  const imports = [...app.matchAll(/import ['"]\.\/styles\/([^'"]+)['"]/g)].map((match) => match[1]);
  assert.deepEqual(imports, ['erp-runtime.css']);
  for (const moduleSource of [authService, loginEnhancer, legalEnhancer]) {
    assert.doesNotMatch(moduleSource, /import ['"]\.\.\/styles\//);
  }
  assert.match(runtimeCss, /shell-contract\.css.*layer\(cg\.shell-contract\)/s);
  assert.match(runtimeCss, /vertical-contexts\.css.*layer\(cg\.context\)/s);
  assert.match(runtimeCss, /erp-system\.css/);
});

test('Veterinary v11.23 exposes master detail, edit and clinical chronology', () => {
  assert.match(app, /VeterinaryClinicPageV1123\.jsx/);
  assert.match(veterinary, /Ficha e historia médica por mascota/);
  assert.match(veterinary, /Editar ficha/);
  assert.match(veterinary, /HealthVerticalService\.updatePatient/);
  for (const service of ['encounters','prescriptions','labOrders','studies','hospitalizations','procedures']) {
    assert.match(veterinary, new RegExp(service));
  }
});

test('Control Hipico has only its own visible product identity', () => {
  assert.match(hipicoIndex, /CONTROL HÍPICO/);
  assert.equal(hipicoIndex.toLowerCase().includes(forbiddenLegacyBrand.toLowerCase()), false);
  assert.equal(hipicoManifest.toLowerCase().includes(forbiddenLegacyBrand.toLowerCase()), false);
  const manifest = JSON.parse(hipicoManifest);
  assert.equal(manifest.name, 'Control Hípico');
  assert.equal(manifest.scope, '/hipico-control/');
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
});

test('Control Hipico preserves the documented operational modules', () => {
  for (const route of ['resumen','captura','participantes','whatsapp','adelantadas','historial','cierres','polla','configuracion']) {
    assert.match(hipicoIndex, new RegExp(`data-page=["']${route}["']`));
  }
});

test('Control Hipico canonical UI is mobile-first with semantic tokens and light/dark/system themes', () => {
  for (const token of ['--hc-bg','--hc-surface','--hc-border','--hc-text','--hc-brand','--hc-success','--hc-warning','--hc-danger','--hc-focus','--hc-touch']) {
    assert.match(hipicoCss, new RegExp(token));
  }
  assert.match(hipicoCss, /:root\[data-theme="dark"\]/);
  assert.match(hipicoCss, /prefers-color-scheme:\s*dark/);
  assert.match(hipicoCss, /@media \(max-width:\s*780px\)/);
  assert.match(hipicoCss, /--hc-touch:\s*44px/);
});

test('Control Hipico local-first storage uses IndexedDB outbox, snapshots and idempotency', () => {
  assert.match(hipicoStore, /indexedDB\.open/);
  assert.match(hipicoStore, /createObjectStore\("outbox"/);
  assert.match(hipicoStore, /idempotencyKey/);
  assert.match(hipicoStore, /initializeStorage/);
  assert.match(hipicoStore, /createSnapshot/);
  assert.match(hipicoStore, /HIPICO_STORAGE_QUOTA_EXCEEDED/);
});

test('Control Hipico service worker is versioned and refuses sensitive caching', () => {
  assert.match(hipicoSw, /CACHE_VERSION = 'hipico-control-v1\.13\.0-rc2'/);
  assert.match(hipicoSw, /shell-r4-zero-legacy/);
  assert.match(hipicoSw, /isSensitive\(url\) \|\| isRuntimeMetadata\(url\)/);
  assert.match(hipicoSw, /cache:\s*'no-store'/);
  assert.doesNotMatch(hipicoSw, /precision-hipica\.css|styles\.css|ui-system\.css|offline-icons\.css/);
});
