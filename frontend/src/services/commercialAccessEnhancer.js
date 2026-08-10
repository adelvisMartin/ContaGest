import {Store} from '../state/store.js';
import {CommercialService} from './commercialService.js';

let installed=false;
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

function resultDialog(){
  let dialog=document.getElementById('cgProvisionResult');
  if(dialog)return dialog;
  dialog=document.createElement('dialog');dialog.id='cgProvisionResult';dialog.className='cg-device-dialog';
  dialog.innerHTML=`<header class="cg-device-dialog-head"><div><p class="cgx-eyebrow">Acceso multiempresa</p><h2>Credencial técnica creada</h2><p>La empresa quedó vinculada a la misma identidad global del usuario.</p></div><button type="button" class="cg-device-dialog-close" data-prov-close aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button></header><div class="cg-device-dialog-body" data-prov-body></div>`;
  document.body.appendChild(dialog);dialog.querySelector('[data-prov-close]')?.addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});return dialog;
}
function showResult(result){
  const dialog=resultDialog();const body=dialog.querySelector('[data-prov-body]');
  const lines=[`Empresa: ${result.tenant?.name||''} · ${result.tenant?.rif||''}`,`Correo: ${result.user?.email||''}`,`Licencia: ${result.licenseKey||''}`,result.temporaryPassword?`Contraseña temporal: ${result.temporaryPassword}`:'Contraseña: conserva la contraseña actual de esta identidad',`Módulos: ${(result.modules||[]).join(', ')}`];
  body.innerHTML=`<div class="panel-soft p-4 rounded-xl grid gap-3"><p><strong>${esc(result.user?.fullName||result.user?.email||'Usuario')}</strong></p><div class="cg-license-secret-grid"><span><small>Empresa</small><strong>${esc(result.tenant?.name||'')}</strong></span><span><small>RIF</small><strong>${esc(result.tenant?.rif||'')}</strong></span><span><small>Correo</small><strong>${esc(result.user?.email||'')}</strong></span><span><small>Licencia</small><code>${esc(result.licenseKey||'')}</code></span>${result.temporaryPassword?`<span><small>Contraseña temporal</small><code>${esc(result.temporaryPassword)}</code></span>`:''}</div><p class="cg-license-warning"><i class="fa-solid fa-shield-halved"></i> ${esc(result.note||'Guarda la licencia ahora.')}</p><button type="button" class="btn btn-primary" data-prov-copy><i class="fa-solid fa-copy"></i> Copiar credenciales</button></div>`;
  body.querySelector('[data-prov-copy]')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(lines.join('\n'));}catch{/* selección manual disponible */}});
  if(!dialog.open)dialog.showModal();
}

async function provision(subscriptionId){
  const subscription=(Store.get().commercial?.subscriptions||[]).find(item=>item.id===subscriptionId);
  if(!subscription)return;
  const tenants=(subscription.tenants||[]).filter(item=>item.status==='active');
  if(!tenants.length){window.alert('Primero vincula al menos una empresa/RIF a esta suscripción.');return;}
  const choices=tenants.map(item=>`${item.rif} — ${item.name}`).join('\n');
  const rif=window.prompt(`RIF donde habilitar al usuario:\n\n${choices}`,tenants[0]?.rif||'');if(!rif)return;
  const tenant=tenants.find(item=>String(item.rif).trim().toUpperCase()===String(rif).trim().toUpperCase());
  if(!tenant){window.alert('Ese RIF no pertenece a las empresas activas de la suscripción.');return;}
  const email=window.prompt('Correo de la persona. Usa el mismo correo en los RIF que pertenezcan a la misma identidad:','');if(!email)return;
  const fullName=window.prompt('Nombre completo:','')||email;
  const devices=Number(window.prompt('Máximo de dispositivos para esta empresa:','2')||2);
  try{showResult(await CommercialService.provisionSubscriptionUser(subscriptionId,{tenantId:tenant.tenantId,email,fullName,maxDevices:Math.min(20,Math.max(1,devices))}));}
  catch(error){window.alert(error.message||'No se pudo provisionar el acceso.');}
}

function enhance(){
  document.querySelectorAll('[data-sub-tenant]').forEach(anchor=>{
    const cell=anchor.parentElement;if(!cell||cell.querySelector('[data-sub-user]'))return;
    const button=document.createElement('button');button.type='button';button.className='btn btn-secondary';button.dataset.subUser=anchor.dataset.subTenant;button.title='Provisionar usuario en empresa contratada';button.innerHTML='<i class="fa-solid fa-user-plus"></i>';
    button.addEventListener('click',()=>provision(button.dataset.subUser));cell.insertBefore(button,anchor.nextSibling);
  });
}

export function installCommercialAccessEnhancer(){if(installed||typeof document==='undefined')return;installed=true;const observer=new MutationObserver(()=>enhance());observer.observe(document.documentElement,{childList:true,subtree:true});queueMicrotask(enhance);}
