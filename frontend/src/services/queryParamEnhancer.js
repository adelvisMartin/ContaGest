import '../styles/runtime-hotfix-v1110.css';
import { Store } from '../state/store.js';
import { AccessControlService } from './accessControlService.js';
import { generateQuickRoutine, routineWhatsappText, generateNutritionDraft, nutritionWhatsappText } from './specialistAssistants.js';

const PARAM_BY_NAME = {
  q:'q', search:'search', query:'search', status:'status', type:'type', kind:'kind', category:'category',
  specialty:'specialty', page:'page', pageSize:'pageSize', sort:'sort', order:'order', date:'date',
  dateFrom:'dateFrom', dateTo:'dateTo', from:'from', to:'to', view:'view', tab:'tab', mode:'mode',
  patientId:'patient', memberId:'member', appointmentId:'appointment'
};
const SIDEBAR_OPEN_KEY='cg_sidebar_open_sections_v1125';

let installed = false;
let timer = null;
let resizeTimer = null;
let serviceRef = null;
let lastAppliedDeepLink = '';
let rbacPatched = false;

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

function supportedTheme(value) { return String(value || '').toLowerCase() === 'dark' ? 'dark' : 'light'; }
function syncThemeControls(root = document) {
  const theme = supportedTheme(Store.get().settings?.theme);
  const select = root.querySelector?.('#userMenuTheme');
  if (select) {
    [...select.options].forEach((option) => { if (!['light','dark'].includes(option.value)) option.remove(); });
    select.value = theme;
  }
  const button = root.querySelector?.('#btnTema');
  if (button) {
    const next = theme === 'dark' ? 'claro' : 'oscuro';
    button.setAttribute('aria-label',`Activar tema ${next}`);
    button.setAttribute('title',`Activar tema ${next}`);
  }
}

function savedSidebarSections(){
  try{return new Set(JSON.parse(sessionStorage.getItem(SIDEBAR_OPEN_KEY)||'[]'));}catch{return new Set();}
}
function persistSidebarSections(root=document){
  const open=[...(root.querySelectorAll?.('.hf-menu-section[open]')||[])].map((node)=>node.dataset.sidebarSection).filter(Boolean);
  sessionStorage.setItem(SIDEBAR_OPEN_KEY,JSON.stringify(open));
}
function syncResponsiveSidebar(root = document) {
  const sections = [...(root.querySelectorAll?.('.hf-menu-section') || [])];
  if (!sections.length) return;
  const mobile = matchMedia('(max-width:1023px)').matches;
  const saved=savedSidebarSections();
  sections.forEach((section) => {
    if (!mobile) { section.open = true; return; }
    const active=Boolean(section.querySelector('.hf-menu-item.active'));
    section.open = active || saved.has(section.dataset.sidebarSection);
  });
}

function closeUserMenu(root = document) {
  const panel = root.querySelector?.('#userMenuPanel');
  const toggle = root.querySelector?.('#btnUserMenuToggle');
  if (!panel || panel.classList.contains('hidden')) return;
  panel.classList.add('hidden');
  toggle?.setAttribute('aria-expanded','false');
}

function patchRbacSelection(){
  if(rbacPatched)return;rbacPatched=true;
  const originalModulesForUser=AccessControlService.modulesForUser.bind(AccessControlService);
  const originalUpsert=AccessControlService.upsertDemoUser.bind(AccessControlService);
  const originalUpdate=AccessControlService.updateUser.bind(AccessControlService);
  AccessControlService.modulesForUser=(user,role)=>{
    if(user?.demo&&Array.isArray(user.selectedModules)&&user.selectedModules.length){
      const roleSet=new Set(role?.modules||[]);
      const limit=Math.max(1,Number(user.maxModules||7));
      return user.selectedModules.filter((route)=>roleSet.has(route)).slice(0,limit);
    }
    return originalModulesForUser(user,role);
  };
  AccessControlService.upsertDemoUser=(rbacInput,data={})=>{
    const result=originalUpsert(rbacInput,data);
    let selected=[];
    try{selected=JSON.parse(data.selectedModules||'[]');}catch{/* noop */}
    if(!selected.length)return result;
    const email=String(data.email||'').toLowerCase();
    result.users=result.users.map((user)=>String(user.email||'').toLowerCase()===email?{...user,selectedModules:selected.slice(0,Math.max(1,Number(data.maxModules||7)))}:user);
    return result;
  };
  AccessControlService.updateUser=(rbacInput,userId,data={})=>{
    const result=originalUpdate(rbacInput,userId,data);
    if(data.selectedModules===undefined)return result;
    let selected=[];try{selected=JSON.parse(data.selectedModules||'[]');}catch{/* noop */}
    result.users=result.users.map((user)=>user.id===userId?{...user,selectedModules:selected.slice(0,Math.max(1,Number(data.maxModules||user.maxModules||7)))}:user);
    return result;
  };
}

function ensureSpecialistRoles(){
  const state=Store.get();const rbac=AccessControlService.ensure(state.rbac);let changed=false;
  const additions=[
    {id:'role-odontologia',name:'Odontología / Consultorio',tone:'brand',description:'Pacientes, agenda, tratamientos odontológicos, presupuestos, cobros y comunicaciones.',scope:'Perfil especializado para odontólogos y consultorios dentales.',permissions:['dashboard.view','clients.manage','sales.manage','sales.view','health.manage','care.manage','banking.manage','reports.view','communications.manage'],modules:['dashboard','salud','clientes','cotizacion','ventas','historial','bancos','reportes','mensajes','soporte']},
    {id:'role-entrenador',name:'Entrenador / Coach',tone:'success',description:'Clientes, evaluaciones, rutinas, clases y seguimiento fitness.',scope:'Perfil operativo de entrenador sin administración financiera global.',permissions:['dashboard.view','gym.manage','fitness.manage','clients.manage','communications.manage'],modules:['dashboard','gimnasio','rutinas','nutricion','clientes','mensajes','soporte']},
    {id:'role-nutricion',name:'Nutrición deportiva',tone:'success',description:'Clientes, seguimiento nutricional, medidas y comunicación.',scope:'Perfil de seguimiento nutricional y deportivo.',permissions:['dashboard.view','gym.manage','fitness.manage','clients.manage','communications.manage'],modules:['dashboard','gimnasio','nutricion','clientes','mensajes','reportes','soporte']}
  ];
  additions.forEach((role)=>{if(!rbac.roles.some((item)=>item.id===role.id)){rbac.roles.push(role);changed=true;}});
  if(changed)Store.update((draft)=>{draft.rbac=rbac;});
}

function enhanceDemoModulePicker(root=document){
  const form=root.querySelector?.('#createDemoUserForm');if(!form||form.querySelector('[data-demo-module-picker]'))return;
  const roleSelect=form.querySelector('select[name="roleId"]');const maxInput=form.querySelector('input[name="maxModules"]');if(!roleSelect||!maxInput)return;
  const host=document.createElement('fieldset');host.className='cg-demo-module-picker';host.dataset.demoModulePicker='true';
  const hidden=document.createElement('input');hidden.type='hidden';hidden.name='selectedModules';form.appendChild(hidden);
  const title=document.createElement('legend');title.innerHTML='<span>Módulos habilitados</span><strong data-demo-module-count>0/0</strong>';host.appendChild(title);
  const help=document.createElement('p');help.textContent='Selecciona exactamente qué verá este acceso. El límite se toma del campo “Máx. módulos”.';host.appendChild(help);
  const grid=document.createElement('div');grid.className='cg-demo-module-grid';host.appendChild(grid);
  maxInput.closest('.field, label, div')?.after(host);
  const render=()=>{
    const rbac=AccessControlService.ensure(Store.get().rbac);const role=rbac.roles.find((item)=>item.id===roleSelect.value)||rbac.roles[0];
    const limit=Math.max(1,Number(maxInput.value||7));const allowed=new Set(role?.modules||[]);const current=new Set(JSON.parse(hidden.value||'[]').filter((route)=>allowed.has(route)));
    if(!current.size)[...(role?.modules||[])].slice(0,limit).forEach((route)=>current.add(route));
    grid.innerHTML=AccessControlService.modules.filter((module)=>allowed.has(module.route)).map((module)=>`<label class="cg-demo-module-badge ${current.has(module.route)?'is-selected':''}"><input type="checkbox" value="${module.route}" ${current.has(module.route)?'checked':''}><span>${module.label}</span></label>`).join('');
    const sync=()=>{const checked=[...grid.querySelectorAll('input:checked')];if(checked.length>limit){checked.at(-1).checked=false;checked.at(-1).closest('label')?.classList.remove('is-selected');return;}grid.querySelectorAll('label').forEach((label)=>label.classList.toggle('is-selected',label.querySelector('input')?.checked));const values=checked.map((input)=>input.value);hidden.value=JSON.stringify(values);host.querySelector('[data-demo-module-count]').textContent=`${values.length}/${limit}`;grid.querySelectorAll('input:not(:checked)').forEach((input)=>input.disabled=values.length>=limit);};
    grid.querySelectorAll('input').forEach((input)=>input.addEventListener('change',sync));sync();
  };
  roleSelect.addEventListener('change',()=>{hidden.value='[]';render();});maxInput.addEventListener('input',render);render();
}

function enhanceBirthDate(root=document){
  const input=root.querySelector?.('#gymMemberForm input[name="birthDate"]');if(!input||input.dataset.quickDate==='true')return;input.dataset.quickDate='true';input.type='hidden';
  const wrapper=document.createElement('div');wrapper.className='cg-quick-date';wrapper.innerHTML='<span>Fecha de nacimiento</span><div><select data-birth-day aria-label="Día"><option value="">Día</option></select><select data-birth-month aria-label="Mes"><option value="">Mes</option></select><select data-birth-year aria-label="Año"><option value="">Año</option></select></div>';
  const d=wrapper.querySelector('[data-birth-day]'),m=wrapper.querySelector('[data-birth-month]'),y=wrapper.querySelector('[data-birth-year]');for(let i=1;i<=31;i++)d.insertAdjacentHTML('beforeend',`<option>${i}</option>`);['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'].forEach((name,i)=>m.insertAdjacentHTML('beforeend',`<option value="${i+1}">${name}</option>`));for(let year=new Date().getFullYear();year>=1920;year--)y.insertAdjacentHTML('beforeend',`<option>${year}</option>`);
  const sync=()=>{if(d.value&&m.value&&y.value)input.value=`${y.value}-${String(m.value).padStart(2,'0')}-${String(d.value).padStart(2,'0')}`;else input.value='';};[d,m,y].forEach((node)=>node.addEventListener('change',sync));input.closest('label')?.replaceWith(wrapper);wrapper.appendChild(input);
}

async function copyText(value){try{await navigator.clipboard.writeText(value);return true;}catch{const area=document.createElement('textarea');area.value=value;document.body.appendChild(area);area.select();const ok=document.execCommand('copy');area.remove();return ok;}}
function fitnessAssistantMarkup(){return `<section class="cg-specialist-assistant" data-fitness-assistant><header><div><span>Asistente de entrenador</span><h3>Rutina rápida sin retrabajo</h3><p>Usa “Usuario test” cuando solo necesitas generar y copiar una rutina sin registrar al cliente.</p></div></header><div class="cg-specialist-grid"><label>Cliente<input data-fit-client value="Usuario test"></label><label>Nivel<select data-fit-level><option value="basico">Básico</option><option value="intermedio">Intermedio</option><option value="avanzado">Avanzado</option></select></label><label>Objetivo<select data-fit-goal><option value="hipertrofia">Hipertrofia</option><option value="fuerza">Fuerza</option><option value="resistencia">Resistencia muscular</option></select></label><label>Duración<input data-fit-duration type="number" min="20" max="120" value="50"></label></div><div class="cg-muscle-picker" data-fit-muscles>${['pecho','hombros','triceps','espalda','biceps','piernas','gluteos','core'].map((m)=>`<button type="button" data-muscle="${m}">${m}</button>`).join('')}</div><div class="cg-specialist-actions"><button type="button" class="cgx-btn cgx-btn-primary" data-fit-generate>Generar sugerencia</button><button type="button" class="cgx-btn cgx-btn-secondary" data-fit-copy disabled>Copiar para WhatsApp</button></div><div class="cg-specialist-output" data-fit-output></div></section>`;}
function nutritionAssistantMarkup(){return `<section class="cg-specialist-assistant" data-nutrition-assistant><header><div><span>Asistente nutricional</span><h3>Plan semanal orientativo</h3><p>Para prueba rápida puedes dejar el cliente como “Usuario test”. La salida no incluye el nombre al copiar.</p></div></header><div class="cg-specialist-grid"><label>Cliente<input data-nut-client value="Usuario test"></label><label>Peso kg<input data-nut-weight type="number" min="30" max="300" value="75"></label><label>Altura cm<input data-nut-height type="number" min="120" max="230" value="175"></label><label>Edad<input data-nut-age type="number" min="16" max="100" value="30"></label><label>Sexo<select data-nut-sex><option value="">No indicado</option><option value="female">Femenino</option><option value="male">Masculino</option></select></label><label>Actividad<select data-nut-activity><option value="ligero">Ligera</option><option value="moderado" selected>Moderada</option><option value="alto">Alta</option></select></label><label>Objetivo<select data-nut-goal><option value="bajar">Bajar grasa/peso</option><option value="mantener">Mantener</option><option value="subir">Subir masa/peso</option></select></label><label>Comidas/día<input data-nut-meals type="number" min="3" max="6" value="4"></label></div><div class="cg-specialist-actions"><button type="button" class="cgx-btn cgx-btn-primary" data-nut-generate>Generar semana</button><button type="button" class="cgx-btn cgx-btn-secondary" data-nut-copy disabled>Copiar para WhatsApp</button></div><div class="cg-specialist-output" data-nut-output></div></section>`;}
function enhanceFitnessAssistants(root=document,route=''){
  const page=root.querySelector?.('.cg-gym-page');if(!page)return;enhanceBirthDate(root);
  if(!page.querySelector('[data-fitness-assistant]')){const tabs=page.querySelector('.cg-gym-v1124-tabs,.cg-vertical-tabs');tabs?.insertAdjacentHTML('afterend',fitnessAssistantMarkup());}
  if((route==='nutricion'||serviceRef?.get?.('tab')==='nutrition')&&!page.querySelector('[data-nutrition-assistant]')){const fit=page.querySelector('[data-fitness-assistant]');fit?.insertAdjacentHTML('afterend',nutritionAssistantMarkup());}
  const fit=page.querySelector('[data-fitness-assistant]');if(fit&&!fit.dataset.bound){fit.dataset.bound='true';fit.querySelectorAll('[data-muscle]').forEach((button)=>button.addEventListener('click',()=>button.classList.toggle('is-selected')));let plan=null;fit.querySelector('[data-fit-generate]')?.addEventListener('click',()=>{const muscles=[...fit.querySelectorAll('[data-muscle].is-selected')].map((b)=>b.dataset.muscle);plan=generateQuickRoutine({muscles,level:fit.querySelector('[data-fit-level]').value,goal:fit.querySelector('[data-fit-goal]').value,duration:fit.querySelector('[data-fit-duration]').value});fit.querySelector('[data-fit-output]').innerHTML=`<h4>${plan.title}</h4><p>${plan.impact}</p><ol>${plan.exercises.map((x)=>`<li><strong>${x.name}</strong><span>${x.sets} × ${x.reps} · ${x.rest} · ${x.intensity}</span><small>${x.cue}</small></li>`).join('')}</ol><p><strong>Calentamiento:</strong> ${plan.warmup}</p><p><strong>Progresión:</strong> ${plan.progression}</p><small>${plan.safety}</small>`;fit.querySelector('[data-fit-copy]').disabled=false;});fit.querySelector('[data-fit-copy]')?.addEventListener('click',()=>plan&&copyText(routineWhatsappText(plan,fit.querySelector('[data-fit-client]').value)));}
  const nut=page.querySelector('[data-nutrition-assistant]');if(nut&&!nut.dataset.bound){nut.dataset.bound='true';let plan=null;nut.querySelector('[data-nut-generate]')?.addEventListener('click',()=>{plan=generateNutritionDraft({weightKg:nut.querySelector('[data-nut-weight]').value,heightCm:nut.querySelector('[data-nut-height]').value,age:nut.querySelector('[data-nut-age]').value,sex:nut.querySelector('[data-nut-sex]').value,activity:nut.querySelector('[data-nut-activity]').value,goal:nut.querySelector('[data-nut-goal]').value,meals:nut.querySelector('[data-nut-meals]').value});nut.querySelector('[data-nut-output]').innerHTML=`<h4>Semana sugerida</h4><p>${plan.guidance}</p>${plan.targetCalories?`<p><strong>Referencia:</strong> ${plan.targetCalories} kcal/día · proteína ~${plan.protein.target} g/día</p>`:''}<div class="cg-meal-week">${plan.days.map((d)=>`<article><strong>${d.day}</strong><span>${d.breakfast}</span><span>${d.lunch}</span><span>${d.snack}</span><span>${d.dinner}</span></article>`).join('')}</div><small>${plan.safety}</small>`;nut.querySelector('[data-nut-copy]').disabled=false;});nut.querySelector('[data-nut-copy]')?.addEventListener('click',()=>plan&&copyText(nutritionWhatsappText(plan,nut.querySelector('[data-nut-client]').value)));}
}

function installShellInteractionGuard() {
  document.addEventListener('click',(event)=>{
    const target=event.target instanceof Element?event.target:null;if(!target)return;
    const summary=target.closest('.hf-menu-section > summary');if(summary&&matchMedia('(max-width:1023px)').matches){event.stopPropagation();window.setTimeout(()=>persistSidebarSections(document),0);return;}
    const themeButton=target.closest('#btnTema');if(themeButton){event.preventDefault();event.stopImmediatePropagation();const current=supportedTheme(Store.get().settings?.theme);Store.set({settings:{theme:current==='dark'?'light':'dark'}});return;}
    const userToggle=target.closest('#btnUserMenuToggle');if(userToggle){event.preventDefault();event.stopImmediatePropagation();const panel=document.getElementById('userMenuPanel');if(!panel)return;const opening=panel.classList.contains('hidden');panel.classList.toggle('hidden',!opening);userToggle.setAttribute('aria-expanded',String(opening));return;}
    const openPanel=document.getElementById('userMenuPanel');if(openPanel&&!openPanel.classList.contains('hidden')&&!target.closest('.hf-user-menu')) closeUserMenu();
  },true);
  document.addEventListener('toggle',(event)=>{const node=event.target;if(node instanceof HTMLDetailsElement&&node.classList.contains('hf-menu-section'))persistSidebarSections(document);},true);
  window.addEventListener('keydown',(event)=>{if(event.key==='Escape')closeUserMenu();});
  window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>syncResponsiveSidebar(document),120);});
}

function install() {
  if (installed) return;installed = true;patchRbacSelection();installShellInteractionGuard();
  document.addEventListener('input',(event)=>{const control=event.target instanceof Element?event.target.closest('[data-query-param]'):null;if(!control||!['INPUT','TEXTAREA'].includes(control.tagName))return;const key=control.dataset.queryParam;clearTimeout(timer);timer=setTimeout(()=>writeParams({[key]:control.value},{replace:true}),260);});
  document.addEventListener('change',(event)=>{const control=event.target instanceof Element?event.target.closest('[data-query-param]'):null;if(!control)return;writeParams({[control.dataset.queryParam]:control.value},{replace:true});});
  document.addEventListener('click',(event)=>{const target=event.target instanceof Element?event.target:null;const pageTrigger=target?.closest('[data-page],[data-sort],[data-view],[data-tab]');if(pageTrigger){const patch={};if(pageTrigger.dataset.page)patch.page=pageTrigger.dataset.page;if(pageTrigger.dataset.sort)patch.sort=pageTrigger.dataset.sort;if(pageTrigger.dataset.view)patch.view=pageTrigger.dataset.view;if(pageTrigger.dataset.tab)patch.tab=pageTrigger.dataset.tab;writeParams(patch,{replace:false});}const gymTab=target?.closest('[data-gym-tab]');if(gymTab)writeParams({tab:gymTab.dataset.gymTab},{replace:false});const gymMember=target?.closest('[data-gym-member]');if(gymMember)writeParams({member:gymMember.dataset.gymMember,tab:'assessments'},{replace:false});const carePatient=target?.closest('[data-care-patient]');if(carePatient)writeParams({patient:carePatient.dataset.carePatient,tab:'history'},{replace:false});});
  window.addEventListener('popstate',()=>{lastAppliedDeepLink='';window.setTimeout(()=>{if(!serviceRef)return;const current=serviceRef.current();if(current.route==='veterinaria'){window.location.reload();return;}applyDeepLink(document,current.params,current.route);},0);});
}

function applyDeepLink(root, params, route) {
  const signature=`${route}|${params.tab||''}|${params.patient||''}|${params.member||''}`;if(signature===lastAppliedDeepLink)return;
  const action=()=>{if(['gimnasio','rutinas','nutricion'].includes(route)){const tab=params.tab;const tabButton=tab?root.querySelector(`[data-gym-tab="${CSS.escape(tab)}"]`):null;if(tabButton&&!tabButton.classList.contains('active')){lastAppliedDeepLink=signature;tabButton.click();return;}const member=params.member;const memberButton=member?root.querySelector(`[data-gym-member="${CSS.escape(member)}"]`):null;if(memberButton){lastAppliedDeepLink=signature;memberButton.click();return;}}if(route==='salud'){const patient=params.patient;const patientButton=patient?root.querySelector(`[data-care-patient="${CSS.escape(patient)}"]`):null;if(patientButton){lastAppliedDeepLink=signature;patientButton.click();return;}}lastAppliedDeepLink=signature;};requestAnimationFrame(action);
}

export const QueryParamEnhancer = {
  mount(root, UrlStateService) {
    serviceRef=UrlStateService;install();ensureSpecialistRoles();const current=UrlStateService.current();const params=current.params;const controls=[...root.querySelectorAll('input[name],select[name],textarea[name],input[type="search"]')];const claimed=new Set();controls.forEach((control)=>{const key=parameterFor(control);if(!key||claimed.has(`${key}:${control.form?.id||'page'}`))return;control.dataset.queryParam=key;claimed.add(`${key}:${control.form?.id||'page'}`);if(params[key]!==undefined&&String(control.value||'')!==String(params[key]))control.value=params[key];});root.querySelectorAll('[data-query-href]').forEach((node)=>{const route=node.dataset.route||current.route;let paramsForLink={};try{paramsForLink=JSON.parse(node.dataset.queryHref||'{}');}catch{/* ignore */}node.setAttribute('href',UrlStateService.href(route,paramsForLink));});syncThemeControls(root);syncResponsiveSidebar(root);if(current.route==='admin')enhanceDemoModulePicker(root);if(['gimnasio','rutinas','nutricion'].includes(current.route))enhanceFitnessAssistants(root,current.route);applyDeepLink(root,params,current.route);
  }
};