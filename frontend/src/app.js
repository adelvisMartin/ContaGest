import './styles/tailwind.css';
import './styles/precision-ledger.css';
import './styles/enterprise-refinement.css';
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

import { DashboardPage } from './pages/DashboardPage.js';
import { QuotePage } from './pages/QuotePage.js';
import { ClientsPage } from './pages/ClientsPage.js';
import { SalesPage } from './pages/SalesPage.js';
import { InventoryPage } from './pages/InventoryPage.js';
import { TaxesPage } from './pages/TaxesPage.js';
import { RegulatoryPage } from './pages/RegulatoryPage.js';
import { HistoryPage } from './pages/HistoryPage.js';
import { ReportsPage } from './pages/ReportsPage.js';
import { LedgerPage } from './pages/LedgerPage.js';
import { BankingPage } from './pages/BankingPage.js';
import { PayrollPage } from './pages/PayrollPage.js';
import { SuppliersPage } from './pages/SuppliersPage.js';
import { PurchasesPage } from './pages/PurchasesPage.js';
import { AuditPage } from './pages/AuditPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { HelpPage } from './pages/HelpPage.js';
import { TasksPage } from './pages/TasksPage.js';
import { ProfilePage } from './pages/ProfilePage.js';
import { MobilePreviewPage } from './pages/MobilePreviewPage.js';
import { SalesBookPage } from './pages/SalesBookPage.js';
import { BrandGuidelinesPage } from './pages/BrandGuidelinesPage.js';
import { AdminPanelPage } from './pages/AdminPanelPage.js';
import { BackendPage } from './pages/BackendPage.js';
import { ModuleCatalogPage } from './pages/ModuleCatalogPage.js';
import { ModuleRuntimePage } from './pages/ModuleRuntimePage.js';
import { LoginPage } from './pages/LoginPage.js';
import { ChartAccountsPage } from './pages/ChartAccountsPage.js';
import { HrDashboardPage } from './pages/HrDashboardPage.js';
import { AnalyticsPage } from './pages/AnalyticsPage.js';
import { QrBarcodePage } from './pages/QrBarcodePage.js';
import { InventoryScannerPage } from './pages/InventoryScannerPage.js';
import { FoodOrdersPage } from './pages/FoodOrdersPage.js';
import { FastFoodPosPage } from './pages/FastFoodPosPage.js';
import { OrderTrackingPage } from './pages/OrderTrackingPage.js';
import { DeliveryMapPage } from './pages/DeliveryMapPage.js';
import { AiAssistantPage } from './pages/AiAssistantPage.js';
import { SupportCtaPage } from './pages/SupportCtaPage.js';
import { DemoControlPage } from './pages/DemoControlPage.js';
import { ModuleMaturityPage } from './pages/ModuleMaturityPage.js';
import { BusinessRulesPage } from './pages/BusinessRulesPage.js';
import { LicensesPage } from './pages/LicensesPage.js';
import { DataImportPage } from './pages/DataImportPage.js';
import { KardexPage } from './pages/KardexPage.js';
import { AccountingStandardsPage } from './pages/AccountingStandardsPage.js';
import { PretestingDashboardPage } from './pages/PretestingDashboardPage.js';
import { GeneralLedgerPage } from './pages/GeneralLedgerPage.js';
import { TrialBalancePage } from './pages/TrialBalancePage.js';
import { WorksheetPage } from './pages/WorksheetPage.js';
import { FinancialStatementsPage } from './pages/FinancialStatementsPage.js';
import { AccountingClosePage } from './pages/AccountingClosePage.js';
import { HealthcarePage } from './pages/HealthcarePage.js';
import { GymManagementPage } from './pages/GymManagementPage.js';
import { CommunicationTemplatesPage } from './pages/CommunicationTemplatesPage.js';

const pages = {
  dashboard: DashboardPage,
  cotizacion: QuotePage,
  clientes: ClientsPage,
  ventas: SalesPage,
  inventario: InventoryPage,
  tributos: TaxesPage,
  normativa: RegulatoryPage,
  historial: HistoryPage,
  reportes: ReportsPage,
  contabilidad: LedgerPage,
  'libro-mayor': GeneralLedgerPage,
  'balance-sumas-saldos': TrialBalancePage,
  'hoja-trabajo': WorksheetPage,
  'estados-financieros': FinancialStatementsPage,
  'cierre-contable': AccountingClosePage,
  bancos: BankingPage,
  nomina: PayrollPage,
  proveedores: SuppliersPage,
  compras: PurchasesPage,
  auditoria: AuditPage,
  configuracion: SettingsPage,
  ayuda: HelpPage,
  tasks: TasksPage,
  profile: ProfilePage,
  mobile: MobilePreviewPage,
  'libro-ventas': SalesBookPage,
  marca: BrandGuidelinesPage,
  admin: AdminPanelPage,
  backend: BackendPage,
  vistas: ModuleCatalogPage,
  login: LoginPage,
  'plan-cuentas': ChartAccountsPage,
  rrhh: HrDashboardPage,
  analytics: AnalyticsPage,
  qr: QrBarcodePage,
  'inventario-scan': InventoryScannerPage,
  pedidos: FoodOrdersPage,
  'pos-sede': FastFoodPosPage,
  'tracking-pedidos': OrderTrackingPage,
  'delivery-mapa': DeliveryMapPage,
  'asistente-ia': AiAssistantPage,
  soporte: SupportCtaPage,
  'demo-control': DemoControlPage,
  'modulos-madurez': ModuleMaturityPage,
  'reglas-negocio': BusinessRulesPage,
  licencias: LicensesPage,
  'importacion-data': DataImportPage,
  kardex: KardexPage,
  'normativa-contable': AccountingStandardsPage,
  pretesting: PretestingDashboardPage,
  salud: HealthcarePage,
  veterinaria: HealthcarePage,
  gimnasio: GymManagementPage,
  rutinas: GymManagementPage,
  nutricion: GymManagementPage,
  mensajes: CommunicationTemplatesPage
};

const CORE_LICENSE_ROUTES = new Set(['dashboard','profile','ayuda','soporte','login']);
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
let autoBcvStarted = false;
let globalKeysBound = false;
const lastAutoSyncByRoute = new Map();

function resolvePage(route) {
  if (pages[route]) return { page: pages[route], route };
  if (String(route || '').startsWith('stitch-')) {
    return {
      page: {
        render: (state) => ModuleRuntimePage.render(state, route),
        mount: (state, context) => ModuleRuntimePage.mount(state, context, route)
      },
      route
    };
  }
  return { page: pages.dashboard, route: 'dashboard' };
}

function navigate(route) {
  if (!route) return;
  const state = Store.get();
  if (!AccessControlService.canAccessRoute(state, route)) {
    Toast.show('Este módulo no está habilitado para el usuario, licencia o plan activo.', 'warning');
    return;
  }
  const nav = document.getElementById('mainMenu');
  if (nav) sessionStorage.setItem('cg_sidebar_scroll_top', String(nav.scrollTop || 0));
  AnalyticsService.track('navigation', { from: state.route, to: route });
  Store.set({ route });
}

window.addEventListener('cg:navigate', (event) => navigate(event.detail?.route));

function enhanceHorizontalScroll() {
  document.querySelectorAll('.table-wrap,.pl-table-wrap,.ds-table-wrap,.cgv-table-shell').forEach((wrap) => {
    if (wrap.dataset.scrollEnhanced === 'true') return;
    const table = wrap.querySelector('table');
    if (!table || table.scrollWidth <= wrap.clientWidth + 8) return;
    wrap.dataset.scrollEnhanced = 'true';
    wrap.classList.add('hf-scrollable-x');
    const createArrow = (direction) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `hf-scroll-arrow hf-scroll-${direction}`;
      button.setAttribute('aria-label', `Desplazar tabla a la ${direction === 'left' ? 'izquierda' : 'derecha'}`);
      button.innerHTML = `<i class="fa-solid fa-chevron-${direction}"></i>`;
      button.addEventListener('click', () => wrap.scrollBy({ left: direction === 'left' ? -360 : 360, behavior:'smooth' }));
      return button;
    };
    wrap.append(createArrow('left'), createArrow('right'));
  });
}

function normalizeEnterpriseVisuals(route, state) {
  document.body.dataset.activeRoute = route || 'dashboard';
  document.body.dataset.role = String(state.profile?.role || 'guest').toLowerCase();
  document.body.dataset.businessMode = state.settings?.businessMode || 'admin';
  document.body.dataset.licensed = state.activeLicense ? 'true' : 'false';
  document.querySelectorAll('.hf-content > section, main > section').forEach((section) => {
    section.classList.add('cgx-module-standard');
    section.dataset.enterpriseRoute = route || 'dashboard';
  });
  document.querySelectorAll('.surface,.panel-soft,.ds-card,.cgv-card,.cg-enterprise-card').forEach((node) => node.classList.add('cgx-surface-normalized'));
  document.querySelectorAll('.table-wrap,.pl-table-wrap,.ds-table-wrap,.cgv-table-shell').forEach((node) => node.classList.add('cgx-table-normalized'));
  document.querySelectorAll('form').forEach((form) => {
    if (!form.closest('.hf-topbar') && !form.closest('.hf-sidebar')) form.classList.add('cgx-form-normalized');
  });
  document.querySelectorAll('input.input,select.select,textarea.textarea,.mui-fallback-select').forEach((field) => field.classList.add('cgx-field-normalized'));
  document.querySelectorAll('button:not([aria-label])').forEach((button) => {
    const iconOnly = button.querySelector('i,.material-symbols-outlined') && !button.textContent.trim().replace(/[+\-×]/g, '');
    if (iconOnly) button.setAttribute('aria-label', button.dataset.route ? `Abrir ${button.dataset.route}` : 'Acción');
  });
}

function bindSidebar() {
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const openButton = document.getElementById('btnOpenSidebar');
  const isMobile = () => matchMedia('(max-width:1023px)').matches;
  const icon = (open) => `<svg class="hf-menu-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="${open ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16'}" /></svg>`;
  const apply = (collapsed) => {
    const mobile = isMobile();
    sidebar?.classList.toggle('is-collapsed', collapsed);
    sidebar?.classList.toggle('-translate-x-full', collapsed);
    sidebar?.classList.toggle('translate-x-0', !collapsed);
    document.body.classList.toggle('cg-sidebar-collapsed', collapsed);
    document.body.classList.toggle('cg-menu-open', mobile && !collapsed);
    backdrop?.classList.toggle('hidden', !mobile || collapsed);
    if (openButton) {
      openButton.innerHTML = icon(!collapsed);
      openButton.setAttribute('aria-label', collapsed ? 'Abrir menú' : 'Cerrar menú');
      openButton.setAttribute('aria-expanded', String(!collapsed));
    }
  };
  const persist = (collapsed) => {
    if (isMobile()) return;
    const state = Store.get();
    Store.set({ settings:{ ...state.settings, sidebarCollapsed:collapsed } });
  };
  const close = (save = true) => { apply(true); if (save) persist(true); };
  const open = (save = true) => { apply(false); if (save) persist(false); };
  apply(isMobile() ? true : Boolean(Store.get().settings?.sidebarCollapsed));
  openButton?.addEventListener('click', () => sidebar?.classList.contains('is-collapsed') || document.body.classList.contains('cg-sidebar-collapsed') ? open() : close());
  document.getElementById('btnCloseSidebar')?.addEventListener('click', () => close());
  backdrop?.addEventListener('click', () => close(false));
  window.addEventListener('resize', () => apply(isMobile() ? true : Boolean(Store.get().settings?.sidebarCollapsed)), { once:true });
  return { close, isMobile };
}

function bindCommandPalette() {
  const layer = document.getElementById('commandPalette');
  const input = document.getElementById('commandSearchInput');
  const items = () => [...document.querySelectorAll('[data-command-route]')];
  const filter = () => {
    const term = String(input?.value || '').trim().toLowerCase();
    let visible = 0;
    items().forEach((item) => {
      const match = !term || String(item.dataset.commandKeywords || item.textContent || '').toLowerCase().includes(term);
      item.classList.toggle('hidden', !match);
      if (match) visible += 1;
    });
    document.getElementById('commandResults')?.classList.toggle('is-empty', visible === 0);
  };
  const open = () => { layer?.classList.remove('hidden'); document.body.classList.add('cg-command-open'); filter(); setTimeout(() => input?.focus(), 25); };
  const close = () => { layer?.classList.add('hidden'); document.body.classList.remove('cg-command-open'); if (input) input.value = ''; filter(); };
  window.__cgOpenCommandPalette = open;
  window.__cgCloseCommandPalette = close;
  document.getElementById('btnCommandPalette')?.addEventListener('click', open);
  input?.addEventListener('input', filter);
  items().forEach((item) => item.addEventListener('click', () => { navigate(item.dataset.commandRoute); close(); }));
  document.querySelectorAll('[data-command-close]').forEach((node) => node.addEventListener('click', close));
}

function bindUserMenu() {
  const avatar = document.getElementById('btnUserMenu');
  const panel = document.getElementById('userMenuPanel');
  const host = avatar?.closest('.hf-user-menu');
  const close = () => { panel?.classList.add('hidden'); avatar?.setAttribute('aria-expanded','false'); };
  if (host && !document.getElementById('btnUserMenuToggle')) {
    const toggle = document.createElement('button');
    toggle.id = 'btnUserMenuToggle';
    toggle.type = 'button';
    toggle.className = 'hf-user-menu-toggle';
    toggle.setAttribute('aria-label','Abrir opciones de usuario');
    toggle.innerHTML = '<i class="fa-solid fa-chevron-down"></i>';
    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      panel?.classList.toggle('hidden');
      avatar?.setAttribute('aria-expanded', String(!panel?.classList.contains('hidden')));
    });
    host.insertBefore(toggle, panel);
  }
  avatar?.addEventListener('click', (event) => { event.preventDefault(); navigate('profile'); close(); });
  document.querySelectorAll('[data-user-action]').forEach((button) => button.addEventListener('click', (event) => {
    event.preventDefault();
    const action = button.dataset.userAction;
    if (action === 'profile') navigate('profile');
    if (action === 'settings') navigate('configuracion');
    if (action === 'support') navigate('soporte');
    if (action === 'logout') { AuthService.logout(); Store.set({ auth:null, activeLicense:null, route:'login' }); Toast.show('Sesión cerrada.','success'); }
    close();
  }));
  const input = document.getElementById('avatarFileInput');
  document.getElementById('btnAvatarUpload')?.addEventListener('click', (event) => { event.stopPropagation(); input?.click(); });
  input?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) return Toast.show('Selecciona una imagen válida menor de 2 MB.','warning');
    const reader = new FileReader();
    reader.onload = () => Store.set({ profile:{ ...Store.get().profile, avatarDataUrl:String(reader.result || '') } });
    reader.readAsDataURL(file);
    close();
  });
  document.addEventListener('click', (event) => { if (!event.target.closest?.('.hf-user-menu')) close(); }, { once:true });
}

function bindLayout() {
  const sidebar = bindSidebar();
  document.querySelectorAll('[data-route]').forEach((node) => node.addEventListener('click', (event) => {
    event.preventDefault();
    navigate(node.dataset.route);
    if (sidebar.isMobile()) sidebar.close(false);
  }));
  document.querySelectorAll('[data-breadcrumb-route]').forEach((node) => node.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); navigate(node.dataset.breadcrumbRoute); }));
  document.querySelectorAll('[data-quick-scroll]').forEach((button) => button.addEventListener('click', () => {
    const bar = document.getElementById('quickTabs');
    const direction = button.dataset.quickScroll === 'left' ? -1 : 1;
    bar?.scrollBy({ left:direction * Math.min(420,Math.max(260,bar.clientWidth * .65)), behavior:'smooth' });
  }));
  document.querySelectorAll('.hf-app-brand,.hf-topbar-left>div,.login-brand').forEach((brand) => {
    brand.setAttribute('role','button'); brand.setAttribute('tabindex','0');
    brand.addEventListener('click', () => navigate(AuthService.isAuthenticated() ? 'dashboard' : 'login'));
  });
  document.getElementById('businessModeSelector')?.addEventListener('change', (event) => Store.set({ settings:{ ...Store.get().settings, businessMode:event.target.value } }));
  document.getElementById('langSelector')?.addEventListener('change', (event) => Store.set({ settings:{ ...Store.get().settings, lang:event.target.value } }));
  document.getElementById('userMenuLang')?.addEventListener('change', (event) => Store.set({ settings:{ ...Store.get().settings, lang:event.target.value } }));
  document.getElementById('userMenuTheme')?.addEventListener('change', (event) => Store.set({ settings:{ ...Store.get().settings, theme:event.target.value } }));
  document.getElementById('userReportCurrency')?.addEventListener('change', (event) => Store.set({ settings:{ ...Store.get().settings, reportCurrency:event.target.value } }));
  document.getElementById('btnTema')?.addEventListener('click', () => {
    const state = Store.get();
    const order = ['light','sky','soft-blue','spectrum','dark','enterprise','executive','finance'];
    const next = order[(order.indexOf(state.settings.theme) + 1) % order.length] || 'light';
    Store.set({ settings:{ ...state.settings, theme:next } });
  });
  document.getElementById('btnActualizarTasaTop')?.addEventListener('click', async () => {
    try { Toast.show('Consultando tasa BCV…','info'); Store.set({ bcv:await BcvService.fetchRate() }); Toast.show('Tasa BCV actualizada.','success'); }
    catch (error) { Toast.show(error.message,'warning'); }
  });
  bindCommandPalette();
  bindUserMenu();
  if (!globalKeysBound) {
    globalKeysBound = true;
    window.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 'k') { event.preventDefault(); document.getElementById('commandPalette')?.classList.contains('hidden') ? window.__cgOpenCommandPalette?.() : window.__cgCloseCommandPalette?.(); }
      if (event.key === 'Escape') window.__cgCloseCommandPalette?.();
    });
  }
}

function applyTheme(theme) {
  const themes = ['dark','enterprise','executive','finance','sky','soft-blue','spectrum'];
  document.documentElement.classList.toggle('dark', theme === 'dark' || theme === 'enterprise');
  themes.filter((item) => item !== 'dark').forEach((item) => document.documentElement.classList.toggle(`theme-${item}`, theme === item));
  document.documentElement.classList.toggle('enterprise', theme === 'enterprise');
}

function render() {
  if (rendering) return;
  rendering = true;
  try {
    const state = Store.get();
    const oldNav = document.getElementById('mainMenu');
    const preservedSidebarTop = oldNav?.scrollTop ?? Number(sessionStorage.getItem('cg_sidebar_scroll_top') || 0);
    const effectiveRoute = !AuthService.isAuthenticated() && state.route !== 'login' ? 'login' : state.route;
    applyTheme(state.settings.theme || 'light');
    const { page, route } = resolvePage(effectiveRoute);
    app.innerHTML = page.standalone && route === 'login' ? page.render(state) : Shell({ ...state, route }, page.render(state));
    AnalyticsService.trackPageView(route, { title:document.title });
    bindLayout();
    requestAnimationFrame(() => { const nav = document.getElementById('mainMenu'); if (nav) nav.scrollTop = preservedSidebarTop; });
    page.mount?.(state, { Store,Toast,Modal,navigate,render,SupabaseSyncService,AccessControlService });
    if (localStorage.getItem('contagest_auto_sync_enabled') === 'true') {
      const previous = lastAutoSyncByRoute.get(route) || 0;
      if (Date.now() - previous > 120000) {
        lastAutoSyncByRoute.set(route,Date.now());
        SupabaseSyncService.pullRoute(route,{Store,Toast,silent:true}).catch((error)=>console.warn('[ContaGest Sync]',error));
      }
    }
    applyTranslations(state.settings.lang);
    enhanceHorizontalScroll();
    normalizeEnterpriseVisuals(route,state);
    MuiRuntime.mountAll({state:Store.get(),Store}).catch((error)=>console.warn('[ContaGest MUI fallback]',error));
  } finally { rendering = false; }
}

Store.subscribe(render);
window.addEventListener('cg:loading', (event) => event.detail?.active ? Loading.mount(event.detail.message) : Loading.unmount());
AnalyticsService.startSession();
render();

async function autoRefreshBcvOnce() {
  if (autoBcvStarted) return;
  autoBcvStarted = true;
  const state = Store.get();
  if (!BcvService.shouldRefresh(state.bcv)) return;
  try { Store.set({ bcv:await BcvService.fetchRate({preferCache:true,allowStale:true}) }); }
  catch (error) { console.warn('[ContaGest BCV]',error); }
}
setTimeout(autoRefreshBcvOnce,700);

if ('serviceWorker' in navigator) {
  const local = ['localhost','127.0.0.1'].includes(location.hostname);
  window.addEventListener('load', () => {
    if (local) {
      navigator.serviceWorker.getRegistrations?.().then((items)=>items.forEach((item)=>item.unregister())).catch(()=>null);
      window.caches?.keys?.().then((keys)=>keys.forEach((key)=>caches.delete(key))).catch(()=>null);
    } else navigator.serviceWorker.register('./sw.js').catch(()=>null);
  });
}
window.addEventListener('error',(event)=>console.error('[ContaGest Runtime]',event.error||event.message));
window.addEventListener('unhandledrejection',(event)=>console.error('[ContaGest Promise]',event.reason));
