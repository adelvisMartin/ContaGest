import { parseWhatsAppChat } from './whatsapp.js';
import { analyzeOperationalFeed, operationLabel } from './operations.js';
import { routeOperationalEvents } from './agent-router.js';

const DB_NAME='control-hipico-db';
const DB_VERSION=2;
const THEME_KEY='control-hipico-theme';
const ACTIVE_GROUP_KEY='activeGroupId';
const NAV=[
  ['resumen','Resumen','fa-house'],['captura','Captura','fa-plus'],['participantes','Participantes','fa-users'],['whatsapp','Chat WhatsApp','fa-comments'],
  ['adelantadas','Adelantadas','fa-forward'],['historial','Historial','fa-clock-rotate-left'],['cierres','Cierres y saldos','fa-flag-checkered'],['polla','POLLA','fa-ticket'],['configuracion','Configuración','fa-gear']
];
const BOTTOM=['resumen','captura','whatsapp','participantes','cierres'];
let current='resumen';
let deferredInstall=null;
let dbPromise=null;
let activeGroup=null;
let activeRace=null;

const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const uid=(prefix='CH')=>`${prefix}-${Date.now().toString(36).toUpperCase()}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase()}`;
const escapeHtml=(value)=>String(value??'').replace(/[&<>'"]/g,(ch)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const when=(value)=>value?new Intl.DateTimeFormat('es-VE',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)):'—';
const normalizeCode=(value)=>String(value||'').trim().toUpperCase().replace(/\s+/g,'-').slice(0,32);
const boardValues=(value)=>String(value||'').split(/[.\s,\-]+/).map((item)=>item.trim()).filter(Boolean).slice(0,6);
function live(message){const node=$('[data-live]');if(node)node.textContent=message;}
function money(value,currency=activeGroup?.currency||'VES'){
  const number=Number(value||0);
  if(currency==='USD')return new Intl.NumberFormat('es-VE',{style:'currency',currency:'USD',minimumFractionDigits:2}).format(number);
  return `Bs. ${new Intl.NumberFormat('es-VE',{minimumFractionDigits:2,maximumFractionDigits:2}).format(number)}`;
}

function openDb(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains('groups'))db.createObjectStore('groups',{keyPath:'id'});
      if(!db.objectStoreNames.contains('races')){const store=db.createObjectStore('races',{keyPath:'id'});store.createIndex('createdAt','createdAt');}
      if(!db.objectStoreNames.contains('operations')){const store=db.createObjectStore('operations',{keyPath:'id'});store.createIndex('createdAt','createdAt');store.createIndex('participant','participant');}
      if(!db.objectStoreNames.contains('participants')){const store=db.createObjectStore('participants',{keyPath:'id'});store.createIndex('code','code');}
      if(!db.objectStoreNames.contains('outbox')){const store=db.createObjectStore('outbox',{keyPath:'id'});store.createIndex('status','status');store.createIndex('createdAt','createdAt');}
      if(!db.objectStoreNames.contains('snapshots'))db.createObjectStore('snapshots',{keyPath:'id'});
      if(!db.objectStoreNames.contains('settings'))db.createObjectStore('settings',{keyPath:'key'});
    };
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  return dbPromise;
}
async function getAll(name){const db=await openDb();return new Promise((resolve,reject)=>{const request=db.transaction(name,'readonly').objectStore(name).getAll();request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>reject(request.error);});}
async function getOne(name,key){const db=await openDb();return new Promise((resolve,reject)=>{const request=db.transaction(name,'readonly').objectStore(name).get(key);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);});}
async function put(name,value){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(name,'readwrite');tx.objectStore(name).put(value);tx.oncomplete=()=>resolve(value);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
async function putMany(name,values=[]){for(const value of values)if(value?.id||value?.key)await put(name,value);}
async function queueOutbox(entity,entityId,action,payload){const now=new Date().toISOString();return put('outbox',{id:uid('OUT'),entity,entityId,action,payload,status:'pending',attempts:0,createdAt:now,updatedAt:now,idempotencyKey:`${entity}:${entityId}:${action}:${now}`});}
async function setting(key,fallback=''){return (await getOne('settings',key))?.value??fallback;}
async function setSetting(key,value){return put('settings',{key,value,updatedAt:new Date().toISOString()});}

async function ensureGroup(){
  const groups=await getAll('groups');
  const preferred=await setting(ACTIVE_GROUP_KEY,'');
  activeGroup=groups.find((item)=>item.id===preferred)||groups[0]||null;
  if(!activeGroup){activeGroup={id:uid('GRP'),name:'Grupo local',currency:'VES',commission:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await put('groups',activeGroup);}
  await setSetting(ACTIVE_GROUP_KEY,activeGroup.id);
  return activeGroup;
}
const belongs=(record)=>!record?.groupId||record.groupId===activeGroup?.id;
async function refreshRace(){
  const races=(await getAll('races')).filter(belongs).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  activeRace=races.find((race)=>!['settled','cancelled'].includes(race.status))||null;
  return activeRace;
}
function raceState(){return !activeRace?'PREPARACIÓN':activeRace.status==='open'?'RECEPCIÓN':activeRace.status==='closed'?'CARRERA CERRADA':activeRace.status==='result'?'RESULTADO RECIBIDO':activeRace.status==='settled'?'LIQUIDADA':String(activeRace.status||'PREPARACIÓN').toUpperCase();}

function renderNav(){
  const markup=NAV.map(([route,label,icon])=>`<button type="button" data-route="${route}" class="${route===current?'is-active':''}"><i class="fa-solid ${icon}" aria-hidden="true"></i><span>${escapeHtml(label)}</span></button>`).join('');
  $$('[data-nav-full],[data-nav-drawer]').forEach((node)=>node.innerHTML=markup);
  const bottom=$('[data-bottom-nav]');if(bottom)bottom.innerHTML=BOTTOM.map((route)=>{const item=NAV.find(([id])=>id===route);return `<button type="button" class="ch-nav-button ${route===current?'is-active':''}" data-route="${route}"><i class="fa-solid ${item[2]}" aria-hidden="true"></i><span>${escapeHtml(item[1])}</span></button>`;}).join('');
}
function navigate(route){
  if(!NAV.some(([id])=>id===route))return;
  current=route;$$('[data-page]').forEach((node)=>node.classList.toggle('is-active',node.dataset.page===route));renderNav();closeDrawer();history.replaceState(null,'',`#${route}`);window.scrollTo({top:0,behavior:'smooth'});live(`Módulo ${NAV.find(([id])=>id===route)?.[1]||route}`);
  if(route==='historial')renderHistory();if(route==='adelantadas')renderAdvanced();if(['resumen','captura','cierres','participantes','configuracion'].includes(route))refreshUi();if(route==='whatsapp')refreshBridgeStatus();
}
function openDrawer(){const node=$('[data-drawer]');node?.classList.add('is-open');node?.setAttribute('aria-hidden','false');}
function closeDrawer(){const node=$('[data-drawer]');node?.classList.remove('is-open');node?.setAttribute('aria-hidden','true');}

function theme(){return localStorage.getItem(THEME_KEY)||'system';}
function applyTheme(value){const next=['system','light','dark'].includes(value)?value:'system';document.documentElement.dataset.theme=next;localStorage.setItem(THEME_KEY,next);const select=$('[data-theme-select]');if(select)select.value=next;}
function updateConnectivity(){const online=navigator.onLine;$('[data-offline-banner]')?.classList.toggle('is-visible',!online);const sync=$('[data-sync-state]');if(sync)sync.dataset.state=online?'online':'offline';refreshUi();}

function updateContext(){
  const groupName=activeGroup?.name||'Grupo local';
  $$('[data-context-group],[data-header-group],[data-drawer-group],[data-sidebar-group]').forEach((node)=>node.textContent=groupName);
  const raceLabel=activeRace?`${activeRace.track} · C${activeRace.number}`:'Sin carrera abierta';
  $$('[data-context-race]').forEach((node)=>node.textContent=raceLabel);
  $$('[data-race-state],[data-race-state-card]').forEach((node)=>node.textContent=raceState());
  const capture=$('[data-capture-race]');if(capture)capture.value=raceLabel;
  const groupInput=$('[data-group-name]');if(groupInput&&!groupInput.matches(':focus'))groupInput.value=groupName;
  const groupForm=$('[data-group-form]');if(groupForm){if(groupForm.currency)groupForm.currency.value=activeGroup?.currency||'VES';if(groupForm.commission)groupForm.commission.value=Number(activeGroup?.commission||0);}
}
function renderRaceCard(){
  const node=$('[data-race-card]');if(!node)return;
  if(!activeRace){node.className='ch-race-card-empty';node.innerHTML='No hay una carrera abierta. Crea una para comenzar la recepción.';return;}
  node.className='ch-race-card';node.innerHTML=`<strong>${escapeHtml(activeRace.track)} · Carrera ${escapeHtml(activeRace.number)}</strong><span>Abierta ${when(activeRace.openedAt||activeRace.createdAt)} · Estado ${escapeHtml(raceState())}${activeRace.board?.length?` · Llegada ${escapeHtml(activeRace.board.join('.'))}`:''}</span>`;
  const closeMessage=$('[data-close-message]');if(closeMessage)closeMessage.textContent=activeRace.status==='open'?`Recepción abierta para ${activeRace.track} C${activeRace.number}.`:activeRace.closeMessage||`CERRADO · ${activeRace.track} · Carrera ${activeRace.number}`;
  const result=$('[data-result-status]');if(result)result.textContent=activeRace.board?.length?`Llegada registrada: ${activeRace.board.join('.')}`:'Sin llegada cargada.';
}
function renderFlow(){
  const state=raceState();const done=new Set();let currentStep='open';
  if(activeRace){done.add('open');currentStep='chat';}
  if(activeRace&&(activeRace.operationsCount||0)>0){done.add('chat');currentStep='review';}
  if(activeRace?.status==='closed'){done.add('review');done.add('close');currentStep='result';}
  if(activeRace?.status==='result'){done.add('review');done.add('close');done.add('result');currentStep='settle';}
  if(activeRace?.status==='settled'){['open','chat','review','close','result','settle'].forEach((x)=>done.add(x));currentStep='';}
  $$('[data-flow]').forEach((node)=>{node.classList.toggle('is-done',done.has(node.dataset.flow));node.classList.toggle('is-current',node.dataset.flow===currentStep);});
}
function renderOperation(item){
  const side=item.side==='consigue'?'Consigue / da':'Juega';
  return `<article class="ch-item"><div class="ch-item-head"><span><strong>${escapeHtml(item.participant||item.participantCode||'Participante')}</strong><small>${escapeHtml(side)} ${escapeHtml(item.play||'')} (${escapeHtml(item.horse||'')}) · ${escapeHtml(item.track||'')} C${escapeHtml(item.race||'')}</small></span><strong class="ch-money">${money(item.amount,item.currency)}</strong></div><div class="ch-item-meta"><span class="ch-badge" data-tone="${item.timing==='advanced'?'warning':'info'}">${item.timing==='advanced'?'Adelantada':'Actual'}</span><small>${when(item.createdAt)}</small></div></article>`;
}
function renderParticipant(item){return `<article class="ch-item"><div class="ch-item-head"><span><strong>${escapeHtml(item.code)} · ${escapeHtml(item.name)}</strong><small>${escapeHtml(item.phone||'Sin teléfono')} · aval ${money(item.aval||0,item.currency)}</small></span><strong class="ch-money">${money(item.balance||0,item.currency)}</strong></div></article>`;}
async function refreshUi(){
  await ensureGroup();await refreshRace();
  const [operationsAll,participantsAll,outbox]=await Promise.all([getAll('operations'),getAll('participants'),getAll('outbox')]);
  const operations=operationsAll.filter(belongs).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const participants=participantsAll.filter(belongs).sort((a,b)=>String(a.code||a.name).localeCompare(String(b.code||b.name)));
  if(activeRace){const count=operations.filter((item)=>item.raceId===activeRace.id&&item.timing!=='advanced').length;if(count!==activeRace.operationsCount){activeRace={...activeRace,operationsCount:count};await put('races',activeRace);}}
  const pending=outbox.filter((item)=>item.status==='pending').length;
  const balance=participants.reduce((sum,item)=>sum+Number(item.balance||0),0);
  $('[data-metric-ops]')?.replaceChildren(String(operations.filter((item)=>!activeRace||item.raceId===activeRace.id).length));
  $('[data-metric-outbox]')?.replaceChildren(String(pending));$('[data-metric-participants]')?.replaceChildren(String(participants.length));$('[data-metric-balance]')?.replaceChildren(money(balance));$('[data-close-balance]')?.replaceChildren(money(balance));
  const sync=$('[data-sync-state]');if(sync)sync.dataset.state=!navigator.onLine?'offline':pending?'pending':'online';const label=$('[data-sync-label]');if(label)label.textContent=!navigator.onLine?'Offline':pending?`${pending} pend.`:'Local';
  const recent=$('[data-recent-list]');if(recent)recent.innerHTML=operations.length?operations.slice(0,6).map(renderOperation).join(''):'<div class="ch-empty">Todavía no hay movimientos locales.</div>';
  const currentOps=$('[data-current-ops]');if(currentOps){const items=operations.filter((item)=>activeRace&&item.raceId===activeRace.id&&item.timing!=='advanced');currentOps.innerHTML=items.length?items.map(renderOperation).join(''):'<div class="ch-empty">Sin jugadas registradas.</div>';}
  const participantList=$('[data-participant-list]');if(participantList)participantList.innerHTML=participants.length?participants.map(renderParticipant).join(''):'<div class="ch-empty">Sin participantes registrados.</div>';
  $$('[data-participant-select]').forEach((select)=>{const value=select.value;select.innerHTML='<option value="">Seleccionar participante</option>'+participants.map((item)=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.code)} · ${escapeHtml(item.name)}</option>`).join('');if(participants.some((x)=>x.id===value))select.value=value;});
  updateContext();renderRaceCard();renderFlow();if(current==='adelantadas')renderAdvanced();if(current==='historial')renderHistory();
}

async function openRace(form){
  const data=Object.fromEntries(new FormData(form));const track=String(data.track||'').trim();const number=Number(data.number);
  if(!track||!Number.isInteger(number)||number<1)return live('Completa hipódromo y número de carrera.');
  if(activeRace&&!['settled','cancelled'].includes(activeRace.status))return live('Cierra o completa la carrera actual antes de abrir otra.');
  const now=new Date().toISOString();activeRace={id:uid('RACE'),groupId:activeGroup.id,track,number,status:'open',board:[],operationsCount:0,openedAt:now,createdAt:now,updatedAt:now};await put('races',activeRace);await queueOutbox('race',activeRace.id,'open',activeRace);form.reset();live(`Carrera ${number} abierta.`);await refreshUi();
}
async function closeRace(){
  if(!activeRace)return live('Primero abre una carrera.');if(activeRace.status!=='open')return live('La recepción ya está cerrada.');
  const closeMessage=`CERRADO · NO MÁS JUGADAS · ${activeRace.track} · Carrera ${activeRace.number}. Cada tercio responde por su disponible.`;
  activeRace={...activeRace,status:'closed',closedAt:new Date().toISOString(),closeMessage,updatedAt:new Date().toISOString()};await put('races',activeRace);await queueOutbox('race',activeRace.id,'close',activeRace);live('Recepción cerrada. Revisa el plano antes de aplicar la llegada.');await refreshUi();
}
async function applyResult(form){
  if(!activeRace)return live('Primero abre una carrera.');if(activeRace.status==='open')return live('Cierra la recepción antes de aplicar la llegada.');const data=Object.fromEntries(new FormData(form));const board=boardValues(data.board);if(board.length<2)return live('Ingresa una llegada válida, por ejemplo 2.1.6.4.');
  activeRace={...activeRace,status:'result',board,resultAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await put('races',activeRace);await queueOutbox('race',activeRace.id,'result',{board});form.reset();live(`Llegada ${board.join('.')} registrada. La liquidación sigue requiriendo revisión.`);await refreshUi();
}
async function capture(form){
  if(!activeRace)return live('Abre una carrera antes de capturar jugadas.');
  const data=Object.fromEntries(new FormData(form));if(data.timing!=='advanced'&&activeRace.status!=='open')return live('La recepción está cerrada. Usa Adelantada para una operación futura o abre otra carrera después del cierre.');
  const participants=(await getAll('participants')).filter(belongs);const participant=participants.find((item)=>item.id===data.participantId);const amountValue=Number(data.amount);if(!participant||!String(data.play||'').trim()||!String(data.horse||'').trim()||!Number.isFinite(amountValue)||amountValue<=0)return live('Revisa participante, jugada, caballo y monto.');
  const now=new Date().toISOString();const operation={id:uid('OP'),groupId:activeGroup.id,raceId:activeRace.id,track:activeRace.track,race:activeRace.number,side:data.side==='consigue'?'consigue':'juega',participantId:participant.id,participant:participant.name,participantCode:participant.code,play:String(data.play).trim().toUpperCase().replace(/Y/gi,'/'),horse:String(data.horse).trim().toUpperCase(),amount:amountValue,currency:activeGroup.currency,timing:data.timing==='advanced'?'advanced':'current',notes:String(data.notes||'').trim(),status:'pending_review',createdAt:now,updatedAt:now};
  await put('operations',operation);await queueOutbox('operation',operation.id,'upsert',operation);form.reset();live('Jugada guardada localmente. Revisa la contraparte antes de confirmar o liquidar.');await refreshUi();
}
async function saveParticipant(form){
  const data=Object.fromEntries(new FormData(form));const code=normalizeCode(data.code),name=String(data.name||'').trim();if(!code||!name)return live('Código y nombre son obligatorios.');const existing=(await getAll('participants')).filter(belongs).find((item)=>normalizeCode(item.code)===code);if(existing)return live(`Ya existe un participante con código ${code}.`);
  const record={id:uid('PART'),groupId:activeGroup.id,code,name,phone:String(data.phone||'').trim(),balance:Number(data.balance||0),aval:Number(data.aval||0),currency:activeGroup.currency,status:'active',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};await put('participants',record);await queueOutbox('participant',record.id,'upsert',record);form.reset();live('Participante guardado.');await refreshUi();
}
async function saveGroup(form){const data=Object.fromEntries(new FormData(form));const name=String(data.name||'').trim();if(!name)return live('Indica el nombre del grupo.');activeGroup={...activeGroup,name,currency:data.currency==='USD'?'USD':'VES',commission:Number(data.commission||0),updatedAt:new Date().toISOString()};await put('groups',activeGroup);await queueOutbox('group',activeGroup.id,'upsert',activeGroup);live('Configuración del grupo guardada.');await refreshUi();}

async function renderHistory(){const node=$('[data-history-list]');if(!node)return;const term=String($('[data-history-search]')?.value||'').trim().toLowerCase();const items=(await getAll('operations')).filter(belongs).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).filter((item)=>!term||JSON.stringify(item).toLowerCase().includes(term));node.innerHTML=items.length?items.map(renderOperation).join(''):'<div class="ch-empty">No hay resultados.</div>';}
async function renderAdvanced(){const node=$('[data-advanced-list]');if(!node)return;const items=(await getAll('operations')).filter((item)=>belongs(item)&&item.timing==='advanced').sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));node.innerHTML=items.length?items.map(renderOperation).join(''):'<div class="ch-empty">No hay jugadas adelantadas.</div>';}

async function analyzeWhatsApp(){
  const input=$('[data-whatsapp-input]'),output=$('[data-whatsapp-result]');if(!input||!output)return;const source=input.value.trim();if(!source){output.innerHTML='<div class="ch-empty">Pega un bloque de WhatsApp para analizar.</div>';return;}
  try{
    const analysis=parseWhatsAppChat(source,{racetrackCatalog:activeRace?.track?[activeRace.track]:[]});const operational=analyzeOperationalFeed(analysis);const routed=routeOperationalEvents(operational?.events||[]);const activeOffers=(analysis.offers||[]).filter((item)=>!item.duplicate).length;const matches=analysis.matches?.length||0;const review=operational?.stats?.needsReview||0;
    output.innerHTML=`<div class="ch-analysis"><div class="ch-analysis-stats"><article><small>Mensajes</small><strong>${analysis.messages?.length||0}</strong></article><article><small>Ofertas</small><strong>${activeOffers}</strong></article><article><small>Parejas</small><strong>${matches}</strong></article><article><small>Revisión</small><strong>${review}</strong></article></div><div class="ch-agent-list">${routed.slice(-12).reverse().map((event)=>`<article class="ch-agent-row"><div><strong>${escapeHtml(operationLabel(event.type))}</strong><span class="ch-badge" data-tone="${event.routing?.reviewRequired?'warning':'success'}">${event.routing?.reviewRequired?'REVISAR':'CLASIFICADO'}</span></div><small>${escapeHtml(event.routing?.specialist?.label||'Agente semántico')} · ${escapeHtml(event.sender||'Sin remitente')} · ${escapeHtml(event.status||'')}</small></article>`).join('')||'<div class="ch-empty">No se detectaron eventos operativos.</div>'}</div><p class="ch-help">Estado detectado: <strong>${escapeHtml(operational?.raceState||'RECEPCIÓN')}</strong>. Ninguna coincidencia monetaria se confirma automáticamente desde esta pantalla.</p></div>`;
    live('Chat analizado. Revisa las coincidencias antes de importar o liquidar.');
  }catch(error){output.innerHTML=`<div class="ch-empty">No se pudo analizar: ${escapeHtml(error.message)}</div>`;}
}
async function refreshBridgeStatus(){
  const status=$('[data-cloud-status]'),badge=$('[data-bridge-state]');if(status)status.textContent='Comprobando…';
  try{const response=await fetch('/api/hipico/status',{headers:{accept:'application/json'}});if(!response.ok)throw new Error(`HTTP ${response.status}`);const data=await response.json();if(status)status.textContent=data.cloudConnectorConfigured?'Cloud connector listo':'Local/manual listo';if(badge)badge.textContent=data.cloudConnectorConfigured?'CLOUD / SHADOW':'MANUAL';}
  catch{if(status)status.textContent='Sin conexión cloud';if(badge)badge.textContent='MANUAL';}
}

async function snapshot(){const [groups,races,operations,participants,outbox]=await Promise.all([getAll('groups'),getAll('races'),getAll('operations'),getAll('participants'),getAll('outbox')]);const record={id:uid('SNAP'),schemaVersion:2,groupId:activeGroup.id,raceId:activeRace?.id||null,createdAt:new Date().toISOString(),groups,races,operations,participants,outbox};await put('snapshots',record);const node=$('[data-snapshot-status]');if(node)node.textContent=`Snapshot ${record.id} · ${when(record.createdAt)}`;live('Snapshot local creado.');}
async function exportBackup(){const payload={product:'CONTROL HÍPICO',schemaVersion:2,exportedAt:new Date().toISOString(),groups:await getAll('groups'),races:await getAll('races'),participants:await getAll('participants'),operations:await getAll('operations'),outbox:await getAll('outbox'),snapshots:await getAll('snapshots'),settings:await getAll('settings')};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`control-hipico-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);live('Respaldo JSON generado.');}
async function importBackup(file){
  const text=await file.text();const payload=JSON.parse(text);if(payload?.product!=='CONTROL HÍPICO'||!Number(payload.schemaVersion))throw new Error('El archivo no es un respaldo compatible de Control Hípico.');
  for(const [store,key] of [['groups','groups'],['races','races'],['participants','participants'],['operations','operations'],['outbox','outbox'],['snapshots','snapshots'],['settings','settings']])await putMany(store,Array.isArray(payload[key])?payload[key]:[]);
  await ensureGroup();await refreshRace();await refreshUi();live('Respaldo importado. Revisa grupo, participantes y carrera antes de continuar.');
}

function commandItems(){return [...NAV.map(([route,label])=>({label:`Ir a ${label}`,route})),{label:'Abrir nueva captura',route:'captura'},{label:'Analizar WhatsApp',route:'whatsapp'},{label:'Cerrar / cargar llegada',route:'cierres'},{label:'Registrar participante',route:'participantes'}];}
function openCommand(){const layer=$('[data-command]'),input=$('[data-command-input]');layer?.classList.add('is-open');layer?.setAttribute('aria-hidden','false');renderCommand('');setTimeout(()=>input?.focus(),0);}
function closeCommand(){const layer=$('[data-command]');layer?.classList.remove('is-open');layer?.setAttribute('aria-hidden','true');}
function renderCommand(term){const normalized=String(term||'').toLowerCase();const items=commandItems().filter((item)=>!normalized||item.label.toLowerCase().includes(normalized));const root=$('[data-command-results]');if(root)root.innerHTML=items.map((item)=>`<button type="button" data-command-route="${item.route}">${escapeHtml(item.label)}</button>`).join('')||'<div class="ch-empty">Sin resultados.</div>';}

function bind(){
  document.addEventListener('click',(event)=>{
    const route=event.target.closest?.('[data-route]')?.dataset.route;if(route){event.preventDefault();navigate(route);}
    if(event.target.closest?.('[data-menu]'))openDrawer();if(event.target.closest?.('[data-drawer-close]'))closeDrawer();if(event.target.closest?.('[data-command-open]'))openCommand();if(event.target.closest?.('[data-group-quick]'))navigate('configuracion');
    const command=event.target.closest?.('[data-command-route]');if(command){navigate(command.dataset.commandRoute);closeCommand();}
  });
  $('[data-race-form]')?.addEventListener('submit',(event)=>{event.preventDefault();openRace(event.currentTarget).catch((error)=>live(error.message));});
  $$('[data-close-race]').forEach((button)=>button.addEventListener('click',()=>closeRace().catch((error)=>live(error.message))));
  $('[data-result-form]')?.addEventListener('submit',(event)=>{event.preventDefault();applyResult(event.currentTarget).catch((error)=>live(error.message));});
  $('[data-capture-form]')?.addEventListener('submit',(event)=>{event.preventDefault();capture(event.currentTarget).catch((error)=>live(error.message));});
  $('[data-participant-form]')?.addEventListener('submit',(event)=>{event.preventDefault();saveParticipant(event.currentTarget).catch((error)=>live(error.message));});
  $('[data-group-form]')?.addEventListener('submit',(event)=>{event.preventDefault();saveGroup(event.currentTarget).catch((error)=>live(error.message));});
  $('[data-history-search]')?.addEventListener('input',()=>renderHistory().catch(console.error));
  $('[data-whatsapp-analyze]')?.addEventListener('click',()=>analyzeWhatsApp());
  $('[data-whatsapp-clear]')?.addEventListener('click',()=>{const input=$('[data-whatsapp-input]');if(input)input.value='';const output=$('[data-whatsapp-result]');if(output)output.innerHTML='<div class="ch-empty">Analiza un bloque para ver eventos, parejas, duplicados y revisiones.</div>';});
  $('[data-bridge-refresh]')?.addEventListener('click',()=>refreshBridgeStatus());
  $('[data-copy-close]')?.addEventListener('click',async()=>{const text=activeRace?.closeMessage||'';if(!text)return live('No hay mensaje de cierre disponible.');try{await navigator.clipboard.writeText(text);live('Cierre copiado.');}catch{live('No se pudo acceder al portapapeles.');}});
  $('[data-snapshot]')?.addEventListener('click',()=>snapshot().catch((error)=>live(error.message)));
  $('[data-export]')?.addEventListener('click',()=>exportBackup().catch((error)=>live(error.message)));
  $('[data-import-trigger]')?.addEventListener('click',()=>document.querySelector('[data-import]')?.click());
  $('[data-import]')?.addEventListener('change',(event)=>{const file=event.target.files?.[0];if(file)importBackup(file).catch((error)=>live(error.message));event.target.value='';});
  $('[data-theme-select]')?.addEventListener('change',(event)=>applyTheme(event.target.value));
  $('[data-command-input]')?.addEventListener('input',(event)=>renderCommand(event.target.value));
  $('[data-command]')?.addEventListener('click',(event)=>{if(event.target===event.currentTarget)closeCommand();});
  $('[data-install]')?.addEventListener('click',async()=>{if(!deferredInstall){live('La instalación se ofrecerá cuando el navegador la habilite.');return;}deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;});
  window.addEventListener('beforeinstallprompt',(event)=>{event.preventDefault();deferredInstall=event;});window.addEventListener('online',updateConnectivity);window.addEventListener('offline',updateConnectivity);
  window.addEventListener('keydown',(event)=>{const writing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();openCommand();}else if(event.key==='Escape'){closeCommand();closeDrawer();}else if(!writing&&event.key.toLowerCase()==='n'){event.preventDefault();navigate('captura');}});
  navigator.serviceWorker?.addEventListener?.('message',(event)=>{if(event.data?.type==='CONTROL_HIPICO_UPDATED')live(`Control Hípico actualizado a ${event.data.version}.`);});
}

async function boot(){
  await openDb();await ensureGroup();await refreshRace();applyTheme(theme());bind();const hash=location.hash.replace('#','');if(NAV.some(([id])=>id===hash))current=hash;renderNav();navigate(current);updateConnectivity();await refreshUi();
  if('serviceWorker' in navigator){try{await navigator.serviceWorker.register('/hipico-control/sw.js',{scope:'/hipico-control/'});}catch(error){console.warn('[Control Hípico PWA]',error);}}
}
boot().catch((error)=>{console.error('[Control Hípico]',error);live('No se pudo iniciar la base local.');});
