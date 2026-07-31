import '../styles/runtime-hotfix-v1110.css';

const PARAM_BY_NAME = {
  q:'q', search:'search', query:'search', status:'status', type:'type', kind:'kind', category:'category',
  specialty:'specialty', page:'page', pageSize:'pageSize', sort:'sort', order:'order', date:'date',
  dateFrom:'dateFrom', dateTo:'dateTo', from:'from', to:'to', view:'view', tab:'tab', mode:'mode',
  patientId:'patient', memberId:'member', appointmentId:'appointment'
};

let installed = false;
let timer = null;
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

function install() {
  if (installed) return;
  installed = true;

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
    applyDeepLink(root,params,current.route);
  }
};
