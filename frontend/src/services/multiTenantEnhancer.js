import { BackendApi } from './backendApi.js';
import { AuthSession } from './authSession.js';
import { Store } from '../state/store.js';

let installed=false;
let switching=false;

function safeTenants(){
  const session=AuthSession.get();
  return Array.isArray(session?.accessibleTenants)?session.accessibleTenants:[];
}

function applySessionToStore(session){
  if(!session?.tenantId)return;
  Store.set({
    profile:{
      ...Store.get().profile,
      name:session.user?.fullName||session.user?.name||Store.get().profile?.name||'Usuario',
      email:session.user?.email||'',
      role:session.user?.role||'client',
      permissions:Array.isArray(session.user?.permissions)?session.user.permissions:[],
      branch:session.tenant?.name||'Empresa',
      plan:session.license?.plan||session.tenant?.plan||'Enterprise'
    },
    activeLicense:session.license||null,
    authTenants:Array.isArray(session.accessibleTenants)?session.accessibleTenants:[],
    settings:{
      ...Store.get().settings,
      companyName:session.tenant?.name||Store.get().settings?.companyName,
      companyRif:session.tenant?.rif||Store.get().settings?.companyRif,
      ...(session.license?.businessSector?{businessMode:session.license.businessSector}:{})
    }
  });
}

function mount(){
  const panel=document.getElementById('userMenuPanel');
  if(!panel||panel.querySelector('[data-tenant-switcher]'))return;
  const session=AuthSession.get();
  const tenants=safeTenants();
  if(!session?.tenantId||tenants.length<2)return;

  const label=document.createElement('label');
  label.className='hf-user-select';
  label.dataset.tenantSwitcher='true';
  const title=document.createElement('span');
  title.innerHTML='<i class="fa-solid fa-building-shield"></i> Empresa activa';
  const select=document.createElement('select');
  select.id='cgTenantSwitcher';
  select.setAttribute('aria-label','Cambiar empresa autorizada');
  for(const tenant of tenants){
    const option=document.createElement('option');
    option.value=tenant.tenantId;
    option.textContent=`${tenant.name} · ${tenant.rif}`;
    option.selected=tenant.tenantId===session.tenantId;
    select.appendChild(option);
  }
  label.append(title,select);
  const head=panel.querySelector('.hf-user-panel-head');
  if(head?.nextSibling)panel.insertBefore(label,head.nextSibling);else panel.appendChild(label);

  select.addEventListener('change',async()=>{
    if(switching||select.value===AuthSession.get()?.tenantId)return;
    switching=true;select.disabled=true;
    const previous=AuthSession.get()?.tenantId;
    try{
      const result=await BackendApi.request('/auth/switch-tenant',{method:'POST',body:{tenantId:select.value}});
      AuthSession.set(result);
      applySessionToStore(result);
      window.dispatchEvent(new CustomEvent('cg:tenant-switched',{detail:{from:previous,to:result.tenantId,tenant:result.tenant}}));
    }catch(error){
      select.value=previous||'';
      window.dispatchEvent(new CustomEvent('cg:tenant-switch-error',{detail:{message:error.message}}));
    }finally{switching=false;select.disabled=false;}
  });
}

export function installMultiTenantEnhancer(){
  if(installed||typeof document==='undefined')return;
  installed=true;
  const observer=new MutationObserver(()=>mount());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  queueMicrotask(mount);
  window.addEventListener('cg:tenant-switched',()=>queueMicrotask(mount));
}
