import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('phase4 loads legacy vertical CSS once below the canonical component layer', async () => {
  const erp = await read('frontend/src/styles/erp-system.css');
  const service = await read('frontend/src/services/verticalService.js');
  const shim = await read('frontend/src/styles/verticals.css');
  assert.match(erp, /legacy\/verticals\.css.*cg\.legacy\.verticals/);
  assert.doesNotMatch(service, /styles\/verticals\.css/);
  assert.match(shim, /compatibility shim/i);
});

test('phase4 canonical forms prevent floating labels and collapse compact grids on phones', async () => {
  const erp = await read('frontend/src/styles/erp-system.css');
  assert.match(erp, /\.cgx-field[\s\S]*position: static !important/);
  assert.match(erp, /\.cgx-label[\s\S]*position: static !important/);
  assert.match(erp, /\.cg-form-grid-2/);
  assert.match(erp, /@media \(max-width: 560px\)/);
  assert.match(erp, /grid-template-columns: minmax\(0, 1fr\) !important/);
});

test('phase4 mobile shell keeps real product mark, drawer above backdrop and settings within viewport', async () => {
  const css = await read('frontend/src/styles/vertical-contexts.css');
  const mark = await read('frontend/assets/img/contagest-mark.svg');
  assert.match(css, /contagest-mark\.svg/);
  assert.match(css, /\.hf-app-sidebar\.hf-sidebar \{[^}]*z-index:820!important/);
  assert.match(css, /#sidebarBackdrop \{z-index:800!important/);
  assert.match(css, /\.hf-user-panel \{[^}]*position:fixed!important/);
  assert.match(css, /@media \(max-width:760px\)[\s\S]*\.hf-header-brand \{display:grid!important/);
  assert.match(mark, /viewBox="0 0 56 56"/);
});

test('phase4 WhatsApp support target stays clickable and on-screen', async () => {
  const css = await read('frontend/src/styles/vertical-contexts.css');
  const layout = await read('frontend/src/components/layout.js');
  assert.match(css, /\.cg-whatsapp-float \{[^}]*pointer-events:auto!important/);
  assert.match(css, /\.cg-whatsapp-float\.cg-whatsapp-peek \{right:max\(4px,var\(--cg-safe-right\)\)!important/);
  assert.match(layout, /href="https:\/\/wa\.me\/\?text=/);
});

test('phase4 RIF and status badge use one non-wrapping pair instead of overlapping', async () => {
  const page = await read('frontend/src/pages/ClientsPage.js');
  const erp = await read('frontend/src/styles/erp-system.css');
  assert.match(page, /cg-inline-pair/);
  assert.match(page, /Pendiente de sincronización/);
  assert.match(erp, /\.cg-inline-pair \{[^}]*flex-wrap: nowrap/);
});

test('phase4 psychology planner uses responsive form grids and operational follow-up signals', async () => {
  const page = await read('frontend/src/pages/PsychologyPracticePage.js');
  assert.match(page, /cg-form-grid-2/);
  assert.match(page, /Seguimiento del consultorio/);
  assert.match(page, /confirmationRate/);
  assert.match(page, /No asistió/);
});

test('phase4 gym includes coach and retention signals while retaining core operational forms', async () => {
  const page = await read('frontend/src/pages/GymManagementPage.js');
  assert.match(page, /Coaching y retención/);
  assert.match(page, /Renovaciones próximas/);
  assert.match(page, /Clases ≥ 80%/);
  for (const id of ['gymMemberForm','gymAssessmentForm','gymRoutineForm','gymNutritionForm','gymClassForm','gymCheckInForm']) assert.match(page, new RegExp(id));
});

test('phase4 theme and capability manifests are machine readable and include new palettes/vertical gates', async () => {
  const themes = await read('frontend/src/data/themeCatalog.js');
  const uiManifest = JSON.parse(await read('docs/manifests/contagest-ui-v11.19.json'));
  const verticalManifest = JSON.parse(await read('docs/manifests/vertical-capabilities-v1.json'));
  for (const theme of ['ocean','forest','celestial']) assert.match(themes, new RegExp(`key:'${theme}'`));
  assert.equal(uiManifest.uiVersion, '11.19');
  assert.equal(uiManifest.constraints.labelsMayOverlapControlBorder, false);
  assert.equal(verticalManifest.verticals.psychology.sensitiveLocalStorage, false);
  assert.equal(verticalManifest.verticals.veterinary.aiRequiresProfessionalReview, true);
  assert.equal(verticalManifest.verticals.dentistry.fakeClinicalAiAllowed, false);
});
