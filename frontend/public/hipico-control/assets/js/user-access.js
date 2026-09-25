import { CLOUD_CONFIG } from './config.js';
import { currentSession, fetchCloudAccess, signOut } from './supabase.js';
import { clearLocalAdminEnrollment } from './local-auth.js';
import { escapeHtml, toast, ui } from './ui.js';

const ROLE_LABELS={admin:'Administrador',operator:'Operador',viewer:'Solo lectura',auditor:'Auditor'};
const STATUS_LABELS={active:'Activo',suspended:'Suspendido',disabled:'Deshabilitado'};
const CREDENTIAL_LABELS={password_set:'Configurada',recovery_required:'Requiere cambio',unknown:'Sin verificar'};
const READ_ONLY_ROLES=new Set(['viewer','auditor']);
const SAFE_ACTIONS=new Set([
  'logout','confirm-logout','close-modal','show-tips','close-calendar','calendar-prev','calendar-next','calendar-today','select-date',
  'copy-metrics','copy-plan','copy-closure','copy-balances','copy-risk','copy-bet','copy-backup-json','export-json','retry-export-json',
  'sync-now','select-group','open-date-picker'
]);

let access=null;
let accessUserId='';
let accessPromise=null;
let users=[];
let usersLoadedAt=0;
let blocked=false;

function authHeaders(){
  const session=currentSession();
  if(!session?.access_token) throw new Error('La sesión de nube no está activa.');
  return {apikey:CLOUD_CONFIG.publishableKey,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'};
}
function publicAuthHeaders(){return {apikey:CLOUD_CONFIG.publishableKey,'Content-Type':'application/json'};}

async function rpc(name,body={}){
  const response=await fetch(`${CLOUD_CONFIG.supabaseUrl}/rest/v1/rpc/${name}`,{method:'POST',headers:authHeaders(),cache:'no-store',body:JSON.stringify(body)});
  const text=await response.text();
  let data=null;
  try{data=text?JSON.parse(text):null;}catch{data=text;}
  if(!response.ok){
    const error=new Error(String(data?.message||data?.msg||data?.error||`Error ${response.status}`));
    error.status=response.status; error.code=data?.code||''; throw error;
  }
  return data;
}

export async function fetchMyAccess(){
  return fetchCloudAccess();
}
export async function listManagedUsers(){
  const rows=await rpc('hipico_admin_list_users');
  return Array.isArray(rows)?rows:[];
}
export async function grantUserByEmail(email,displayName,role='operator'){
  return rpc('hipico_admin_grant_user_by_email',{p_email:String(email||'').trim(),p_display_name:String(displayName||'').trim()||null,p_role:role});
}
export async function setUserAccess(userId,role,status){
  return rpc('hipico_admin_set_user_access',{p_user_id:userId,p_role:role,p_status:status,p_permissions:null});
}

function recoveryRedirectUrl(){
  const url=new URL('./',location.href);
  url.search='';url.hash='';
  return url.toString();
}
async function requestPasswordRecovery(email){
  const endpoint=`${CLOUD_CONFIG.supabaseUrl}/auth/v1/recover?redirect_to=${encodeURIComponent(recoveryRedirectUrl())}`;
  const response=await fetch(endpoint,{method:'POST',headers:publicAuthHeaders(),cache:'no-store',body:JSON.stringify({email:String(email||'').trim().toLowerCase()})});
  if(!response.ok){
    let body=null;try{body=await response.json();}catch{}
    throw new Error(String(body?.msg||body?.message||'No se pudo solicitar la recuperación.'));
  }
}

function isReadOnly(){return READ_ONLY_ROLES.has(access?.role);}
function roleBadge(role){return ui.badge(ROLE_LABELS[role]||role,role==='admin'?'info':role==='operator'?'success':'neutral');}
function statusBadge(status){return ui.badge(STATUS_LABELS[status]||status,status==='active'?'success':status==='suspended'?'warning':'danger');}
function credentialBadge(state){return ui.badge(CREDENTIAL_LABELS[state]||CREDENTIAL_LABELS.unknown,state==='password_set'?'success':state==='recovery_required'?'warning':'neutral');}
function dateTime(value){if(!value)return 'Sin registro';try{return new Date(value).toLocaleString('es-VE');}catch{return 'Sin registro';}}

function showBlocked(reason){
  if(blocked)return;
  blocked=true;
  clearLocalAdminEnrollment().catch(()=>{});
  signOut().catch(()=>{});
  const overlay=document.createElement('div');
  overlay.className='access-blocker';
  overlay.innerHTML=`<section class="card access-blocker__card" role="alertdialog" aria-modal="true"><img class="brand-logo brand-logo--access" src="./icons/icon-192.png" alt=""><h2>Acceso no habilitado</h2><p>${escapeHtml(reason)}</p><button class="button button--primary" type="button" data-access-reload>Volver al acceso</button></section>`;
  document.body.append(overlay);
  overlay.querySelector('[data-access-reload]')?.addEventListener('click',()=>location.reload());
}

function applyRoleToDocument(){
  const role=access?.role||'';
  document.documentElement.dataset.accessRole=role;
  document.documentElement.toggleAttribute('data-access-readonly',isReadOnly());
  for(const node of document.querySelectorAll('[data-access-readonly-disabled]'))node.removeAttribute('data-access-readonly-disabled');
  if(!isReadOnly())return;
  for(const control of document.querySelectorAll('button[data-action],button[type="submit"],form button:not([data-action]),input:not([type="search"]),select,textarea')){
    if(control.closest('[data-user-admin]'))continue;
    const action=control.dataset?.action||'';
    if(action&&SAFE_ACTIONS.has(action))continue;
    if(control.matches('button[data-view], .nav-button, .mobile-nav button'))continue;
    if(control.matches('button')&&!action&&control.closest('#auth-form'))continue;
    control.disabled=true;
    control.setAttribute('aria-disabled','true');
    control.setAttribute('data-access-readonly-disabled','true');
    if(control.matches('input,select,textarea'))control.setAttribute('readonly','readonly');
  }
}

function adminUserRow(user){
  const own=user.user_id===access?.user_id;
  const credentialState=user.credential_state||'unknown';
  const credentialDate=user.credential_updated_at||user.last_password_recovery_at;
  return `<article class="access-user-row" data-user-row="${escapeHtml(user.user_id)}" data-user-email="${escapeHtml(user.email)}"><div class="access-user-identity"><strong>${escapeHtml(user.display_name||user.email)}</strong><span>${escapeHtml(user.email)}</span><div>${roleBadge(user.role)} ${statusBadge(user.status)}${own?' <span class="badge">Tú</span>':''}</div></div><div class="access-user-controls"><label><span>Rol</span><select class="select" data-user-role ${own?'disabled':''}>${['admin','operator','viewer','auditor'].map((role)=>`<option value="${role}" ${role===user.role?'selected':''}>${ROLE_LABELS[role]}</option>`).join('')}</select></label><label><span>Estado</span><select class="select" data-user-status ${own?'disabled':''}>${['active','suspended','disabled'].map((status)=>`<option value="${status}" ${status===user.status?'selected':''}>${STATUS_LABELS[status]}</option>`).join('')}</select></label><button class="button button--small" type="button" data-user-save ${own?'disabled':''}>Guardar</button><div class="access-user-credential"><span>Contraseña</span>${credentialBadge(credentialState)}<small>${escapeHtml(dateTime(credentialDate))}</small><button class="button button--small button--ghost" type="button" data-user-recovery>Enviar recuperación</button></div></div></article>`;
}

function adminSectionMarkup(){
  return `<section class="card section-gap access-admin" data-user-admin><div class="card__head"><div><h3>Usuarios y accesos</h3><small>Supabase Auth valida identidad y contraseña; aquí sólo se administra autorización y estado de credencial.</small></div>${roleBadge(access.role)}</div><div class="card__body"><form class="access-grant-form" data-user-grant-form><div class="form-grid form-grid--three"><div class="field"><label>Correo de una cuenta Auth existente</label><input class="input" type="email" name="email" autocomplete="off" required placeholder="operador@correo.com"></div><div class="field"><label>Nombre visible</label><input class="input" name="displayName" autocomplete="off" placeholder="Operador"></div><div class="field"><label>Rol inicial</label><select class="select" name="role"><option value="operator">Operador</option><option value="viewer">Solo lectura</option><option value="auditor">Auditor</option><option value="admin">Administrador</option></select></div></div><div class="access-grant-actions"><button class="button button--primary" type="submit">Conceder acceso</button><p class="muted">No se guarda ni se muestra ninguna contraseña o hash. “Contraseña” indica únicamente si la credencial está configurada o requiere recuperación.</p></div></form><div class="access-user-list" data-user-list>${users.length?users.map(adminUserRow).join(''):'<div class="ui-state" data-state="loading"><strong class="ui-state__title">Cargando usuarios…</strong></div>'}</div></div></section>`;
}

async function loadUsers(force=false){
  if(access?.role!=='admin')return;
  if(!force&&Date.now()-usersLoadedAt<30_000&&users.length)return;
  try{users=await listManagedUsers();usersLoadedAt=Date.now();}
  catch{toast('No se pudo cargar la administración de usuarios.','error',{title:'Accesos'});return;}
  renderAdminList();
}
function renderAdminList(){
  const list=document.querySelector('[data-user-list]');
  if(list)list.innerHTML=users.length?users.map(adminUserRow).join(''):'<div class="ui-state"><strong class="ui-state__title">Sin usuarios habilitados</strong></div>';
}
function decorateSettings(){
  if(access?.role!=='admin')return;
  const manager=document.querySelector('.group-manager');
  if(!manager)return;
  const content=manager.closest('.content')||manager.parentElement;
  if(!content||content.querySelector('[data-user-admin]'))return;
  content.insertAdjacentHTML('beforeend',adminSectionMarkup());
  loadUsers().catch(()=>{});
}

async function syncAccess(force=false){
  const session=currentSession();
  const userId=session?.user?.id||'';
  if(!userId){access=null;accessUserId='';return null;}
  if(!force&&access&&accessUserId===userId)return access;
  if(accessPromise)return accessPromise;
  accessPromise=fetchMyAccess().then((row)=>{
    if(!row){showBlocked('Tu identidad es válida, pero todavía no tiene acceso a Control Hípico. Un administrador debe habilitarla.');return null;}
    if(row.status!=='active'){showBlocked(row.status==='suspended'?'Tu acceso a Control Hípico está suspendido.':'Tu acceso a Control Hípico está deshabilitado.');return null;}
    access=row;accessUserId=userId;applyRoleToDocument();decorateSettings();return row;
  }).catch((error)=>{
    if([401,403].includes(Number(error?.status)))showBlocked('No fue posible validar tus permisos de Control Hípico.');
    return null;
  }).finally(()=>{accessPromise=null;});
  return accessPromise;
}

async function handleGrant(form){
  const data=new FormData(form);
  const email=String(data.get('email')||'').trim();
  const displayName=String(data.get('displayName')||'').trim();
  const role=String(data.get('role')||'operator');
  const submit=form.querySelector('button[type="submit"]');
  if(submit)submit.disabled=true;
  try{await grantUserByEmail(email,displayName,role);form.reset();await loadUsers(true);toast('Acceso actualizado para la cuenta indicada.','success',{title:'Usuario habilitado'});}
  catch(error){const missing=String(error?.message||'').includes('HIPICO_AUTH_USER_NOT_FOUND')||error?.code==='P0002';toast(missing?'Primero crea o invita ese correo en Supabase Authentication > Users.':'No se pudo conceder el acceso.','error',{title:'Usuarios'});}
  finally{if(submit)submit.disabled=false;}
}
async function handleSave(button){
  const row=button.closest('[data-user-row]');if(!row)return;
  const userId=row.dataset.userRow,role=row.querySelector('[data-user-role]')?.value,status=row.querySelector('[data-user-status]')?.value;
  button.disabled=true;
  try{await setUserAccess(userId,role,status);await loadUsers(true);toast('Rol y estado guardados.','success',{title:'Acceso actualizado'});}
  catch(error){toast(String(error?.message||'').includes('HIPICO_CANNOT_DEMOTE_SELF')?'Tu propia cuenta administradora no puede deshabilitarse desde aquí.':'No se pudo guardar el acceso.','error',{title:'Usuarios'});}
  finally{button.disabled=false;}
}
async function handleRecovery(button){
  const row=button.closest('[data-user-row]');if(!row)return;
  const userId=row.dataset.userRow,email=row.dataset.userEmail;
  button.disabled=true;
  try{
    await requestPasswordRecovery(email);
    await rpc('hipico_admin_mark_recovery_requested',{p_user_id:userId});
    await loadUsers(true);
    toast('Si el correo puede recibir mensajes de Auth, recibirá un enlace para definir una nueva contraseña.','success',{title:'Recuperación enviada',duration:6500});
  }catch{toast('No se pudo solicitar la recuperación de contraseña. Revisa la configuración de Auth y vuelve a intentar.','error',{title:'Contraseña'});}
  finally{button.disabled=false;}
}

document.addEventListener('submit',(event)=>{const form=event.target.closest?.('[data-user-grant-form]');if(!form)return;event.preventDefault();handleGrant(form);},true);
document.addEventListener('click',(event)=>{
  const save=event.target.closest?.('[data-user-save]');if(save){event.preventDefault();handleSave(save);return;}
  const recovery=event.target.closest?.('[data-user-recovery]');if(recovery){event.preventDefault();handleRecovery(recovery);}
});

const root=document.querySelector('#app');
if(root)new MutationObserver(()=>{syncAccess().then(()=>{applyRoleToDocument();decorateSettings();});}).observe(root,{childList:true,subtree:true});
window.addEventListener('online',()=>syncAccess(true));
setTimeout(()=>syncAccess(true),0);

export const __test__=Object.freeze({ROLE_LABELS,STATUS_LABELS,CREDENTIAL_LABELS,READ_ONLY_ROLES,SAFE_ACTIONS});
