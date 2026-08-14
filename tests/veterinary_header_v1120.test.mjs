import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('veterinary modal preserves drafts until explicit close', async () => {
  const source = await read('frontend/src/pages/VeterinaryClinicPage.jsx');
  assert.match(source, /reason==='backdropClick'\|\|reason==='escapeKeyDown'/);
  assert.match(source, /disableEscapeKeyDown/);
  assert.match(source, /aria-label="Cerrar"/);
  assert.match(source, /Los cambios solo se descartan con Cancelar o cerrar/);
});

test('veterinary dates use controlled ERP date parts instead of native browser calendars', async () => {
  const source = await read('frontend/src/pages/VeterinaryClinicPage.jsx');
  assert.match(source, /const DateParts=/);
  assert.match(source, /MONTHS = \['Enero'/);
  assert.doesNotMatch(source, /type="date"/);
  assert.doesNotMatch(source, /type="datetime-local"/);
});

test('veterinary selectors prioritize names and demote technical ids', async () => {
  const source = await read('frontend/src/pages/VeterinaryClinicPage.jsx');
  assert.match(source, /function EntityLabel/);
  assert.match(source, /SelectProps=\{\{renderValue:/);
  assert.match(source, /shortCode\(id\)/);
  assert.doesNotMatch(source, />\{item\.id\}<\/MenuItem>/);
});

test('pet and appointment records expose safe edit and removal workflows', async () => {
  const page = await read('frontend/src/pages/VeterinaryClinicPage.jsx');
  const service = await read('frontend/src/services/verticalService.js');
  const router = await read('backend/src/modules/verticals/veterinary-crud.routes.ts');
  assert.match(page, /editPatient/);
  assert.match(page, /archivePatient/);
  assert.match(page, /editAppointment/);
  assert.match(page, /removeAppointment/);
  assert.match(service, /updatePatient\(id, payload\)/);
  assert.match(service, /deleteAppointment\(id\)/);
  assert.match(router, /router\.patch\('\/health\/patients\/:id'/);
  assert.match(router, /router\.delete\('\/health\/patients\/:id'/);
  assert.match(router, /router\.patch\('\/health\/appointments\/:id'/);
  assert.match(router, /router\.delete\('\/health\/appointments\/:id'/);
  assert.match(router, /"active"=false/);
  assert.match(router, /CareCommunicationLog/);
  assert.match(router, /"status"='cancelled'/);
});

test('API retries same-origin when an obsolete custom production base is unreachable', async () => {
  const source = await read('frontend/src/services/backendApi.js');
  assert.match(source, /SAME_ORIGIN_API_BASE = '\/api\/v1'/);
  assert.match(source, /async function fetchApi/);
  assert.match(source, /localStorage\.removeItem\(API_BASE_KEY\)/);
  assert.match(source, /return fetch\(`\$\{fallback\}\$\{path\}`/);
});

test('header exposes compact BCV block, canonical logo and explicit user chevron', async () => {
  const layout = await read('frontend/src/components/layout.js');
  const css = await read('frontend/src/styles/erp-system.css');
  assert.match(layout, /hf-rate-copy/);
  assert.match(layout, /id="btnActualizarTasaTop" class="hf-rate-update"/);
  assert.match(layout, /id="btnUserMenu" class="hf-user-trigger"/);
  assert.match(layout, /hf-user-chevron/);
  assert.match(layout, /<img src="\$\{escapeHtml\(logoUrl\)\}" alt="Logo ContaGest-VE"/);
  assert.match(css, /\.hf-rate-compact/);
  assert.match(css, /\.hf-user-panel\.hidden/);
  assert.match(css, /#veterinaryClinicRoot \.MuiInputLabel-root/);
});
