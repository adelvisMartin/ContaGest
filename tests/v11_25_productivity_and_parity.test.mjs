import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const app = read('frontend/src/app.js');
const pageRegistry = read('frontend/src/data/pageRegistry.js');
const urlState = read('frontend/src/services/urlStateService.js');
const admin = read('frontend/src/pages/AdminPanelPage.js');
const access = read('frontend/src/services/accessControlService.js');
const dentistry = read('frontend/src/pages/DentistryPracticePage.jsx');
const fitness = read('frontend/src/services/fitnessProductivityEnhancer.js');
const transfer = read('frontend/src/services/fitnessClientTransferService.js');
const routine = read('frontend/src/services/fitnessRoutineService.js');
const nutrition = read('frontend/src/services/fitnessNutritionService.js');
const sidebarCss = read('frontend/src/styles/sidebar-theme-contract.css');
const hipicoRecovery = read('frontend/public/hipico-control/assets/js/rc1-recovery.js');
const hipicoSw = read('frontend/public/hipico-control/sw.js');

test('mobile sidebar treats category summary as accordion and only route children navigate', () => {
  assert.match(urlState, /closest\('#mainMenu \.cg-area-toggle'\)/);
  assert.match(urlState, /details\.open = !details\.open/);
  assert.match(urlState, /rememberSidebarSections\(\)/);
  assert.match(urlState, /if \(fromSidebar && isMobileSidebar\(\)\) event\.stopPropagation\(\)/);
});

test('light theme has dedicated light sidebar contrast contract', () => {
  assert.match(sidebarCss, /background:#f8fbff !important/);
  assert.match(sidebarCss, /\.hf-menu-item\.active/);
  assert.match(sidebarCss, /background:#255fc2 !important/);
  assert.match(sidebarCss, /color:#fff !important/);
});

test('demo user form uses one native role selector and explicit bounded module picker', () => {
  assert.match(admin, /data-demo-role/);
  assert.match(admin, /data-demo-max-modules/);
  assert.match(admin, /name="demoModule"/);
  assert.match(admin, /data-demo-module-count/);
  assert.match(admin, /Selecciona hasta/);
  assert.match(access, /selectedModules/);
  assert.match(access, /modulesForUser/);
});

test('dentistry is a real React route with controlled odontogram workflow', () => {
  assert.match(pageRegistry, /odontologia:\s*\['\.\/pages\/DentistryPracticePage\.jsx',\s*'DentistryPracticePage'\]/);
  assert.match(access, /role-odontologia/);
  assert.match(dentistry, /Odontograma y tratamiento rápido/);
  assert.match(dentistry, /selectedTooth/);
  assert.match(dentistry, /setSelectedTooth/);
  assert.match(dentistry, /createEncounter/);
  assert.doesNotMatch(dentistry, /mountSubmit|components\/ui\/index\.js/);
});

test('fitness quick tools support guest routine, WhatsApp copy and Excel-compatible client transfer', () => {
  assert.match(fitness, /Usuario test \/ sin registrar/);
  assert.match(fitness, /data-fast-muscle/);
  assert.match(fitness, /Copiar para WhatsApp/);
  assert.match(fitness, /Descargar plantilla/);
  assert.match(fitness, /Importar lista/);
  assert.match(transfer, /text\/csv/);
  assert.match(routine, /whatsapp/);
});

test('nutrition assistant creates structured plan and blocks clinical-risk quick plans', () => {
  assert.match(fitness, /data-nut-risk/);
  assert.match(nutrition, /clinicalRisk/);
  assert.match(nutrition, /blocked/);
  assert.match(nutrition, /disclaimer/);
});

test('Control Hipico recovery restores RC1 speed tools and protects against stale shell', () => {
  assert.match(hipicoRecovery, /1\.13\.1-recovery/);
  assert.match(hipicoRecovery, /Captura rápida RC1/);
  assert.match(hipicoRecovery, /Mensajes rápidos/);
  assert.match(hipicoRecovery, /Restablecer interfaz PWA/);
  assert.match(hipicoSw, /control-hipico/);
});
