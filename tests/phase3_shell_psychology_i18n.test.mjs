import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('phase3 shell removes redundant desktop header copy and BCV duplication', async () => {
  const layout = await read('frontend/src/components/layout.js');
  assert.match(layout, /hf-rate-compact/);
  assert.doesNotMatch(layout, /hf-rate-source/);
  assert.doesNotMatch(layout, /<strong>ContaGest-VE<\/strong>/);
  assert.doesNotMatch(layout, /CloseSvg/);
  assert.match(layout, /hf-sidebar-collapse/);
  assert.match(layout, /cg-whatsapp-\$\{escapeHtml\(supportWidget\)\}/);
});

test('phase3 global language catalog includes Portuguese and psychology route fallback', async () => {
  const locales = await read('frontend/src/i18n/locales.js');
  const fallbacks = await read('frontend/src/i18n/fallbacks.js');
  const i18n = await read('frontend/src/i18n/useTranslate.js');
  assert.match(locales, /pt-BR/);
  assert.match(locales, /Português/);
  assert.match(fallbacks, /psicologia:'Psicologia e agenda'/);
  assert.match(i18n, /routeFallbackTranslations/);
});

test('solo clinic and veterinary roles do not expose HR by default', async () => {
  const access = await read('frontend/src/services/accessControlService.js');
  const catalog = await read('frontend/src/data/moduleCatalog.js');
  const clinic = access.match(/id:'role-clinica'[\s\S]*?modules:\[([^\]]+)\]/)?.[1] || '';
  const vet = access.match(/id:'role-veterinaria'[\s\S]*?modules:\[([^\]]+)\]/)?.[1] || '';
  assert.ok(clinic && vet);
  assert.doesNotMatch(clinic, /nomina|rrhh/);
  assert.doesNotMatch(vet, /nomina|rrhh/);
  assert.match(catalog, /route:'nomina'[\s\S]*?modes:\['contador','gimnasio','admin'\]/);
  assert.match(catalog, /route:'psicologia'/);
});

test('psychology planner uses the real health API contract and user-driven confirmation channels', async () => {
  const page = await read('frontend/src/pages/PsychologyPracticePage.js');
  const reminder = await read('frontend/src/services/appointmentReminderService.js');
  assert.match(page, /HealthVerticalService\.createPatient\(\{kind:'human'/);
  assert.match(page, /startsAt,/);
  assert.match(page, /endsAt,/);
  assert.match(page, /type:'psychology'/);
  assert.match(page, /channel:data\.modality==='Videollamada'\?'telemedicine':'onsite'/);
  assert.match(page, /psychPatientForm/);
  assert.match(page, /psychAppointmentForm/);
  assert.match(reminder, /calendar\.google\.com\/calendar\/render/);
  assert.match(reminder, /mailto:/);
  assert.match(reminder, /https:\/\/wa\.me\//);
  assert.doesNotMatch(reminder, /API_KEY|CLIENT_SECRET|ACCESS_TOKEN|REFRESH_TOKEN|service_role/i);
});

test('backend RBAC exposes the vertical permissions required by health, gym and communications routes', async () => {
  const rbac = await read('backend/src/modules/rbac/rbac.routes.ts');
  for (const permission of ['health.manage','gym.manage','communications.manage']) assert.match(rbac, new RegExp(permission.replace('.', '\\.')));
  assert.match(rbac, /name: 'Psicología \/ Consultorio'/);
  assert.match(rbac, /name: 'Clínica \/ Consultorio'/);
  assert.match(rbac, /name: 'Clínica veterinaria'/);
  assert.match(rbac, /sin RRHH por defecto/);
});

test('settings only store non-secret appointment integration identifiers', async () => {
  const settings = await read('frontend/src/pages/SettingsPage.js');
  const defaults = await read('frontend/src/data/defaults.js');
  assert.match(settings, /googleCalendarId/);
  assert.match(settings, /appointmentReminderHours/);
  assert.match(settings, /supportWidget/);
  assert.match(defaults, /supportWidget: 'peek'/);
  assert.doesNotMatch(settings, /name="[^"]*(token|secret|privateKey|apiKey)[^"]*"/i);
});

test('official theme persistence is binary while legacy palettes remain migration metadata', async () => {
  const store = await read('frontend/src/state/store.js');
  const catalog = await read('frontend/src/data/themeCatalog.js');
  assert.match(store, /OFFICIAL_THEMES = new Set\(\['light','dark'\]\)/);
  assert.match(store, /normalizePersistedTheme/);
  assert.match(store, /return OFFICIAL_THEMES\.has\(value\) \? value : 'light'/);
  assert.match(catalog, /LEGACY_THEME_PRESETS/);
  assert.match(catalog, /enterprise/);
});

test('phase3 contextual layer owns desktop sidebar-main geometry and non-clipping KPI contract', async () => {
  const css = await read('frontend/src/styles/vertical-contexts.css');
  assert.match(css, /width:calc\(100vw - var\(--cg-sidebar\)\)!important/);
  assert.match(css, /margin-left:var\(--cg-sidebar\)!important/);
  assert.match(css, /grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,180px\),1fr\)\)!important/);
  assert.match(css, /max-height:calc\(100dvh - var\(--cg-header\) - 16px\)!important/);
});
