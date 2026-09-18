import { Store } from '../state/store.js';

const PARAM_BY_NAME = {
  q:'q', search:'search', query:'search', status:'status', type:'type', kind:'kind', category:'category',
  specialty:'specialty', page:'page', pageSize:'pageSize', sort:'sort', order:'order', date:'date',
  dateFrom:'dateFrom', dateTo:'dateTo', from:'from', to:'to', view:'view', tab:'tab', mode:'mode',
  patientId:'patient', memberId:'member', appointmentId:'appointment'
};
const SIDEBAR_SECTIONS_KEY='cg_sidebar_sections_v1126';

let installed = false;
let timer = null;
let resizeTimer = null;
let serviceRef = null;
let lastAppliedDeepLink = '';

function writeParams(patch = {}, { replace = true } = {}) {
  if (!serviceRef) return;
  const current = serviceRef.current();
  const next = { ...current.params };
  Object.entries(patch).forEach(([key, value]) => {
    const text = String(value ?? '').trim();
    if (text) next[key] = text;
    else delete next[key];
  });
  const method = replace ? 'replaceState' : 'pushState';
  window.history[method]({ module:current.route, ...next },'',serviceRef.href(current.route,next));
}

function parameterFor(control) {
  if (control.dataset.queryParam) return control.dataset.queryParam;
  const name = control.getAttribute('name') || control.id || '';
  if (PARAM_BY_NAME[name]) return PARAM_BY_NAME[name];
  if (control.matches('input[type="search"]')) return 'search';
  return '';
}

function supportedTheme(value) {
  return String(value || '').toLowerCase() === 'dark' ? 'dark' : 'light';
}

function syncThemeControls(root = document) {
  const theme = supportedTheme(Store.get().settings?.theme);
  const select = root.querySelector?.('#userMenuTheme');
  if (select) {
    [...select.options].forEach((option) => {
      if (!['light','dark'].includes(option.value)) option.remove();
    });
    select.value = theme;
  }
  const button = root.querySelector?.('#btnTema');
  if (button) {
    const next = theme === 'dark' ? 'claro' : 'oscuro';
    button.setAttribute('aria-label',`Activar tema ${next}`);
    button.setAttribute('title',`Activar tema ${next}`);
  }
}

function rememberedSections(){
  try{return new Set(JSON.parse(sessionStorage.getItem(SIDEBAR_SECTIONS_KEY)||'[]'));}catch{return new Set();}
}
function syncResponsiveSidebar(root = document) {
  const sections = [...(root.querySelectorAll?.('.hf-menu-section') || [])];
  if (!sections.length) return;
  const mobile = matchMedia('(max-width:1023px)').matches;
  const remembered=rememberedSections();
  sections.forEach((section) => {
    if (!mobile) { section.open = true; return; }
    const active=Boolean(section.querySelector('.hf-menu-item.active'));
    const name=String(section.dataset.sidebarSection||'');
    section.open=active||remembered.has(name);
    section.querySelector(':scope > summary')?.setAttribute('aria-expanded',String(section.open));
  });
}

function closeUserMenu(root = document) {
  const panel = root.querySelector?.('#userMenuPanel');
  const toggle = root.querySelector?.('#btnUserMenu');
  if (!panel || panel.classList.contains('hidden')) return;
  panel.classList.add('hidden');
  toggle?.setAttribute('aria-expanded','false');
}

function installShellInteractionGuard() {
  document.addEventListener('click',(event)=>{
    const target=event.target instanceof Element?event.target:null;
    if(!target)return;

    const themeButton=target.closest('#btnTema');
    if(themeButton){
      // app.js owns the actual theme mutation. This guard exists only to make sure one
      // click reaches one owner instead of both legacy and runtime theme handlers.
      return;
    }

    const openPanel=document.getElementById('userMenuPanel');
    if(openPanel&&!openPanel.classList.contains('hidden')&&!target.closest('.hf-user-menu')) closeUserMenu();
  },true);

  window.addEventListener('keydown',(event)=>{
    if(event.key==='Escape')closeUserMenu();
  });

  window.addEventListener('resize',()=>{
    clearTimeout(resizeTimer);
    resizeTimer=setTimeout(()=>syncResponsiveSidebar(document),120);
  });
}

function install() {
  if (installed) return;
  installed = true;
  installShellInteractionGuard();

  document.addEventListener('input',(event)=>{
    const control=event.target instanceof Element?event.target.closest('[data-query-param]'):null;
    if(!control||!['INPUT','TEXTAREA'].includes(control.tagName))return;
    const key=control.dataset.queryParam;
    clearTimeout(timer);
    timer=setTimeout(()=>writeParams({[key]:control.value},{replace:true}),260);
  });

  document.addEventListener('change',(event)=>{
    const control=event.target instanceof Element?event.target.closest('[data-query-param]'):null;
    if(!control)return;
    writeParams({[control.dataset.queryParam]:control.value},{replace:true});
  });

  document.addEventListener('click',(event)=>{
    const target=event.target instanceof Element?event.target:null;
    const pageTrigger=target?.closest('[data-page],[data-sort],[data-view],[data-tab]');
    if(pageTrigger){
      const patch={};
      if(pageTrigger.dataset.page)patch.page=pageTrigger.dataset.page;
      if(pageTrigger.dataset.sort)patch.sort=pageTrigger.dataset.sort;
      if(pageTrigger.dataset.view)patch.view=pageTrigger.dataset.view;
      if(pageTrigger.dataset.tab)patch.tab=pageTrigger.dataset.tab;
      writeParams(patch,{replace:false});
    }
    const gymTab=target?.closest('[data-gym-tab]');
    if(gymTab)writeParams({tab:gymTab.dataset.gymTab},{replace:false});
    const gymMember=target?.closest('[data-gym-member]');
    if(gymMember)writeParams({member:gymMember.dataset.gymMember,tab:'assessments'},{replace:false});
    const carePatient=target?.closest('[data-care-patient]');
    if(carePatient)writeParams({patient:carePatient.dataset.carePatient,tab:'history'},{replace:false});
  });

  window.addEventListener('popstate',()=>{
    lastAppliedDeepLink='';
    window.setTimeout(()=>{
      if(!serviceRef)return;
      const current=serviceRef.current();
      if(current.route==='veterinaria'){
        window.location.reload();
        return;
      }
      applyDeepLink(document,current.params,current.route);
    },0);
  });
}

function applyDeepLink(root, params, route) {
  const signature=`${route}|${params.tab||''}|${params.patient||''}|${params.member||''}`;
  if(signature===lastAppliedDeepLink)return;
  const action=()=>{
    if(['gimnasio','rutinas','nutricion'].includes(route)){
      const tab=params.tab;
      const tabButton=tab?root.querySelector(`[data-gym-tab="${CSS.escape(tab)}"]`):null;
      if(tabButton&&!tabButton.classList.contains('active')){lastAppliedDeepLink=signature;tabButton.click();return;}
      const member=params.member;
      const memberButton=member?root.querySelector(`[data-gym-member="${CSS.escape(member)}"]`):null;
      if(memberButton){lastAppliedDeepLink=signature;memberButton.click();return;}
    }
    if(route==='salud'){
      const patient=params.patient;
      const patientButton=patient?root.querySelector(`[data-care-patient="${CSS.escape(patient)}"]`):null;
      if(patientButton){lastAppliedDeepLink=signature;patientButton.click();return;}
    }
    lastAppliedDeepLink=signature;
  };
  requestAnimationFrame(action);
}

export const QueryParamEnhancer = {
  mount(root, UrlStateService) {
    serviceRef=UrlStateService;
    install();
    const current=UrlStateService.current();
    const params=current.params;
    const controls=[...root.querySelectorAll('input[name],select[name],textarea[name],input[type="search"]')];
    const claimed=new Set();
    controls.forEach((control)=>{
      const key=parameterFor(control);
      if(!key||claimed.has(`${key}:${control.form?.id||'page'}`))return;
      control.dataset.queryParam=key;
      claimed.add(`${key}:${control.form?.id||'page'}`);
      if(params[key]!==undefined&&String(control.value||'')!==String(params[key]))control.value=params[key];
    });
    root.querySelectorAll('[data-query-href]').forEach((node)=>{
      const route=node.dataset.route||current.route;
      let paramsForLink={};
      try{paramsForLink=JSON.parse(node.dataset.queryHref||'{}');}catch{/* ignore */}
      node.setAttribute('href',UrlStateService.href(route,paramsForLink));
    });
    syncThemeControls(root);
    syncResponsiveSidebar(root);
    applyDeepLink(root,params,current.route);

  }
};