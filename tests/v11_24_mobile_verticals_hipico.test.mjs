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
const hipicoApp=read('frontend/public/hipico-control/assets/js/app-shell.js');
const hipicoFinalization=read('frontend/public/hipico-control/assets/js/race-finalization.js');
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

test('universal CSS runtime owns the vertical mobile contract',()=>{
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

test('Control Hipico upgrades local model without deleting prior stores',()=>{
  assert.match(hipicoApp,/DB_VERSION=2/);
  for(const store of ['groups','races','operations','participants','outbox','snapshots','settings'])assert.match(hipicoApp,new RegExp(`'${store}'`));
  assert.match(hipicoApp,/idempotencyKey/);
  assert.match(hipicoApp,/parseWhatsAppChat/);
  assert.match(hipicoApp,/routeOperationalEvents/);
  assert.match(hipicoApp,/La liquidación sigue requiriendo revisión/);
});

test('reviewed race finalization snapshots before releasing next race and never auto-mutates balances',()=>{
  assert.match(hipicoFinalization,/before_reviewed_finalization/);
  assert.match(hipicoFinalization,/operator_reviewed_no_auto_balance_mutation/);
  assert.match(hipicoFinalization,/objectStore\('snapshots'\)\.put/);
  assert.match(hipicoFinalization,/action:'settle_reviewed'/);
});

test('PWA 1.3.1 caches the offline operational shell but keeps sensitive routes network-only',()=>{
  assert.match(hipicoSw,/VERSION='1\.3\.1'/);
  assert.match(hipicoSw,/race-finalization\.js/);
  assert.match(hipicoSw,/offline-icons\.css/);
  assert.match(hipicoSw,/api\|auth\|session\|license\|webhook/);
  assert.match(hipicoSw,/if\(isSensitive\(url\)\)\{event\.respondWith\(fetch\(request,\{cache:'no-store'\}\)\)/);
});

test('WhatsApp bot suggestions are shadow-only and prohibit monetary auto-apply',()=>{
  assert.match(bridge,/body\.shadowMode && body\.channelRole === 'source'/);
  assert.match(bridge,/monetary_auto_apply: false/);
  assert.match(bridge,/automationMode: body\.shadowMode \? 'shadow' : 'manual_guarded'/);
  assert.match(bridge,/no modificar saldos automáticamente/i);
});
