import { parseWhatsAppChat } from './whatsapp.js';
import { analyzeOperationalFeed } from './operations.js';

const DB_NAME='control-hipico-db';
const DB_VERSION=1;
const THEME_KEY='control-hipico-theme';
const NAV=[
  ['resumen','Resumen','⌂'],['captura','Captura','＋'],['participantes','Participantes','♟'],['whatsapp','Chat WhatsApp','◌'],
  ['adelantadas','Adelantadas','↗'],['historial','Historial','≡'],['cierres','Cierres y saldos','∑'],['polla','POLLA','◎'],['configuracion','Configuración','⚙']
];
const BOTTOM=['resumen','captura','participantes','historial','configuracion'];
let current='resumen';
let deferredInstall=null;
let dbPromise=null;

const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const uid=(prefix='CH')=>`${prefix}-${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
const money=(value)=>new Intl.NumberFormat('es-VE',{style:'currency',currency:'VES',minimumFractionDigits:2}).format(Number(value||0));
const when=(value)=>new Intl.DateTimeFormat('es-VE',{dateStyle:'short',timeStyle:'short'}).format(new Date(value));
const escapeHtml=(value)=>String(value??'').replace(/[&<>'"]/g,(ch)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
function live(message){const node=$('[data-live]');if(node)node.textContent=message;}

function openDb(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains('operations')){const store=db.createObjectStore('operations',{keyPath:'id'});store.createIndex('createdAt','createdAt');store.createIndex('participant','participant');}
      if(!db.objectStoreNames.contains('participants')){const store=db.createObjectStore('participants',{keyPath:'id'});store.createIndex('code','code',{unique:true});}
      if(!db.objectStoreNames.contains('outbox')){const store=db.createObjectStore('outbox',{keyPath:'id'});store.createIndex('status','status');store.createIndex('createdAt','createdAt');}
      if(!db.objectStoreNames.contains('snapshots'))db.createObjectStore('snapshots',{keyPath:'id'});
      if(!db.objectStoreNames.contains('settings'))db.createObjectStore('settings',{keyPath:'key'});
    };
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  return dbPromise;
}
async function storeTx(name,mode,work){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(name,mode);const store=tx.objectStore(name);let result;try{result=work(store);}catch(error){reject(error);return;}tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
async function put(name,value){return storeTx(name,'readwrite',(store)=>store.put(value));}
async function getAll(name){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(name,'readonly');const request=tx.objectStore(name).getAll();request.onsuccess=()=>resolve(request.result||[]);request.onerror=()=>reject(request.error);});}

function renderNav(){
  const markup=NAV.map(([route,label,icon])=>`<button type="button" data-route="${route}" class="${route===current?'is-active':''}"><span aria-hidden="true">${icon}</span> ${escapeHtml(label)}</button>`).join('');
  $$('[data-nav-full],[data-nav-drawer]').forEach((node)=>node.innerHTML=markup);
  const bottom=$('[data-bottom-nav]');if(bottom)bottom.innerHTML=BOTTOM.map((route)=>{const item=NAV.find(([id])=>id===route);return `<button type="button" class="ch-nav-btn ${route===current?'is-active':''}" data-route="${route}"><span aria-hidden="true">${item[2]}</span><span>${escapeHtml(item[1])}</span></button>`;}).join('');
}
function navigate(route){if(!NAV.some(([id])=>id===route))return;current=route;$$('[data-page]').forEach((node)=>node.classList.toggle('is-active',node.dataset.page===route));renderNav();closeDrawer();history.replaceState(null,'',`#${route}`);window.scrollTo({top:0,behavior:'smooth'});live(`Módulo ${NAV.find(([id])=>id===route)?.[1]||route}`);if(route==='historial')renderHistory();if(route==='resumen'||route==='cierres')refreshDashboard();}
function openDrawer(){const drawer=$('[data-drawer]');drawer?.classList.add('is-open');drawer?.setAttribute('aria-hidden','false');}
function closeDrawer(){const drawer=$('[data-drawer]');drawer?.classList.remove('is-open');drawer?.setAttribute('aria-hidden','true');}

function theme(){return localStorage.getItem(THEME_KEY)||'system';}
function applyTheme(value){const next=['system','light','dark'].includes(value)?value:'system';document.documentElement.dataset.theme=next;localStorage.setItem(THEME_KEY,next);const select=$('[data-theme-select]');if(select)select.value=next;}
function cycleTheme(){const values=['system','light','dark'];const index=values.indexOf(theme());applyTheme(values[(index+1)%values.length]);live(`Tema ${document.documentElement.dataset.theme}`);}

function updateConnectivity(){const online=navigator.onLine;const banner=$('[data-offline-banner]');banner?.classList.toggle('is-visible',!online);const sync=$('[data-sync-state]');if(sync)sync.dataset.state=online?'online':'offline';const label=$('[data-sync-label]');if(label)label.textContent=online?'Local listo':'Offline';refreshDashboard();}
async function refreshDashboard(){
  const [ops,participants,outbox]=await Promise.all([getAll('operations'),getAll('participants'),getAll('outbox')]);
  const pending=outbox.filter((item)=>item.status==='pending').length;
  const balance=participants.reduce((sum,item)=>sum+Number(item.balance||0),0);
  $('[data-metric-ops]')?.replaceChildren(String(ops.length));$('[data-metric-outbox]')?.replaceChildren(String(pending));$('[data-metric-participants]')?.replaceChildren(String(participants.length));$('[data-metric-balance]')?.replaceChildren(money(balance));$('[data-close-balance]')?.replaceChildren(money(balance));
  const sync=$('[data-sync-state]');if(sync&&navigator.onLine&&pending)sync.dataset.state='pending';const label=$('[data-sync-label]');if(label&&navigator.onLine)label.textContent=pending?`${pending} pendiente${pending===1?'':'s'}`:'Local listo';
  const recent=$('[data-recent-list]');if(recent){const items=ops.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,6);recent.innerHTML=items.length?items.map(renderOperation).join(''):'<div class="ch-empty">Aún no hay operaciones locales.</div>';}
  renderParticipants(participants);
}
function renderOperation(item){return `<article class="ch-item"><div class="ch-item-head"><span><strong>${escapeHtml(item.participant)}</strong><small>${escapeHtml(item.track)} · C${escapeHtml(item.race)} · ${escapeHtml(item.play)} · ${escapeHtml(item.horse)}</small></span><span class="ch-money">${money(item.amount)}</span></div><small>${when(item.createdAt)} · ${escapeHtml(item.id)}</small></article>`;}
function renderParticipants(items){const node=$('[data-participant-list]');if(!node)return;node.innerHTML=items.length?items.sort((a,b)=>a.name.localeCompare(b.name)).map((item)=>`<article class="ch-item"><div class="ch-item-head"><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.code)}</small></span><span class="ch-money">${money(item.balance)}</span></div></article>`).join(''):'<div class="ch-empty">Sin participantes registrados.</div>';}
async function renderHistory(){const node=$('[data-history-list]');if(!node)return;const term=String($('[data-history-search]')?.value||'').trim().toLowerCase();const ops=(await getAll('operations')).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).filter((item)=>!term||JSON.stringify(item).toLowerCase().includes(term));node.innerHTML=ops.length?ops.map(renderOperation).join(''):'<div class="ch-empty">No hay resultados para la búsqueda.</div>';}

async function capture(form){
  const data=Object.fromEntries(new FormData(form));
  const amount=Number(data.amount);const race=Number(data.race);
  if(!data.participant?.trim()||!data.track?.trim()||!data.play?.trim()||!data.horse?.trim()||!Number.isFinite(amount)||amount<=0||!Number.isInteger(race)||race<1){live('Revisa los campos de captura.');return;}
  const id=uid('OP');const createdAt=new Date().toISOString();const operation={id,createdAt,participant:data.participant.trim(),track:data.track.trim(),race,play:data.play.trim(),horse:data.horse.trim(),amount,notes:String(data.notes||'').trim(),syncState:'local'};
  const outbox={id:`OUT-${id}`,entity:'operation',entityId:id,action:'upsert',payload:operation,status:'pending',attempts:0,createdAt,updatedAt:createdAt,idempotencyKey:id};
  await Promise.all([put('operations',operation),put('outbox',outbox)]);form.reset();live('Operación guardada localmente y añadida al outbox.');await refreshDashboard();navigate('resumen');
}
async function saveParticipant(form){const data=Object.fromEntries(new FormData(form));if(!data.name?.trim()||!data.code?.trim())return;const participant={id:uid('PART'),name:data.name.trim(),code:data.code.trim(),balance:Number(data.balance||0),createdAt:new Date().toISOString(),active:true};try{await put('participants',participant);form.reset();live('Participante guardado.');await refreshDashboard();}catch{live('No se pudo guardar. Verifica que el identificador sea único.');}}

async function analyzeWhatsApp(){
  const input=$('[data-whatsapp-input]');const output=$('[data-whatsapp-result]');if(!input||!output)return;const source=input.value.trim();if(!source){output.innerHTML='<div class="ch-empty">Pega una exportación para analizar.</div>';return;}
  try{const analysis=parseWhatsAppChat(source);const operational=analyzeOperationalFeed(analysis);output.innerHTML=`<div class="ch-grid"><div class="ch-status-line"><span><strong>Mensajes</strong><small>Analizados localmente</small></span><span class="ch-badge">${analysis.messages?.length||0}</span></div><div class="ch-status-line"><span><strong>Ofertas</strong><small>Luego de deduplicación</small></span><span class="ch-badge">${analysis.offers?.filter?.((item)=>!item.duplicate)?.length||0}</span></div><div class="ch-status-line"><span><strong>Revisión manual</strong><small>No automatizar sin confirmación</small></span><span class="ch-badge" data-tone="warning">${operational?.stats?.needsReview||0}</span></div><div class="ch-status-line"><span><strong>Estado</strong><small>Motor operacional existente</small></span><span class="ch-badge" data-tone="success">${escapeHtml(operational?.raceState||'RECEPCIÓN')}</span></div></div>`;live('Análisis WhatsApp completado localmente.');}catch(error){output.innerHTML=`<div class="ch-empty">No se pudo analizar: ${escapeHtml(error.message)}</div>`;}
}

async function snapshot(){const [operations,participants,outbox]=await Promise.all([getAll('operations'),getAll('participants'),getAll('outbox')]);const record={id:uid('SNAP'),createdAt:new Date().toISOString(),operations,participants,outbox};await put('snapshots',record);const node=$('[data-snapshot-status]');if(node)node.textContent=`Snapshot ${record.id} creado ${when(record.createdAt)}.`;live('Snapshot local creado.');}
async function exportBackup(){const payload={product:'CONTROL HÍPICO',schemaVersion:1,exportedAt:new Date().toISOString(),operations:await getAll('operations'),participants:await getAll('participants'),outbox:await getAll('outbox'),snapshots:await getAll('snapshots')};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`control-hipico-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

function commandItems(){return [...NAV.map(([route,label])=>({label:`Ir a ${label}`,route})),{label:'Nueva captura',route:'captura'},{label:'Analizar WhatsApp',route:'whatsapp'},{label:'Crear cierre / snapshot',route:'cierres'},{label:'Cambiar tema',action:'theme'}];}
function openCommand(){const layer=$('[data-command]');const input=$('[data-command-input]');layer?.classList.add('is-open');layer?.setAttribute('aria-hidden','false');renderCommand('');setTimeout(()=>input?.focus(),0);}
function closeCommand(){const layer=$('[data-command]');layer?.classList.remove('is-open');layer?.setAttribute('aria-hidden','true');}
function renderCommand(term){const normalized=term.toLowerCase();const items=commandItems().filter((item)=>!normalized||item.label.toLowerCase().includes(normalized));const root=$('[data-command-results]');if(root)root.innerHTML=items.map((item,index)=>`<button type="button" data-command-index="${index}" data-command-route="${item.route||''}" data-command-action="${item.action||''}">${escapeHtml(item.label)}</button>`).join('')||'<div class="ch-empty">Sin resultados.</div>';}

function bind(){
  document.addEventListener('click',(event)=>{const route=event.target.closest?.('[data-route]')?.dataset.route;if(route){event.preventDefault();navigate(route);}if(event.target.closest?.('[data-menu]'))openDrawer();if(event.target.closest?.('[data-drawer-close]'))closeDrawer();if(event.target.closest?.('[data-theme-toggle]'))cycleTheme();if(event.target.closest?.('[data-command-open]'))openCommand();const command=event.target.closest?.('[data-command-route],[data-command-action]');if(command){if(command.dataset.commandAction==='theme')cycleTheme();if(command.dataset.commandRoute)navigate(command.dataset.commandRoute);closeCommand();}});
  $('[data-capture-form]')?.addEventListener('submit',(event)=>{event.preventDefault();capture(event.currentTarget).catch(console.error);});
  $('[data-participant-form]')?.addEventListener('submit',(event)=>{event.preventDefault();saveParticipant(event.currentTarget).catch(console.error);});
  $('[data-history-search]')?.addEventListener('input',()=>renderHistory().catch(console.error));
  $('[data-whatsapp-analyze]')?.addEventListener('click',()=>analyzeWhatsApp());
  $('[data-whatsapp-clear]')?.addEventListener('click',()=>{const input=$('[data-whatsapp-input]');if(input)input.value='';const output=$('[data-whatsapp-result]');if(output)output.innerHTML='<div class="ch-empty">El análisis se ejecuta localmente y no envía mensajes.</div>';});
  $('[data-snapshot]')?.addEventListener('click',()=>snapshot().catch(console.error));
  $('[data-export]')?.addEventListener('click',()=>exportBackup().catch(console.error));
  $('[data-theme-select]')?.addEventListener('change',(event)=>applyTheme(event.target.value));
  $('[data-command-input]')?.addEventListener('input',(event)=>renderCommand(event.target.value));
  $('[data-command]')?.addEventListener('click',(event)=>{if(event.target===event.currentTarget)closeCommand();});
  $('[data-install]')?.addEventListener('click',async()=>{if(!deferredInstall){live('La instalación se ofrecerá cuando el navegador la habilite.');return;}deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;});
  window.addEventListener('beforeinstallprompt',(event)=>{event.preventDefault();deferredInstall=event;});
  window.addEventListener('online',updateConnectivity);window.addEventListener('offline',updateConnectivity);
  window.addEventListener('keydown',(event)=>{const writing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();openCommand();}else if(event.key==='Escape'){closeCommand();closeDrawer();}else if(!writing&&event.key.toLowerCase()==='n'){event.preventDefault();navigate('captura');}else if(!writing&&event.key==='/'){event.preventDefault();openCommand();}});
}

async function boot(){
  await openDb();applyTheme(theme());bind();renderNav();const hash=location.hash.replace('#','');if(NAV.some(([id])=>id===hash))current=hash;navigate(current);updateConnectivity();await refreshDashboard();
  if('serviceWorker' in navigator){try{const registration=await navigator.serviceWorker.register('/hipico-control/sw.js',{scope:'/hipico-control/'});registration.addEventListener('updatefound',()=>live('Hay una actualización de Control Hípico disponible.'));}catch(error){console.warn('[Control Hípico PWA]',error);}}
}
boot().catch((error)=>{console.error('[Control Hípico]',error);live('No se pudo iniciar el almacenamiento local.');});
