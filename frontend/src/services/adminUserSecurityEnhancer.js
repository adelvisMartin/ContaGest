import { BackendApi } from './backendApi.js';

let observer;
let busy = false;
const escapeHtml = (value='') => String(value).replace(/[&<>'"]/g,(char)=>({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[char]));

function statusNode(section){return section?.querySelector('[data-security-status]');}
function setStatus(section,message='',tone=''){const node=statusNode(section);if(node){node.textContent=message;node.dataset.tone=tone;}}

function row(user,roles){
  const active=user.status==='active';
  const roleOptions=roles.map((role)=>`<option value="${escapeHtml(role.id)}" ${role.id===user.primaryRoleId?'selected':''}>${escapeHtml(role.name)}${role.admin?' · admin':''}</option>`).join('');
  const failures=Number(user.failedAttempts||0);
  return `<tr data-security-user-row="${escapeHtml(user.id)}">
    <td><div class="cg-security-user"><strong>${escapeHtml(user.fullName)}</strong><small>${escapeHtml(user.email)}</small><div class="cg-security-meta"><span class="cg-security-pill ${user.passwordConfigured?'is-success':'is-danger'}">${user.passwordConfigured?'Contraseña configurada':'Sin contraseña'}</span>${failures?`<span class="cg-security-pill is-danger">${failures}/5 fallos</span>`:'<span class="cg-security-pill is-success">0 fallos</span>'}</div></div></td>
    <td><label class="cg-security-switch"><input type="checkbox" data-security-active ${active?'checked':''}><span>${active?'Activo':'Bloqueado'}</span></label></td>
    <td><select class="cg-security-role" data-security-role aria-label="Rol de ${escapeHtml(user.fullName)}">${roleOptions}</select></td>
    <td><input class="cg-security-password" data-security-password type="password" minlength="12" maxlength="128" autocomplete="new-password" placeholder="Nueva contraseña (opcional)" aria-label="Nueva contraseña para ${escapeHtml(user.fullName)}"></td>
    <td>${user.lastFailedAt?`<small>${new Date(user.lastFailedAt).toLocaleString('es-VE',{dateStyle:'short',timeStyle:'short'})}</small>`:'<small>Sin fallos recientes</small>'}</td>
    <td><div class="cg-security-actions"><button type="button" class="cg-security-save" data-security-save>Guardar</button>${!active||failures?'<button type="button" class="cg-security-unlock" data-security-unlock>Desbloquear</button>':''}</div></td>
  </tr>`;
}

async function load(section){
  if(!section||busy)return;
  busy=true;setStatus(section,'Cargando usuarios reales y estado de seguridad…','');
  const body=section.querySelector('[data-security-body]');
  try{
    const data=await BackendApi.request('/user-security/users');
    const users=Array.isArray(data?.users)?data.users:[];
    const roles=Array.isArray(data?.roles)?data.roles:[];
    if(body)body.innerHTML=users.length?users.map((user)=>row(user,roles)).join(''):'<tr><td colspan="6" class="cg-security-empty">No hay usuarios registrados para esta empresa.</td></tr>';
    bindRows(section);
    setStatus(section,`${users.length} usuario(s) cargados. Los cambios se aplican en Supabase mediante el backend seguro.`,'success');
  }catch(error){
    if(body)body.innerHTML='<tr><td colspan="6" class="cg-security-empty">No se pudo cargar la consola de usuarios.</td></tr>';
    setStatus(section,error?.message||'No se pudo consultar la seguridad de usuarios.','error');
  }finally{busy=false;}
}

async function saveRow(section,rowNode,{unlockOnly=false}={}){
  const userId=rowNode?.dataset?.securityUserRow;if(!userId)return;
  const active=rowNode.querySelector('[data-security-active]')?.checked===true;
  const roleId=rowNode.querySelector('[data-security-role]')?.value||'';
  const newPassword=String(rowNode.querySelector('[data-security-password]')?.value||'');
  if(newPassword&&newPassword.length<12){setStatus(section,'La nueva contraseña debe tener al menos 12 caracteres.','error');return;}
  const buttons=[...rowNode.querySelectorAll('button')];buttons.forEach((button)=>button.disabled=true);
  try{
    const payload=unlockOnly
      ? {status:'active',clearFailures:true}
      : {status:active?'active':'disabled',roleId,clearFailures:active,...(newPassword?{newPassword}:{})};
    await BackendApi.request(`/user-security/users/${encodeURIComponent(userId)}`,{method:'PATCH',body:payload});
    setStatus(section,unlockOnly?'Usuario reactivado y contador de fallos limpiado.':'Usuario actualizado correctamente.','success');
    await load(section);
  }catch(error){
    setStatus(section,error?.message||'No se pudo actualizar el usuario.','error');
  }finally{buttons.forEach((button)=>button.disabled=false);}
}

function bindRows(section){
  section.querySelectorAll('[data-security-active]').forEach((input)=>input.addEventListener('change',()=>{const text=input.parentElement?.querySelector('span');if(text)text.textContent=input.checked?'Activo':'Bloqueado';}));
  section.querySelectorAll('[data-security-save]').forEach((button)=>button.addEventListener('click',()=>saveRow(section,button.closest('[data-security-user-row]'))));
  section.querySelectorAll('[data-security-unlock]').forEach((button)=>button.addEventListener('click',()=>saveRow(section,button.closest('[data-security-user-row]'),{unlockOnly:true})));
}

function mount(){
  const page=document.querySelector('.cg-rbac-page');
  if(!page||document.getElementById('cgUserSecurityConsole'))return;
  const section=document.createElement('section');
  section.id='cgUserSecurityConsole';
  section.className='cg-rbac-section cg-enterprise-card cg-user-security';
  section.innerHTML=`<div class="cg-user-security-head"><div><h3>Usuarios reales · acceso y desbloqueo</h3><p>Activa o bloquea cuentas, cambia el rol y asigna una nueva contraseña. Después de 5 contraseñas incorrectas la cuenta queda bloqueada hasta que un administrador la reactive.</p></div><button type="button" class="btn btn-secondary cg-security-refresh" data-security-refresh><i class="fa-solid fa-rotate"></i> Actualizar</button></div><p class="cg-security-status" data-security-status aria-live="polite"></p><div class="pl-table-wrap"><table class="cg-security-table"><thead><tr><th>Usuario</th><th>Estado</th><th>Rol</th><th>Nueva contraseña</th><th>Último fallo</th><th>Acción</th></tr></thead><tbody data-security-body><tr><td colspan="6" class="cg-security-empty">Cargando…</td></tr></tbody></table></div>`;
  const anchor=page.querySelector('.cg-admin-command-grid');
  if(anchor)anchor.insertAdjacentElement('afterend',section);else page.prepend(section);
  section.querySelector('[data-security-refresh]')?.addEventListener('click',()=>load(section));
  load(section);
}

export function installAdminUserSecurityEnhancer(){
  if(typeof document==='undefined')return;
  const start=()=>{mount();if(!observer){observer=new MutationObserver(mount);observer.observe(document.body,{childList:true,subtree:true});}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
}
