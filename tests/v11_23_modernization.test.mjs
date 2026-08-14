import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('frontend/src/app.js');
const runtimeCss = read('frontend/src/styles/erp-runtime.css');
const veterinary = read('frontend/src/pages/VeterinaryClinicPageV1123.jsx');
const hipicoIndex = read('frontend/public/hipico-control/index.html');
const hipicoCss = read('frontend/public/hipico-control/assets/css/precision-hipica.css');
const hipicoApp = read('frontend/public/hipico-control/assets/js/app-shell.js');
const hipicoManifest = read('frontend/public/hipico-control/manifest.webmanifest');
const hipicoSw = read('frontend/public/hipico-control/sw.js');

test('ContaGest uses one universal runtime CSS entrypoint', () => {
  const imports = [...app.matchAll(/import ['"]\.\/styles\/([^'"]+)['"]/g)].map((match) => match[1]);
  assert.deepEqual(imports, ['erp-runtime.css']);
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
  assert.doesNotMatch(hipicoIndex, /Triple Crown/i);
  assert.doesNotMatch(hipicoManifest, /Triple Crown/i);
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

test('Precision Hipica is mobile-first with semantic tokens and three themes', () => {
  for (const token of ['--ch-bg','--ch-surface','--ch-border','--ch-text','--ch-primary','--ch-accent','--ch-success','--ch-warning','--ch-danger','--ch-focus']) {
    assert.match(hipicoCss, new RegExp(token));
  }
  assert.match(hipicoCss, /html\[data-theme="dark"\]/);
  assert.match(hipicoCss, /prefers-color-scheme:dark/);
  assert.match(hipicoCss, /@media\(min-width:1024px\)/);
  assert.match(hipicoCss, /min-height:44px/);
});

test('Control Hipico local-first shell uses IndexedDB outbox and existing WhatsApp analyzers', () => {
  assert.match(hipicoApp, /indexedDB\.open/);
  assert.match(hipicoApp, /createObjectStore\('outbox'/);
  assert.match(hipicoApp, /idempotencyKey:id/);
  assert.match(hipicoApp, /parseWhatsAppChat/);
  assert.match(hipicoApp, /analyzeOperationalFeed/);
});

test('Control Hipico service worker is versioned and refuses sensitive caching', () => {
  assert.match(hipicoSw, /control-hipico-shell-v/);
  assert.match(hipicoSw, /control-hipico-runtime-v/);
  assert.match(hipicoSw, /api\|auth\|session\|license\|webhook/);
  assert.match(hipicoSw, /if\(isSensitive\(url\)\)\{event\.respondWith\(fetch\(request\)\)/);
});
