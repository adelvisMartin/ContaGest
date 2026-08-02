import './styles/tailwind.css';
import './styles/precision-ledger.css';
import './styles/enterprise-refinement.css';
import './styles/compact-enterprise-v1110.css';
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

import { ModuleRuntimePage } from './pages/ModuleRuntimePage.js';

const pageModules = import.meta.glob(['./pages/*Page.js', './pages/*Page.jsx']);
const pageRegistry = {
  dashboard:['./pages/DashboardPage.js','DashboardPage'],
  cotizacion:['./pages/QuotePage.js','QuotePage'],
  clientes:['./pages/ClientsPage.js','ClientsPage'],
  ventas:['./pages/SalesPage.js','SalesPage'],
  inventario:['./pages/InventoryPage.js','InventoryPage'],
  tributos:['./pages/TaxesPage.js','TaxesPage'],
  normativa:['./pages/RegulatoryPage.js','RegulatoryPage'],
  historial:['./pages/HistoryPage.js','HistoryPage'],
  reportes:['./pages/ReportsPage.js','ReportsPage'],
  contabilidad:['./pages/LedgerPage.js','LedgerPage'],
  'libro-mayor':['./pages/GeneralLedgerPage.js','GeneralLedgerPage'],
  'balance-sumas-saldos':['./pages/TrialBalancePage.js','TrialBalancePage'],
  'hoja-trabajo':['./pages/WorksheetPage.js','WorksheetPage'],
  'estados-financieros':['./pages/FinancialStatementsPage.js','FinancialStatementsPage'],
  'cierre-contable':['./pages/AccountingClosePage.js','AccountingClosePage'],
  bancos:['./pages/BankingPage.js','BankingPage'],
  nomina:['./pages/PayrollPage.js','PayrollPage'],
  proveedores:['./pages/SuppliersPage.js','SuppliersPage'],
  compras:['./pages/PurchasesPage.js','PurchasesPage'],
  auditoria:['./pages/AuditPage.js','AuditPage'],
  configuracion:['./pages/SettingsPage.js','SettingsPage'],
  ayuda:['./pages/HelpPage.js','HelpPage'],
  tasks:['./pages/TasksPage.js','TasksPage'],
  profile:['./pages/ProfilePage.js','ProfilePage'],
  mobile:['./pages/MobilePreviewPage.js','MobilePreviewPage'],
  'libro-ventas':['./pages/SalesBookPage.js','SalesBookPage'],
  marca:['./pages/BrandGuidelinesPage.js','BrandGuidelinesPage'],
  admin:['./pages/AdminPanelPage.js','AdminPanelPage'],
  backend:['./pages/BackendPage.js','BackendPage'],
  vistas:['./pages/ModuleCatalogPage.js','ModuleCatalogPage'],
  login:['./pages/LoginPage.js','LoginPage'],
  'plan-cuentas':['./pages/ChartAccountsPage.js','ChartAccountsPage'],
  rrhh:['./pages/HrDashboardPage.js','HrDashboardPage'],
  analytics:['./pages/AnalyticsPage.js','AnalyticsPage'],
  qr:['./pages/QrBarcodePage.js','QrBarcodePage'],
  'inventario-scan':['./pages/InventoryScannerPage.js','InventoryScannerPage'],
  pedidos:['./pages/FoodOrdersPage.js','FoodOrdersPage'],
  'pos-sede':['./pages/FastFoodPosPage.js','FastFoodPosPage'],
  'tracking-pedidos':['./pages/OrderTrackingPage.js','OrderTrackingPage'],
  'delivery-mapa':['./pages/DeliveryMapPage.js','DeliveryMapPage'],
  'asistente-ia':['./pages/AiAssistantPage.js','AiAssistantPage'],
  soporte:['./pages/SupportCtaPage.js','SupportCtaPage'],
  'demo-control':['./pages/DemoControlPage.js','DemoControlPage'],
  'modulos-madurez':['./pages/ModuleMaturityPage.js','ModuleMaturityPage'],
  'reglas-negocio':['./pages/BusinessRulesPage.js','BusinessRulesPage'],
  licencias:['./pages/LicensesPage.js','LicensesPage'],
  'importacion-data':['./pages/DataImportPage.js','DataImportPage'],
  kardex:['./pages/KardexPage.js','KardexPage'],
  'normativa-contable':['./pages/AccountingStandardsPage.js','AccountingStandardsPage'],
  pretesting:['./pages/PretestingDashboardPage.js','PretestingDashboardPage'],
  salud:['./pages/HealthcarePage.js','HealthcarePage'],
  veterinaria:['./pages/VeterinaryClinicPage.jsx','VeterinaryClinicPage'],
  gimnasio:['./pages/GymManagementPage.js','GymManagementPage'],
  rutinas:['./pages/GymManagementPage.js','GymManagementPage'],
  nutricion:['./pages/GymManagementPage.js','GymManagementPage'],
  mensajes:['./pages/CommunicationTemplatesPage.js','CommunicationTemplatesPage']
};
const loadedPages = new Map();

async function loadPage(route) {
  if (loadedPages.has(route)) return loadedPages.get(route);
  const definition = pageRegistry[route];
  if (!definition) return null;
  const importer = pageModules[definition[0]];
  if (!importer) throw new Error(`No se encontró el módulo de ruta: ${route}`);
  const module = await importer();
  const page = module[definition[1]];
  if (!page) throw new Error(`El módulo ${definition[0]} no exporta ${definition[1]}`);
  loadedPages.set(route, page);
  return page;
}

const CORE_LICENSE_ROUTES = new Set(['dashboard','profile','ayuda','soporte','login']);
const REACT_MANAGED_ROUTES = new Set(['veterinaria']);
const originalCanAccessRoute = AccessControlService.canAccessRoute.bind(AccessControlService);
AccessControlService.canAccessRoute = (state, route) => {
  const license = state?.activeLicense;
  if (!license) return originalCanAccessRoute(state, route);
  if (CORE_LICENSE_ROUTES.has(route)) return true;
  return license.status === 'active'
    && (!license.expiresAt || new Date(license.expiresAt).getTime() > Date.now())
    && Array.isArray(license.modules)
    && license.modules.includes(route);
};

const app = document.getElementById('app');
let rendering = false;
let renderPending = false;
let autoBcvStarted = false;
let globalKeysBound = false;
let lastRoute = null;
let mountedPage = null;
let lastShellSignature = '';
const lastAutoSyncByRoute = new Map();

async function resolvePage(route) {
  const page = await loadPage(route);
  if (page) return { page, route };
  if (String(route || '').startsWith('stitch-')) {
    return { page:{ render:(state)=>ModuleRuntimePage.render(state,route), mount:(state,context)=>ModuleRuntimePage.mount(state,context,route) }, route };
  }
  return { page:await loadPage('dashboard'), route:'dashboard' };
}

function shellSignature(state, route) {
  return JSON.stringify({
    route,
    theme:state.settings?.theme,
    lang:state.settings?.lang,
    mode:state.settings?.businessMode,
    collapsed:state.settings?.sidebarCollapsed,
    profile:[state.profile?.name,state.profile?.role,state.profile?.avatarDataUrl],
    license:[state.activeLicense?.id,state.activeLicense?.status,state.activeLicense?.expiresAt]
  });
}

function canNavigate(route) {
  const state = Store.get();
  if (!AuthService.isAuthenticated() && route !== 'login') return false;
  return AccessControlService.canAccessRoute(state, route);
}

function denyNavigation() {
  Toast.show('Este módulo no está habilitado para el usuario, rol, licencia o plan activo.', 'warning');
}

function navigate(route, params = {}, options = {}) {
  if (!route) return;
  if (!canNavigate(route)) return denyNavigation();
  const state = Store.get();
  const nav = document.getElementById('mainMenu');
  if (nav) sessionStorage.setItem('cg_sidebar_scroll_top', String(nav.scrollTop || 0));
  AnalyticsService.track('navigation', { from:state.route, to:route });
  UrlStateService.navigate(route, params, options);
}

function guardRouteEvent(event) {
  const target = event.target instanceof Element ? event.target.closest('[data-route],[data-command-route],[data-breadcrumb-route]') : null;
  const route = target?.dataset?.route || target?.dataset?.commandRoute || target?.dataset?.breadcrumbRoute;
  if (!route || canNavigate(route)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  denyNavigation();
}

document.addEventListener('click', guardRouteEvent, true);
window.addEventListener('cg:navigate', (event) => {
  const route = event.detail?.route;
  if (!route || canNavigate(route)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  denyNavigation();
}, true);

UrlStateService.bootstrap({ Store, routes:Object.keys(pageRegistry) });

function enhanceHorizontalScroll() {
  document.querySelectorAll('.table-wrap,.pl-table-wrap,.ds-table-wrap,.cgv-table-shell').forEach((wrap) => {
    if (wrap.dataset.scrollEnhanced === 'true') return;
    const table = wrap.querySelector('table');
    if (!table || table.scrollWidth <= wrap.clientWidth + 8) return;
    wrap.dataset.scrollEnhanced = 'true';
    wrap.classList.add('hf-scrollable-x');
    ['left','right'].forEach((direction) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `hf-scroll-arrow hf-scroll-${direction}`;
      button.setAttribute('aria-label', `Desplazar tabla a la ${direction === 'left' ? 'izquierda' : 'derecha'}`);
      button.innerHTML = `<i class="fa-solid fa-chevron-${direction}"></i>`;
      button.addEventListener('click', () => wrap.scrollBy({ left:direction === 'left' ? -360 : 360, behavior:'smooth' }));
      wrap.appendChild(button);
    });
  });
}

function normalizeEnterpriseVisuals(route, state) {
  document.body.dataset.activeRoute = route || 'dashboard';
  document.body.dataset.route = route || 'dashboard';
  document.body.dataset.role = String(state.profile?.role || 'guest').toLowerCase();
  document.body.dataset.businessMode = state.settings?.businessMode || 'admin';
  document.body.dataset.licensed = state.activeLicense ? 'true' : 'false';
  document.querySelectorAll('.hf-content > section, main > section').forEach((section) => {
    section.classList.add('cgx-module-standard');
    section.dataset.enterpriseRoute = route || 'dashboard';
  });
  document.querySelectorAll('.surface,.panel-soft,.ds-card,.cgv-card,.cg-enterprise-card').forEach((node)=>node.classList.add('cgx-surface-normalized'));
  document.querySelectorAll('.table-wrap,.pl-table-wrap,.ds-table-wrap,.cgv-table-shell').forEach((node)=>node.classList.add('cgx-table-normalized'));
  document.querySelectorAll('form').forEach((form)=>{ if (!form.closest('.hf-topbar') && !form.closest('.hf-sidebar')) form.classList.add('cgx-form-normalized'); });
  document.querySelectorAll('button:not([aria-label])').forEach((button)=>{
    const iconOnly = button.querySelector('i,.material-symbols-outlined') && !button.textContent.trim().replace(/[+\-×]/g,'');
    if (iconOnly) button.setAttribute('aria-label', button.dataset.route ? `Abrir ${button.dataset.route}` : 'Acción');
  });
}

function bindSidebar() {
  const sidebar=document.getElementById('sidebar');
  const backdrop=document.getElementById('sidebarBackdrop');
  const openButton=document.getElementById('btnOpenSidebar');
  const isMobile=()=>matchMedia('(max-width:1023px)').matches;
  const icon=(open)=>`<svg class="hf-menu-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="${open?'M6 6l12 12M18 6L6 18':'M4 7h16M4 12h16M4 17h16'}" /></svg>`;
  const apply=(collapsed)=>{
    const mobile=isMobile();
    sidebar?.classList.toggle('is-collapsed',collapsed);
    sidebar?.classList.toggle('-translate-x-full',collapsed);
    sidebar?.classList.toggle('translate-x-0',!collapsed);
    document.body.classList.toggle('cg-sidebar-collapsed',collapsed);
    document.body.classList.toggle('cg-menu-open',mobile&&!collapsed);
    backdrop?.classList.toggle('hidden',!mobile||collapsed);
    if(openButton){openButton.innerHTML=icon(!collapsed);openButton.setAttribute('aria-label',collapsed?'Abrir menú':'Cerrar menú');openButton.setAttribute('aria-expanded',String(!collapsed));}
  };
  const persist=(collapsed)=>{if(!isMobile())Store.set({settings:{...Store.get().settings,sidebarCollapsed:collapsed}});};
  const close=(save=true)=>{apply(true);if(save)persist(true);};
  const open=(save=true)=>{apply(false);if(save)persist(false);};
  apply(isMobile()?true:Boolean(Store.get().settings?.sidebarCollapsed));
  openButton?.addEventListener('click',()=>sidebar?.classList.contains('is-collapsed')||document.body.classList.contains('cg-sidebar-collapsed')?open():close());
  document.getElementById('btnCloseSidebar')?.addEventListener('click',()=>close());
  backdrop?.addEventListener('click',()=>close(false));
  document.getElementById('mainMenu')?.addEventListener('click',(event)=>{if(isMobile()&&event.target.closest('[data-route]'))close(false);});
  return {close,isMobile};
}

function bindCommandPalette() {
  const layer=document.getElementById('commandPalette');
  const input=document.getElementById('commandSearchInput');
  const items=()=>[...document.querySelectorAll('[data-command-route]')];
  const filter=()=>{const term=String(input?.value||'').trim().toLowerCase();let visible=0;items().forEach((item)=>{const match=!term||String(item.dataset.commandKeywords||item.textContent||'').toLowerCase().includes(term);item.classList.toggle('hidden',!match);if(match)visible+=1;});document.getElementById('commandResults')?.classList.toggle('is-empty',visible===0);};
  const open=()=>{layer?.classList.remove('hidden');document.body.classList.add('cg-command-open');filter();setTimeout(()=>input?.focus(),25);};
  const close=()=>{layer?.classList.add('hidden');document.body.classList.remove('cg-command-open');if(input)input.value='';filter();};
  window.__cgOpenCommandPalette=open;
  window.__cgCloseCommandPalette=close;
  document.getElementById('btnCommandPalette')?.addEventListener('click',open);
  input?.addEventListener('input',filter);
  items().forEach((item)=>item.addEventListener('click',close));
  document.querySelectorAll('[data-command-close]').forEach((node)=>node.addEventListener('click',close));
}

function bindUserMenu() {
  const avatar=document.getElementById('btnUserMenu');
  const panel=document.getElementById('userMenuPanel');
  const host=avatar?.closest('.hf-user-menu');
  const close=()=>{panel?.classList.add('hidden');avatar?.setAttribute('aria-expanded','false');};
  if(host&&!document.getElementById('btnUserMenuToggle')){
    const toggle=document.createElement('button');toggle.id='btnUserMenuToggle';toggle.type='button';toggle.className='hf-user-menu-toggle';toggle.setAttribute('aria-label','Abrir opciones de usuario');toggle.innerHTML='<i class="fa-solid fa-chevron-down"></i>';
    toggle.addEventListener('click',(event)=>{event.stopPropagation();panel?.classList.toggle('hidden');avatar?.setAttribute('aria-expanded',String(!panel?.classList.contains('hidden')));});host.insertBefore(toggle,panel);
  }
  avatar?.addEventListener('click',(event)=>{event.preventDefault();navigate('profile');close();});
  document.querySelectorAll('[data-user-action]').forEach((button)=>button.addEventListener('click',(event)=>{
    event.preventDefault();const action=button.dataset.userAction;
    if(action==='profile')navigate('profile');if(action==='settings')navigate('configuracion');if(action==='support')navigate('soporte');
    if(action==='logout'){AuthService.logout();UrlStateService.navigate('login',{}, {replace:true});Toast.show('Sesión cerrada.','success');}
    close();
  }));
  const input=document.getElementById('avatarFileInput');
  document.getElementById('btnAvatarUpload')?.addEventListener('click',(event)=>{event.stopPropagation();input?.click();});
  input?.addEventListener('change',(event)=>{const file=event.target.files?.[0];if(!file)return;if(!file.type.startsWith('image/')||file.size>2*1024*1024)return Toast.show('Selecciona una imagen válida menor de 2 MB.','warning');const reader=new FileReader();reader.onload=()=>Store.set({profile:{...Store.get().profile,avatarDataUrl:String(reader.result||'')}});reader.readAsDataURL(file);close();});
}

function bindLayout() {
  bindSidebar();
  document.querySelectorAll('[data-quick-scroll]').forEach((button)=>button.addEventListener('click',()=>{const bar=document.getElementById('quickTabs');const direction=button.dataset.quickScroll==='left'?-1:1;bar?.scrollBy({left:direction*Math.min(420,Math.max(260,bar.clientWidth*.65)),behavior:'smooth'});}));
  document.querySelectorAll('.hf-app-brand,.hf-topbar-left>div,.login-brand').forEach((brand)=>{brand.setAttribute('role','button');brand.setAttribute('tabindex','0');brand.addEventListener('click',()=>navigate(AuthService.isAuthenticated()?'dashboard':'login'));});
  const updateSetting=(key,value)=>Store.set({settings:{...Store.get().settings,[key]:value}});
  document.getElementById('businessModeSelector')?.addEventListener('change',(event)=>updateSetting('businessMode',event.target.value));
  document.getElementById('langSelector')?.addEventListener('change',(event)=>updateSetting('lang',event.target.value));
  document.getElementById('userMenuLang')?.addEventListener('change',(event)=>updateSetting('lang',event.target.value));
  document.getElementById('userMenuTheme')?.addEventListener('change',(event)=>updateSetting('theme',event.target.value));
  document.getElementById('userReportCurrency')?.addEventListener('change',(event)=>updateSetting('reportCurrency',event.target.value));
  document.getElementById('btnTema')?.addEventListener('click',()=>{const order=['light','sky','soft-blue','spectrum','dark','enterprise','executive','finance'];const current=Store.get().settings?.theme;updateSetting('theme',order[(order.indexOf(current)+1)%order.length]||'light');});
  document.getElementById('btnActualizarTasaTop')?.addEventListener('click',async()=>{try{Toast.show('Consultando tasa BCV…','info');Store.set({bcv:await BcvService.fetchRate()});Toast.show('Tasa BCV actualizada.','success');}catch(error){Toast.show(error.message,'warning');}});
  bindCommandPalette();
  bindUserMenu();
  if(!globalKeysBound){globalKeysBound=true;window.addEventListener('keydown',(event)=>{if((event.ctrlKey||event.metaKey)&&String(event.key).toLowerCase()==='k'){event.preventDefault();document.getElementById('commandPalette')?.classList.contains('hidden')?window.__cgOpenCommandPalette?.():window.__cgCloseCommandPalette?.();}if(event.key==='Escape')window.__cgCloseCommandPalette?.();});}
}

function applyTheme(theme) {
  const themes=['dark','enterprise','executive','finance','sky','soft-blue','spectrum'];
  document.documentElement.classList.toggle('dark',theme==='dark'||theme==='enterprise');
  themes.filter((item)=>item!=='dark').forEach((item)=>document.documentElement.classList.toggle(`theme-${item}`,theme===item));
  document.documentElement.classList.toggle('enterprise',theme==='enterprise');
}

function createPageContext(state, route) {
  return { Store,Toast,Modal,Loading,navigate,render,SupabaseSyncService,AccessControlService,MuiRuntime,UrlStateService,query:UrlStateService.getParams(),state:{...state,route} };
}

async function render({force=false}={}) {
  if(rendering){renderPending=true;return;}
  rendering=true;
  try{
    const state=Store.get();
    const requestedRoute=state.route||'dashboard';
    if(AuthService.isAuthenticated() && requestedRoute!=='login' && !AccessControlService.canAccessRoute(state,requestedRoute)){
      denyNavigation();
      UrlStateService.navigate('dashboard',{}, {replace:true});
      return;
    }
    const effectiveRoute=!AuthService.isAuthenticated()&&requestedRoute!=='login'?'login':requestedRoute;
    const {page,route}=await resolvePage(effectiveRoute);
    const signature=shellSignature(state,route);
    const preserve=!force&&route===lastRoute&&page===mountedPage&&REACT_MANAGED_ROUTES.has(route)&&signature===lastShellSignature&&document.getElementById('veterinaryClinicRoot');
    applyTheme(state.settings?.theme||'light');
    if(preserve){
      document.body.dataset.route=route;
      page.update?.({...state,route},createPageContext(state,route));
      return;
    }
    const oldNav=document.getElementById('mainMenu');
    const preservedSidebarTop=oldNav?.scrollTop??Number(sessionStorage.getItem('cg_sidebar_scroll_top')||0);
    const viewState={...state,route};
    const pageHtml=page.render(viewState,{query:UrlStateService.getParams(),UrlStateService});
    app.innerHTML=page.standalone&&route==='login'?pageHtml:Shell(viewState,pageHtml);
    document.title=`${route==='dashboard'?'Inicio':route.replaceAll('-',' ')} · ContaGest-VE`;
    AnalyticsService.trackPageView(route,{title:document.title});
    bindLayout();
    requestAnimationFrame(()=>{const nav=document.getElementById('mainMenu');if(nav)nav.scrollTop=preservedSidebarTop;});
    const context=createPageContext(state,route);
    QueryParamEnhancer.mount(app,UrlStateService);
    MuiRuntime.mountAll(context);
    page.mount?.(viewState,context);
    if(localStorage.getItem('contagest_auto_sync_enabled')==='true'){
      const previous=lastAutoSyncByRoute.get(route)||0;
      if(Date.now()-previous>120000){lastAutoSyncByRoute.set(route,Date.now());SupabaseSyncService.pullRoute(route,{Store,Toast,silent:true}).catch((error)=>console.warn('[ContaGest Sync]',error));}
    }
    applyTranslations(state.settings?.lang||'es');
    enhanceHorizontalScroll();
    normalizeEnterpriseVisuals(route,state);
    lastRoute=route;
    mountedPage=page;
    lastShellSignature=signature;
  }finally{
    rendering=false;
    if(renderPending){renderPending=false;queueMicrotask(()=>render().catch((error)=>console.error('[ContaGest Render]',error)));}
  }
}

Store.subscribe(()=>render().catch((error)=>console.error('[ContaGest Render]',error)));
window.addEventListener('cg:loading',(event)=>event.detail?.active?Loading.mount(event.detail.message):Loading.unmount());
AnalyticsService.startSession();
render({force:true}).catch((error)=>console.error('[ContaGest Bootstrap]',error));

async function autoRefreshBcvOnce(){if(autoBcvStarted)return;autoBcvStarted=true;const state=Store.get();if(!BcvService.shouldRefresh(state.bcv))return;try{Store.set({bcv:await BcvService.fetchRate({preferCache:true,allowStale:true})});}catch(error){console.warn('[ContaGest BCV]',error);}}
setTimeout(autoRefreshBcvOnce,700);

if('serviceWorker' in navigator){const local=['localhost','127.0.0.1'].includes(location.hostname);window.addEventListener('load',()=>{if(local){navigator.serviceWorker.getRegistrations?.().then((items)=>items.forEach((item)=>item.unregister())).catch(()=>null);window.caches?.keys?.().then((keys)=>keys.forEach((key)=>caches.delete(key))).catch(()=>null);}else navigator.serviceWorker.register('./sw.js').catch(()=>null);});}
window.addEventListener('error',(event)=>console.error('[ContaGest Runtime]',event.error||event.message));
window.addEventListener('unhandledrejection',(event)=>console.error('[ContaGest Promise]',event.reason));

