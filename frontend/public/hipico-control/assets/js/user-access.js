import { CLOUD_CONFIG } from './config.js';
import { currentSession, signOut } from './supabase.js';
import { clearLocalAdminEnrollment } from './local-auth.js';
import { escapeHtml, toast } from './ui.js';

const ROLE_LABELS={admin:'Administrador',operator:'Operador',viewer:'Solo lectura',auditor:'Auditor'};
const STATUS_LABELS={active:'Activo',suspended:'Suspendido',disabled:'Deshabilitado'};
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
  const rows=await rpc('hipico_get_my_access');
  return Array.isArray(rows)?rows[0]||null:rows||null;
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

function isReadOnly(){return READ_ONLY_ROLES.has(access?.role);}

function roleBadge(role){
  const variant=role==='admin'?'badge--info':role==='operator'?'badge--success':'';
  return `<span class="badge ${variant}">${escapeHtml(ROLE_LABELS[role]||role)}</span>`;
}

function statusBadge(status){
  const variant=status==='active'?'badge--success':status==='suspended'?'badge--warning':'badge--danger';
  return `<span class="badge ${variant}">${escapeHtml(STATUS_LABELS[status]||status)}</span>`;
}

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

  for(const button of document.querySelectorAll('button[data-action],button[type="submit"],form button:not([data-action]),input:not([type="search"]),select,textarea')){
    if(button.closest('[data-user-admin]'))continue;
    const action=button.dataset?.action||'';
    if(action&&SAFE_ACTIONS.has(action))continue;
    if(button.matches('button[data-view], .nav-button, .mobile-nav button'))continue;
    if(button.matches('button')&&!action&&button.closest('#auth-form'))continue;
    button.disabled=true;
    button.setAttribute('aria-disabled','true');
    button.setAttribute('data-access-readonly-disabled','true');
    if(button.matches('input,select,textarea'))button.setAttribute('readonly','readonly');
  }
}

function adminUserRow(user){
  const own=user.user_id===access?.user_id;
  return `<article class="access-user-row" data-user-row="${escapeHtml(user.user_id)}"><div class="access-user-identity"><strong>${escapeHtml(user.display_name||user.email)}</strong><span>${escapeHtml(user.email)}</span><div>${roleBadge(user.role)} ${statusBadge(user.status)}${own?' <span class="badge">Tú</span>':''}</div></div><div class="access-user-controls"><label><span>Rol</span><select class="select" data-user-role ${own?'disabled':''}>${['admin','operator','viewer','auditor'].map((role)=>`<option value="${role}" ${role===user.role?'selected':''}>${ROLE_LABELS[role]}</option>`).join('')}</select></label><label><span>Estado</span><select class="select" data-user-status ${own?'disabled':''}>${['active','suspended','disabled'].map((status)=>`<option value="${status}" ${status===user.status?'selected':''}>${STATUS_LABELS[status]}</option>`).join('')}</select></label><button class="button button--small" type="button" data-user-save ${own?'disabled':''}>Guardar</button></div></article>`;
}

function adminSectionMarkup(){
  return `<section class="card section-gap access-admin" data-user-admin><div class="card__head"><div><h3>Usuarios y accesos</h3><small>Supabase Auth valida la identidad; Control Hípico administra rol y estado.</small></div>${roleBadge(access.role)}</div><div class="card__body"><form class="access-grant-form" data-user-grant-form><div class="form-grid form-grid--three"><div class="field"><label>Correo de una cuenta Auth existente</label><input class="input" type="email" name="email" autocomplete="off" required placeholder="operador@correo.com"></div><div class="field"><label>Nombre visible</label><input class="input" name="displayName" autocomplete="off" placeholder="Operador"></div><div class="field"><label>Rol inicial</label><select class="select" name="role"><option value="operator">Operador</option><option value="viewer">Solo lectura</option><option value="auditor">Auditor</option><option value="admin">Administrador</option></select></div></div><div class="access-grant-actions"><button class="button button--primary" type="submit">Conceder acceso</button><p class="muted">La persona debe existir primero en Supabase Authentication. Aquí no se crean ni se muestran contraseñas.</p></div></form><div class="access-user-list" data-user-list>${users.length?users.map(adminUserRow).join(''):'<div class="ui-state" data-state="loading"><strong class="ui-state__title">Cargando usuarios…</strong></div>'}</div></div></section>`;
}

async function loadUsers(force=false){
  if(access?.role!=='admin')return;
  if(!force&&Date.now()-usersLoadedAt<30_000&&users.length)return;
  try{users=await listManagedUsers();usersLoadedAt=Date.now();}
  catch(error){toast('No se pudo cargar la administración de usuarios.','error',{title:'Accesos'});return;}
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
  try{
    await grantUserByEmail(email,displayName,role);
    form.reset();
    await loadUsers(true);
    toast('Acceso actualizado para la cuenta indicada.','success',{title:'Usuario habilitado'});
  }catch(error){
    const missing=String(error?.message||'').includes('HIPICO_AUTH_USER_NOT_FOUND')||error?.code==='P0002';
    toast(missing?'Primero crea o invita ese correo en Supabase Authentication > Users.':'No se pudo conceder el acceso.','error',{title:'Usuarios'});
  }finally{if(submit)submit.disabled=false;}
}

async function handleSave(button){
  const row=button.closest('[data-user-row]');
  if(!row)return;
  const userId=row.dataset.userRow;
  const role=row.querySelector('[data-user-role]')?.value;
  const status=row.querySelector('[data-user-status]')?.value;
  button.disabled=true;
  try{await setUserAccess(userId,role,status);await loadUsers(true);toast('Rol y estado guardados.','success',{title:'Acceso actualizado'});}
  catch(error){toast(String(error?.message||'No se pudo guardar el acceso.').includes('HIPICO_CANNOT_DEMOTE_SELF')?'Tu propia cuenta administradora no puede deshabilitarse desde aquí.':'No se pudo guardar el acceso.','error',{title:'Usuarios'});}
  finally{button.disabled=false;}
}

document.addEventListener('submit',(event)=>{
  const form=event.target.closest?.('[data-user-grant-form]');
  if(!form)return;
  event.preventDefault();
  handleGrant(form);
},true);

document.addEventListener('click',(event)=>{
  const button=event.target.closest?.('[data-user-save]');
  if(button){event.preventDefault();handleSave(button);}
});

const root=document.querySelector('#app');
if(root)new MutationObserver(()=>{syncAccess().then(()=>{applyRoleToDocument();decorateSettings();});}).observe(root,{childList:true,subtree:true});
window.addEventListener('online',()=>syncAccess(true));
setTimeout(()=>syncAccess(true),0);

export const __test__=Object.freeze({ROLE_LABELS,STATUS_LABELS,READ_ONLY_ROLES,SAFE_ACTIONS});
