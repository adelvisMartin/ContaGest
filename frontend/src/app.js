import './styles/erp-runtime.css';
import { Store } from './state/store.js';
import { applyTranslations } from './i18n/useTranslate.js';
import { Shell } from './components/layout.js';
import { Toast } from './components/toast.js';
import { Modal } from './components/modal.js';
import { Loading } from './components/loading.js';
import { MuiRuntime } from './components/muiRuntime.js';
import { BcvService } from './services/bcvService.js';
import { AnalyticsService } from './services/analyticsService.js';
import { AuthService } from './services/authService.js';
import { SupabaseSyncService } from './services/supabaseSyncService.js';
import { AccessControlService } from './services/accessControlService.js';
import { UrlStateService } from './services/urlStateService.js';
import { QueryParamEnhancer } from './services/queryParamEnhancer.js';
import { THEME_OPTIONS } from './data/themeCatalog.js';
import { PAGE_REGISTRY as pageRegistry } from './data/pageRegistry.js';
import { landingForMode } from './data/moduleCatalog.js';
import { ModuleRuntimePage } from './pages/ModuleRuntimePage.js';
import { createPageResolver } from './runtime/pageResolver.js';

const pageModules=import.meta.glob(['./pages/*Page.js','./pages/*Page.jsx','./pages/*Page*.jsx','!./pages/ModuleRuntimePage.js']);
const CORE_LICENSE=new Set(['dashboard','profile','ayuda','soporte','login']),REACT_MANAGED_ROUTES=new Set(['veterinaria']);
const {resolvePage}=createPageResolver({registry:pageRegistry,modules:pageModules,moduleRuntimePage:ModuleRuntimePage});
const originalCanAccess=AccessControlService.canAccessRoute.bind(AccessControlService);
AccessControlService.canAccessRoute=(state,route)=>{
  const session=AuthService.getSession();
  const license=state?.activeLicense;
  const validLicense=Boolean(license?.status==='active'&&(!license.expiresAt||new Date(license.expiresAt)>new Date()));
  const qaClient=Boolean(session?.audience==='client'&&license?.qaMode===true&&validLicense);
  if(qaClient)return CORE_LICENSE.has(route)||(Array.isArray(license.modules)&&license.modules.includes(route));
  const allowedByRole=originalCanAccess(state,route);
  if(!allowedByRole)return false;
  const enforceLicense=Boolean(license&&session?.audience==='client');
  if(!enforceLicense)return true;
  if(CORE_LICENSE.has(route))return true;
  return validLicense&&Array.isArray(license.modules)&&license.modules.includes(route);
};
const app=document.getElementById('app');
let rendering=false,pending=false,renderGeneration=0,lastRoute=null,mountedPage=null,lastSignature='',globalKeys=false,outsideUserMenu=false,autoBcv=false,appReady=false;
const lastAutoSync=new Map();
const rememberProtectedRoute=(route)=>{if(route&&route!=='login'&&pageRegistry[route])sessionStorage.setItem('cg_post_login_route',route);};
function applyAuthenticatedSession(session){
  if(!session?.tenantId)return;
  const current=Store.get();
  const experience=session.experienceProfile||null;
  const licenseMode=experience?.mode||session.license?.businessSector;
  Store.set({
    profile:{...current.profile,name:session.user?.fullName||session.user?.name||current.profile?.name||'Usuario',email:session.user?.email||current.profile?.email||'',role:session.user?.role||current.profile?.role||'client',permissions:Array.isArray(session.user?.permissions)?session.user.permissions:(current.profile?.permissions||[]),branch:session.tenant?.name||current.profile?.branch||'Empresa',plan:session.license?.plan||session.tenant?.plan||current.profile?.plan||'Enterprise'},
    activeLicense:session.license||null,
    experienceProfile:experience,
    settings:{...current.settings,companyName:session.tenant?.name||current.settings?.companyName,companyRif:session.tenant?.rif||current.settings?.companyRif,...(licenseMode?{businessMode:licenseMode}:{})}
  });
}
const signature=(s,r)=>JSON.stringify({r,theme:s.settings?.theme,lang:s.settings?.lang,mode:s.settings?.businessMode,support:s.settings?.supportWidget,collapsed:s.settings?.sidebarCollapsed,profile:[s.profile?.name,s.profile?.role,s.profile?.avatarDataUrl],license:[s.activeLicense?.id,s.activeLicense?.status,s.activeLicense?.expiresAt,s.activeLicense?.qaMode],experience:[s.experienceProfile?.mode,s.experienceProfile?.landingRoute]});
const canNavigate=(route)=>{const s=Store.get();return (AuthService.isAuthenticated()||route==='login')&&AccessControlService.canAccessRoute(s,route);};
const experienceHome=(state=Store.get())=>{
  const mode=state?.experienceProfile?.mode||state?.settings?.businessMode||'admin';
  const candidates=[state?.experienceProfile?.landingRoute,landingForMode(mode),'dashboard'].filter(Boolean);
  return candidates.find((route)=>pageRegistry[route]&&AccessControlService.canAccessRoute(state,route))||'dashboard';
};
const deny=()=>Toast.show('Este módulo no está habilitado para el usuario, rol, licencia o plan activo.','warning');
function navigate(route,params={},options={}){if(!route)return;if(!canNavigate(route))return deny();const s=Store.get(),nav=document.getElementById('mainMenu');if(nav)sessionStorage.setItem('cg_sidebar_scroll_top',String(nav.scrollTop||0));AnalyticsService.track('navigation',{from:s.route,to:route});UrlStateService.navigate(route,params,options);}
document.addEventListener('click',(event)=>{const target=event.target instanceof Element?event.target.closest('[data-route],[data-command-route],[data-breadcrumb-route]'):null;const route=target?.dataset.route||target?.dataset.commandRoute||target?.dataset.breadcrumbRoute;if(route&&!canNavigate(route)){event.preventDefault();event.stopImmediatePropagation();deny();}},true);
window.addEventListener('cg:navigate',(event)=>{const route=event.detail?.route;if(!route)return;if(!canNavigate(route)){event.preventDefault();event.stopImmediatePropagation();return deny();}navigate(route,event.detail?.params||{},event.detail?.options||{});},true);
UrlStateService.bootstrap({Store,routes:Object.keys(pageRegistry)});
function normalizeVisuals(route,state){document.body.dataset.activeRoute=route||'dashboard';document.body.dataset.route=route||'dashboard';document.body.dataset.role=String(state.profile?.role||'guest').toLowerCase();document.body.dataset.businessMode=state.settings?.businessMode||'admin';document.body.dataset.licensed=state.activeLicense?'true':'false';document.getElementById('pages')?.setAttribute('data-rendered-route',route||'dashboard');document.querySelectorAll('.hf-content > section, main > section').forEach((n)=>{n.classList.add('cgx-module-standard');n.dataset.enterpriseRoute=route||'dashboard';});document.querySelectorAll('.surface,.panel-soft,.ds-card,.cgv-card,.cg-enterprise-card').forEach((n)=>n.classList.add('cgx-surface-normalized'));document.querySelectorAll('.table-wrap,.pl-table-wrap,.ds-table-wrap,.cgv-table-shell').forEach((n)=>n.classList.add('cgx-table-normalized'));document.querySelectorAll('form').forEach((f)=>{if(!f.closest('.hf-topbar')&&!f.closest('.hf-sidebar'))f.classList.add('cgx-form-normalized');});}
function enhanceTables(){document.querySelectorAll('.table-wrap,.pl-table-wrap,.ds-table-wrap,.cgv-table-shell').forEach((wrap)=>{const table=wrap.querySelector('table');if(table&&table.scrollWidth>wrap.clientWidth+8)wrap.classList.add('hf-scrollable-x');});}
function bindSidebar(){const sidebar=document.getElementById('sidebar'),backdrop=document.getElementById('sidebarBackdrop'),toggle=document.getElementById('btnOpenSidebar'),mobile=()=>matchMedia('(max-width:1023px)').matches;const apply=(collapsed)=>{const m=mobile();sidebar?.classList.toggle('is-collapsed',collapsed);sidebar?.classList.toggle('-translate-x-full',collapsed);sidebar?.classList.toggle('translate-x-0',!collapsed);document.body.classList.toggle('cg-sidebar-collapsed',collapsed);document.body.classList.toggle('cg-menu-open',m&&!collapsed);backdrop?.classList.toggle('hidden',!m||collapsed);toggle?.setAttribute('aria-expanded',String(!collapsed));toggle?.setAttribute('aria-label',collapsed?'Abrir menú':'Menú abierto');toggle?.setAttribute('title',collapsed?'Abrir menú':'Menú abierto');};const persist=(v)=>{if(!mobile())Store.set({settings:{...Store.get().settings,sidebarCollapsed:v}});};const close=(save=true)=>{apply(true);if(save)persist(true);},open=(save=true)=>{apply(false);if(save)persist(false);};const currentRoute=String(Store.get().route||'dashboard'),renderedRoute=String(document.body.dataset.route||'');const preserveMobileOpen=mobile()&&document.body.classList.contains('cg-menu-open')&&renderedRoute===currentRoute;apply(mobile()?!preserveMobileOpen:Boolean(Store.get().settings?.sidebarCollapsed));toggle?.addEventListener('click',()=>sidebar?.classList.contains('is-collapsed')||document.body.classList.contains('cg-sidebar-collapsed')?open():close());document.getElementById('btnCloseSidebar')?.addEventListener('click',()=>close());backdrop?.addEventListener('click',()=>close(false));}
function bindPalette(){const layer=document.getElementById('commandPalette'),input=document.getElementById('commandSearchInput'),items=()=>[...document.querySelectorAll('[data-command-route]')];const filter=()=>{const term=String(input?.value||'').trim().toLowerCase();let visible=0;items().forEach((i)=>{const match=!term||String(i.dataset.commandKeywords||i.textContent||'').toLowerCase().includes(term);i.classList.toggle('hidden',!match);if(match)visible++;});document.getElementById('commandResults')?.classList.toggle('is-empty',visible===0);};const open=()=>{layer?.classList.remove('hidden');document.body.classList.add('cg-command-open');filter();setTimeout(()=>input?.focus(),25);},close=()=>{layer?.classList.add('hidden');document.body.classList.remove('cg-command-open');if(input)input.value='';filter();};window.__cgOpenCommandPalette=open;window.__cgCloseCommandPalette=close;document.getElementById('btnCommandPalette')?.addEventListener('click',open);input?.addEventListener('input',filter);items().forEach((i)=>i.addEventListener('click',close));document.querySelectorAll('[data-command-close]').forEach((n)=>n.addEventListener('click',close));}
function bindUserMenu(){const avatar=document.getElementById('btnUserMenu'),panel=document.getElementById('userMenuPanel'),close=()=>{panel?.classList.add('hidden');avatar?.setAttribute('aria-expanded','false');};avatar?.addEventListener('click',(e)=>{e.preventDefault();e.stopPropagation();panel?.classList.toggle('hidden');avatar?.setAttribute('aria-expanded',String(!panel?.classList.contains('hidden')));});if(!outsideUserMenu){outsideUserMenu=true;document.addEventListener('click',(e)=>{const p=document.getElementById('userMenuPanel'),a=document.getElementById('btnUserMenu');if(!p||p.classList.contains('hidden')||(e.target instanceof Node&&(p.contains(e.target)||a?.contains(e.target))))return;p.classList.add('hidden');a?.setAttribute('aria-expanded','false');});}document.querySelectorAll('[data-user-action]').forEach((b)=>b.addEventListener('click',(e)=>{e.preventDefault();const action=b.dataset.userAction;if(action==='profile')navigate('profile');if(action==='settings')navigate('configuracion');if(action==='support')navigate('soporte');if(action==='logout'){AuthService.logout();UrlStateService.navigate('login',{}, {replace:true});Toast.show('Sesión cerrada.','success');}close();}));const input=document.getElementById('avatarFileInput');document.getElementById('btnAvatarUpload')?.addEventListener('click',(e)=>{e.stopPropagation();input?.click();});input?.addEventListener('change',(e)=>{const file=e.target.files?.[0];if(!file)return;if(!file.type.startsWith('image/')||file.size>2*1024*1024)return Toast.show('Selecciona una imagen válida menor de 2 MB.','warning');const reader=new FileReader();reader.onload=()=>Store.set({profile:{...Store.get().profile,avatarDataUrl:String(reader.result||'')}});reader.readAsDataURL(file);close();});}
function bindLayout(){bindSidebar();document.querySelectorAll('[data-quick-scroll]').forEach((b)=>b.addEventListener('click',()=>{const bar=document.getElementById('quickTabs'),dir=b.dataset.quickScroll==='left'?-1:1;bar?.scrollBy({left:dir*Math.min(420,Math.max(260,bar.clientWidth*.65)),behavior:'smooth'});}));document.querySelectorAll('.hf-app-brand,.hf-header-brand,.login-brand').forEach((brand)=>{const go=()=>navigate(AuthService.isAuthenticated()?experienceHome(Store.get()):'login');brand.addEventListener('click',go);brand.addEventListener('keydown',(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});});const set=(key,value)=>Store.set({settings:{...Store.get().settings,[key]:value}});[['businessModeSelector','businessMode'],['langSelector','lang'],['userMenuLang','lang'],['userMenuTheme','theme'],['userReportCurrency','reportCurrency'],['userSupportWidget','supportWidget']].forEach(([id,key])=>document.getElementById(id)?.addEventListener('change',(e)=>set(key,e.target.value)));document.getElementById('btnTema')?.addEventListener('click',()=>{const order=THEME_OPTIONS.map((i)=>i.key),current=Store.get().settings?.theme;set('theme',order[(order.indexOf(current)+1)%order.length]||'light');});document.getElementById('btnActualizarTasaTop')?.addEventListener('click',async()=>{try{Toast.show('Consultando tasa BCV…','info');Store.set({bcv:await BcvService.fetchRate()});Toast.show('Tasa BCV actualizada.','success');}catch(e){Toast.show(e.message,'warning');}});bindPalette();bindUserMenu();if(!globalKeys){globalKeys=true;window.addEventListener('keydown',(e)=>{if((e.ctrlKey||e.metaKey)&&String(e.key).toLowerCase()==='k'){e.preventDefault();document.getElementById('commandPalette')?.classList.contains('hidden')?window.__cgOpenCommandPalette?.():window.__cgCloseCommandPalette?.();}if(e.key==='Escape'){window.__cgCloseCommandPalette?.();document.getElementById('userMenuPanel')?.classList.add('hidden');document.getElementById('btnUserMenu')?.setAttribute('aria-expanded','false');}});}}
function applyTheme(theme){const normalized=theme==='dark'?'dark':'light';document.documentElement.classList.toggle('dark',normalized==='dark');document.documentElement.dataset.theme=normalized;}
const context=(state,route)=>({Store,Toast,Modal,Loading,navigate,render,SupabaseSyncService,AccessControlService,MuiRuntime,UrlStateService,query:UrlStateService.getParams(),state:{...state,route}});
const renderSnapshotMatches=(snapshot,requested,generation)=>{const current=Store.get();return generation===renderGeneration&&(current.route||'dashboard')===requested&&Number(current.navigation?.revision||0)===Number(snapshot.navigation?.revision||0);};
async function render({force=false}={}){
  const generation=++renderGeneration;
  if(rendering){pending=true;return;}
  rendering=true;
  try{
    const state=Store.get(),requested=state.route||'dashboard';
    if(AuthService.isAuthenticated()&&requested!=='login'&&!AccessControlService.canAccessRoute(state,requested)){deny();UrlStateService.navigate(experienceHome(state),{}, {replace:true});return;}
    if(!AuthService.isAuthenticated()&&requested!=='login')rememberProtectedRoute(requested);
    const effective=!AuthService.isAuthenticated()&&requested!=='login'?'login':requested;
    const {page,route}=await resolvePage(effective);
    if(!renderSnapshotMatches(state,requested,generation)){pending=true;return;}
    const sig=signature(state,route),preserve=!force&&route===lastRoute&&page===mountedPage&&REACT_MANAGED_ROUTES.has(route)&&sig===lastSignature&&document.getElementById('veterinaryClinicRoot');
    applyTheme(state.settings?.theme||'light');
    if(preserve){document.body.dataset.route=route;document.getElementById('pages')?.setAttribute('data-rendered-route',route);page.update?.({...state,route},context(state,route));return;}
    const oldNav=document.getElementById('mainMenu'),scroll=oldNav?.scrollTop??Number(sessionStorage.getItem('cg_sidebar_scroll_top')||0),view={...state,route},html=page.render(view,{query:UrlStateService.getParams(),UrlStateService});
    if(!renderSnapshotMatches(state,requested,generation)){pending=true;return;}
    app.innerHTML=page.standalone&&route==='login'?html:Shell(view,html);
    document.title=`${route==='dashboard'?'Inicio':route.replaceAll('-',' ')} · ContaGest-VE`;
    AnalyticsService.trackPageView(route,{title:document.title});
    bindLayout();
    requestAnimationFrame(()=>{const nav=document.getElementById('mainMenu');if(nav)nav.scrollTop=scroll;});
    const ctx=context(state,route);
    QueryParamEnhancer.mount(app,UrlStateService);
    MuiRuntime.mountAll(ctx);
    page.mount?.(view,ctx);
    if(localStorage.getItem('contagest_auto_sync_enabled')==='true'){const prev=lastAutoSync.get(route)||0;if(Date.now()-prev>120000){lastAutoSync.set(route,Date.now());SupabaseSyncService.pullRoute(route,{Store,Toast,silent:true}).catch((e)=>console.warn('[ContaGest Sync]',e));}}
    applyTranslations(state.settings?.lang||'es');
    enhanceTables();
    normalizeVisuals(route,state);
    lastRoute=route;mountedPage=page;lastSignature=sig;
  }finally{
    rendering=false;
    if(pending){pending=false;queueMicrotask(()=>render({force:true}).catch((e)=>console.error('[ContaGest Render]',e)));}
  }
}
Store.subscribe(()=>{if(appReady)render().catch((e)=>console.error('[ContaGest Render]',e));});
window.addEventListener('cg:loading',(e)=>e.detail?.active?Loading.mount(e.detail.message):Loading.unmount());
window.addEventListener('cg:auth-expired',()=>{const current=Store.get().route||'dashboard';rememberProtectedRoute(current);UrlStateService.navigate('login',{}, {replace:true});if(appReady)Toast.show('Tu sesión venció. Inicia sesión nuevamente para continuar.','warning');});
AnalyticsService.startSession();
async function bootstrapApp(){
  const requested=Store.get().route||'dashboard';
  if(AuthService.isAuthenticated()){
    try{applyAuthenticatedSession(await AuthService.me());}
    catch(error){if(requested!=='login')rememberProtectedRoute(requested);if(Number(error?.status)===401)UrlStateService.navigate('login',{}, {replace:true});else console.warn('[ContaGest Session Bootstrap]',error);}
  }
  appReady=true;
  await render({force:true});
}
bootstrapApp().catch((e)=>{appReady=true;console.error('[ContaGest Bootstrap]',e);render({force:true}).catch((error)=>console.error('[ContaGest Render]',error));});
setTimeout(async()=>{if(autoBcv)return;autoBcv=true;const state=Store.get();if(!BcvService.shouldRefresh(state.bcv))return;try{Store.set({bcv:await BcvService.fetchRate({preferCache:true,allowStale:true})});}catch(e){console.warn('[ContaGest BCV]',e);}},700);
if('serviceWorker' in navigator){const local=['localhost','127.0.0.1'].includes(location.hostname);window.addEventListener('load',()=>{if(local){navigator.serviceWorker.getRegistrations?.().then((items)=>items.forEach((item)=>item.unregister())).catch(()=>null);window.caches?.keys?.().then((keys)=>keys.forEach((key)=>caches.delete(key))).catch(()=>null);}else navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then((registration)=>registration.update()).catch(()=>null);});let swReloading=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(swReloading)return;swReloading=true;location.reload();});}
window.addEventListener('error',(e)=>console.error('[ContaGest Runtime]',e.error||e.message));
window.addEventListener('unhandledrejection',(e)=>console.error('[ContaGest Promise]',e.reason));
