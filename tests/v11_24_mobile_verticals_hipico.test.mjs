import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const routeService=read('frontend/src/services/urlStateService.js');
const logo=read('frontend/assets/img/contagest-mark.svg');
const runtime=read('frontend/src/styles/erp-runtime.css');
const mobileCss=read('frontend/src/styles/vertical-mobile-contract.css');
const gym=read('frontend/src/pages/GymManagementPage.js');
const hipicoHtml=read('frontend/public/hipico-control/index.html');
const hipicoStore=read('frontend/public/hipico-control/assets/js/store-v2.js');
const hipicoStateMachine=read('frontend/public/hipico-control/assets/js/race-state-machine.js');
const hipicoSw=read('frontend/public/hipico-control/sw.js');
const bridge=read('frontend/api/hipico/group-bridge-ingest.js');

test('mobile sidebar routes child modules during capture phase and keeps drawer context',()=>{
  assert.match(routeService,/document\.addEventListener\('click',[\s\S]*fromSidebar[\s\S]*event\.stopPropagation\(\)[\s\S]*UrlStateService\.navigate\(route,[\s\S]*\}, true\);/);
  assert.match(routeService,/target\.closest\('#mainMenu'\)/);
});

test('canonical mobile mark contains the ContaGest C and accounting bars',()=>{
  assert.match(logo,/viewBox="0 0 280 280"/);
  assert.match(logo,/A67 67 0 1 0/);
  assert.ok((logo.match(/<rect /g)||[]).length>=4);
});

test('universal CSS runtime owns the ERP vertical mobile contract',()=>{
  assert.match(runtime,/vertical-mobile-contract\.css/);
  assert.match(mobileCss,/body\[data-route="veterinaria"\] \.MuiDialogContent-root/);
  assert.match(mobileCss,/\.cg-gym-v1124-tabs/);
  assert.match(mobileCss,/#mainMenu \.hf-menu-section > summary/);
  assert.match(mobileCss,/min-height:44px/);
});

test('fitness exposes clients trainers assessments routines nutrition and classes from one module',()=>{
  for(const word of ['Clientes','Instructores','Evaluaciones','Rutinas','Nutrición','Clases'])assert.match(gym,new RegExp(word));
  assert.match(gym,/id="gymMemberForm"/);
  assert.match(gym,/id="gymTrainerForm"/);
  assert.match(gym,/id="gymClassForm"/);
  assert.match(gym,/GymVerticalService\.createMember/);
  assert.match(gym,/GymVerticalService\.createTrainer/);
  assert.match(gym,/GymVerticalService\.createClass/);
  assert.match(gym,/No se puede programar todavía/);
});

test('Control Hipico PWA mirrors race-first operating flow instead of generic ERP shell',()=>{
  for(const route of ['resumen','captura','participantes','whatsapp','adelantadas','historial','cierres','polla','configuracion'])assert.match(hipicoHtml,new RegExp(`data-page="${route}"`));
  for(const step of ['Abrir carrera','Pegar / recibir chat','Revisar parejas','Cerrar y copiar plano','Aplicar llegada','Liquidar y saldos'])assert.match(hipicoHtml,new RegExp(step));
  assert.match(hipicoHtml,/Juega/);
  assert.match(hipicoHtml,/Consigue \/ da/);
  assert.match(hipicoHtml,/Teléfono WhatsApp/);
  assert.match(hipicoHtml,/Finalizar carrera revisada/);
});

test('Control Hipico current local model keeps IndexedDB migration, outbox idempotency and snapshots',()=>{
  assert.match(hipicoStore,/export const DB_VERSION = 2/);
  for(const store of ['workspaces','settings','outbox','snapshots','syncMeta'])assert.match(hipicoStore,new RegExp(`"${store}"`));
  assert.match(hipicoStore,/idempotencyKey/);
  assert.match(hipicoStore,/initializeStorage/);
  assert.match(hipicoStore,/createSnapshot/);
  assert.match(hipicoStore,/restoreSnapshot/);
  assert.match(hipicoStore,/HIPICO_STORAGE_QUOTA_EXCEEDED/);
});

test('race state machine requires ordered reviewed transitions and journals evidence without rewriting history',()=>{
  for(const state of ['OPEN','CLOSED','RESULT_RECEIVED','SETTLEMENT_READY','SETTLED','BALANCED','PUBLISHED','ARCHIVED'])assert.match(hipicoStateMachine,new RegExp(`${state}: '${state}'`));
  assert.match(hipicoStateMachine,/INVALID_TRANSITION/);
  assert.match(hipicoStateMachine,/EVENT_IDENTITY_REQUIRED/);
  assert.match(hipicoStateMachine,/EVIDENCE_ONLY_EVENTS/);
  assert.match(hipicoStateMachine,/they never mutate the authoritative status/);
});

test('PWA 1.13.0-rc2 caches only canonical offline shell and keeps sensitive routes network-only',()=>{
  assert.match(hipicoSw,/CACHE_VERSION = 'hipico-control-v1\.13\.0-rc2'/);
  assert.match(hipicoSw,/shell-r4-zero-legacy/);
  assert.match(hipicoSw,/assets\/css\/app\.css/);
  assert.match(hipicoSw,/race-state-machine\.js/);
  assert.match(hipicoSw,/password-recovery\.js/);
  assert.match(hipicoSw,/user-access\.js/);
  assert.match(hipicoSw,/help-center\.js/);
  assert.doesNotMatch(hipicoSw,/offline-icons\.css|styles\.css|ui-system\.css/);
  assert.match(hipicoSw,/api\|auth/);
  assert.match(hipicoSw,/cache:\s*'no-store'/);
});

test('WhatsApp bot suggestions are shadow-only and prohibit monetary auto-apply',()=>{
  assert.match(bridge,/body\.shadowMode && body\.channelRole === 'source'/);
  assert.match(bridge,/monetary_auto_apply: false/);
  assert.match(bridge,/automationMode: body\.shadowMode \? 'shadow' : 'manual_guarded'/);
  assert.match(bridge,/no modificar saldos automáticamente/i);
});
