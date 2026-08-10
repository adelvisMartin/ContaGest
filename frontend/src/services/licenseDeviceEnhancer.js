import '../styles/license-devices-v1115.css';
import { LicenseService } from './licenseService.js';

let installed=false;
let activeLicenseId=null;

function fmt(value){return value?new Date(value).toLocaleString('es-VE',{dateStyle:'short',timeStyle:'short'}):'—';}
function escape(value=''){return String(value).replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

function ensureDialog(){
  let dialog=document.getElementById('cgDeviceDialog');
  if(dialog)return dialog;
  dialog=document.createElement('dialog');
  dialog.id='cgDeviceDialog';
  dialog.className='cg-device-dialog';
  dialog.innerHTML=`<header class="cg-device-dialog-head"><div><p class="cgx-eyebrow">Activaciones seguras</p><h2>Dispositivos de la licencia</h2><p data-device-subtitle>Consulta y revoca equipos sin mostrar secretos.</p></div><button type="button" class="cg-device-dialog-close" data-device-close aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button></header><div class="cg-device-dialog-body"><div data-device-content class="cg-device-empty">Selecciona una licencia.</div></div>`;
  document.body.appendChild(dialog);
  dialog.querySelector('[data-device-close]')?.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',(event)=>{if(event.target===dialog)dialog.close();});
  dialog.addEventListener('click',async(event)=>{
    const button=event.target.closest('[data-device-revoke]');
    if(!button||!activeLicenseId)return;
    if(!window.confirm('¿Revocar este dispositivo? Tendrá que activarse nuevamente con autorización del administrador.'))return;
    button.disabled=true;
    try{
      await LicenseService.revokeDevice(activeLicenseId,button.dataset.deviceRevoke);
      await openDevices(activeLicenseId,dialog.dataset.licenseEmail||'');
    }catch(error){
      window.dispatchEvent(new CustomEvent('cg:license-device-error',{detail:{message:error.message}}));
      button.disabled=false;
    }
  });
  return dialog;
}

function renderDevices(dialog,devices,email){
  dialog.dataset.licenseEmail=email||'';
  const subtitle=dialog.querySelector('[data-device-subtitle]');
  if(subtitle)subtitle.textContent=`${email||'Licencia'} · ${devices.length} activación(es)`;
  const host=dialog.querySelector('[data-device-content]');
  if(!devices.length){host.className='cg-device-empty';host.innerHTML='<i class="fa-solid fa-laptop-file"></i><p>Esta licencia todavía no tiene dispositivos registrados.</p>';return;}
  host.className='cg-device-grid';
  host.innerHTML=devices.map(device=>`<article class="cg-device-card" data-status="${escape(device.status)}"><div><strong><i class="fa-solid fa-${/móvil|android|iphone|ipad/i.test(device.deviceLabel||'')?'mobile-screen':'laptop'}"></i> ${escape(device.deviceLabel||'Dispositivo sin nombre')}</strong><div class="cg-device-meta"><span>Estado: ${escape(device.status)}</span><span>Primera activación: ${escape(fmt(device.firstSeenAt))}</span><span>Último uso: ${escape(fmt(device.lastSeenAt))}</span>${device.lastIp?`<span>IP reciente: ${escape(device.lastIp)}</span>`:''}</div></div><div class="cg-device-credential"><div>Credencial: ${escape(device.credentialPreview||'legacy')}</div><div>Vence: ${escape(fmt(device.credentialExpiresAt))}</div></div><div>${device.status==='active'?`<button type="button" class="cg-device-revoke" data-device-revoke="${escape(device.id)}"><i class="fa-solid fa-ban"></i> Revocar equipo</button>`:`<span class="badge">${escape(device.status)}</span>`}</div></article>`).join('');
}

async function openDevices(licenseId,email=''){
  activeLicenseId=licenseId;
  const dialog=ensureDialog();
  const host=dialog.querySelector('[data-device-content]');
  host.className='cg-device-empty';host.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i><p>Cargando dispositivos…</p>';
  if(!dialog.open)dialog.showModal();
  try{renderDevices(dialog,await LicenseService.devices(licenseId),email);}catch(error){host.innerHTML=`<i class="fa-solid fa-triangle-exclamation"></i><p>${escape(error.message)}</p>`;}
}

function enhanceButtons(){
  document.querySelectorAll('.cg-license-list [data-license-revoke]').forEach((revoke)=>{
    if(revoke.parentElement?.querySelector('[data-license-devices]'))return;
    const licenseId=revoke.dataset.licenseRevoke;
    const row=revoke.closest('tr');
    const email=row?.querySelector('td strong')?.textContent?.trim()||'';
    const button=document.createElement('button');
    button.type='button';button.className='cgx-icon-action';button.dataset.licenseDevices=licenseId;
    button.title='Ver dispositivos';button.setAttribute('aria-label','Ver dispositivos de la licencia');
    button.innerHTML='<i class="fa-solid fa-laptop-file"></i>';
    button.addEventListener('click',()=>openDevices(licenseId,email));
    revoke.parentElement?.insertBefore(button,revoke);
  });
}

export function installLicenseDeviceEnhancer(){
  if(installed||typeof document==='undefined')return;
  installed=true;
  const observer=new MutationObserver(()=>enhanceButtons());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  queueMicrotask(enhanceButtons);
}
