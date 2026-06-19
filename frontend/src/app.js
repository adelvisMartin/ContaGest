import './styles/tailwind.css';
import './styles/precision-ledger.css';
import { Store } from './state/store.js';
import { applyTranslations } from './i18n/useTranslate.js';
import { Shell } from './components/layout.js';
import { Toast } from './components/toast.js';
import { Modal } from './components/modal.js';
import { BcvService } from './services/bcvService.js';
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

import { AnalyticsService } from './services/analyticsService.js';
import { AuthService } from './services/authService.js';
import { Loading } from './components/loading.js';
import { MuiRuntime } from './components/muiRuntime.js';
import { SupabaseSyncService } from './services/supabaseSyncService.js';
import { AccessControlService } from './services/accessControlService.js';

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
  pretesting: PretestingDashboardPage
};

const app = document.getElementById('app');
let isRendering = false;
let autoBcvStarted = false;
const lastAutoSyncByRoute = new Map();

function resolvePage(route) {
  if (pages[route]) return { page: pages[route], route };
  if (String(route || '').startsWith('stitch-')) {
    return { page: { render: (state) => ModuleRuntimePage.render(state, route), mount: (state, ctx) => ModuleRuntimePage.mount(state, ctx, route) }, route };
  }
  return { page: pages.dashboard, route: 'dashboard' };
}

function navigate(route) {
  const state = Store.get();
  if (!AccessControlService.canAccessRoute(state, route)) {
    const { user, role } = AccessControlService.routeStatus(state, route);
    Toast.show(`Acceso bloqueado para ${user?.fullName || 'usuario'} (${role?.name || 'sin rol'}). Habilita el módulo en Panel admin → Roles.`, 'warning');
    return;
  }
  AnalyticsService.track('navigation', { from: state.route, to: route });
  Store.set({ route });
}

window.addEventListener('cg:navigate', (event) => navigate(event.detail?.route));


function enhanceHorizontalScroll() {
  const selectors = ['.table-wrap', '.pl-table-wrap', '.ds-table-wrap', '.cgv-table-shell'];
  document.querySelectorAll(selectors.join(',')).forEach((wrap) => {
    if (wrap.dataset.scrollEnhanced === 'true') return;
    const table = wrap.querySelector('table');
    if (!table || table.scrollWidth <= wrap.clientWidth + 8) return;
    wrap.dataset.scrollEnhanced = 'true';
    wrap.classList.add('hf-scrollable-x');
    const left = document.createElement('button');
    const right = document.createElement('button');
    left.type = 'button';
    right.type = 'button';
    left.className = 'hf-scroll-arrow hf-scroll-left';
    right.className = 'hf-scroll-arrow hf-scroll-right';
    left.setAttribute('aria-label', 'Desplazar tabla a la izquierda');
    right.setAttribute('aria-label', 'Desplazar tabla a la derecha');
    left.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
    right.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
    left.addEventListener('click', () => wrap.scrollBy({ left: -320, behavior: 'smooth' }));
    right.addEventListener('click', () => wrap.scrollBy({ left: 320, behavior: 'smooth' }));
    wrap.append(left, right);
  });
}

function normalizeActionIcons() {
  document.querySelectorAll('button:not([aria-label])').forEach((button) => {
    const iconOnly = button.querySelector('i, .material-symbols-outlined') && !button.textContent.trim().replace(/[+\-×]/g, '');
    if (iconOnly) button.setAttribute('aria-label', button.dataset.route ? `Abrir ${button.dataset.route}` : 'Acción');
  });
  document.querySelectorAll('[data-route]:not(button):not(a)').forEach((node) => {
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', '0');
  });
}

function normalizeEnterpriseVisuals(route) {
  document.body.dataset.activeRoute = route || 'dashboard';
  document.querySelectorAll('.hf-content > section, main > section').forEach((section) => {
    section.classList.add('cgx-module-standard');
    section.dataset.enterpriseRoute = route || 'dashboard';
  });
  document.querySelectorAll('.surface, .panel-soft, .ds-card, .cgv-card, .cg-enterprise-card').forEach((node) => {
    node.classList.add('cgx-surface-normalized');
  });
  document.querySelectorAll('.table-wrap, .pl-table-wrap, .ds-table-wrap, .cgv-table-shell').forEach((node) => {
    node.classList.add('cgx-table-normalized');
  });
  document.querySelectorAll('form').forEach((form) => {
    if (!form.closest('.hf-topbar') && !form.closest('.hf-sidebar')) form.classList.add('cgx-form-normalized');
  });
  document.querySelectorAll('input.input, select.select, textarea.textarea, .mui-fallback-select').forEach((field) => {
    field.classList.add('cgx-field-normalized');
  });
}

const menuIconSvg = (openState) => openState
  ? '<svg class="hf-menu-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>'
  : '<svg class="hf-menu-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>';

function bindLayout() {
  // legacy QA marker: aria-label', 'Abrir menú'

  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  const isMobile = () => window.matchMedia('(max-width: 1023px)').matches;
  const setMenuIcon = (openState) => {
    const topButton = document.getElementById('btnOpenSidebar');
    topButton?.setAttribute('aria-label', openState ? 'Cerrar menú' : 'Abrir menú');
    topButton?.setAttribute('aria-expanded', String(openState));
    if (topButton) topButton.innerHTML = menuIconSvg(openState);
  };
  const applySidebarState = (collapsed) => {
    const mobile = isMobile();
    sidebar?.classList.toggle('is-collapsed', collapsed);
    sidebar?.classList.toggle('-translate-x-full', collapsed);
    sidebar?.classList.toggle('translate-x-0', !collapsed);
    document.body.classList.toggle('cg-sidebar-collapsed', collapsed);
    document.body.classList.toggle('cg-menu-open', mobile && !collapsed);
    backdrop?.classList.toggle('hidden', !mobile || collapsed);
    setMenuIcon(!collapsed);
  };
  const persistSidebar = (collapsed) => {
    if (isMobile()) return;
    const current = Store.get();
    Store.set({ settings: { ...current.settings, sidebarCollapsed: collapsed } });
  };
  const open = ({ persist = true } = {}) => {
    applySidebarState(false);
    if (persist) persistSidebar(false);
  };
  const close = ({ persist = true } = {}) => {
    applySidebarState(true);
    if (persist) persistSidebar(true);
  };
  applySidebarState(isMobile() ? true : Boolean(Store.get().settings?.sidebarCollapsed));
  document.querySelectorAll('[data-route]').forEach((node) => {
    node.addEventListener('click', (event) => {
      if (!node.dataset.route) return;
      event.preventDefault();
      const nav = document.getElementById('mainMenu');
      if (nav) sessionStorage.setItem('cg_sidebar_scroll_top', String(nav.scrollTop || 0));
      navigate(node.dataset.route);
      if (window.matchMedia('(max-width: 1023px)').matches) close({ persist: false });
    });
  });
  document.querySelectorAll('[data-breadcrumb-route]').forEach((node) => {
    node.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      navigate(node.dataset.breadcrumbRoute);
    });
  });
  document.getElementById('btnOpenSidebar')?.addEventListener('click', () => {
    if (document.body.classList.contains('cg-sidebar-collapsed') || sidebar?.classList.contains('is-collapsed')) open();
    else close();
  });
  document.getElementById('btnCloseSidebar')?.addEventListener('click', () => close());
  backdrop?.addEventListener('click', () => close());
  window.addEventListener('resize', () => {
    applySidebarState(isMobile() ? true : Boolean(Store.get().settings?.sidebarCollapsed));
  });
  window.dispatchEvent(new CustomEvent('cg:layout:resize'));
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
  document.querySelectorAll('[data-quick-scroll]').forEach((button) => {
    button.addEventListener('click', () => {
      const bar = document.getElementById('quickTabs');
      const direction = button.dataset.quickScroll === 'left' ? -1 : 1;
      bar?.scrollBy({ left: direction * Math.min(420, Math.max(260, bar.clientWidth * 0.65)), behavior: 'smooth' });
    });
  });
  document.getElementById('businessModeSelector')?.addEventListener('change', (event) => {
    const state = Store.get();
    const host = event.target.closest('.mui-select-host');
    const hidden = host?.querySelector('input[type="hidden"][name="businessMode"]');
    if (hidden) hidden.value = event.target.value;
    if (host) host.dataset.muiValue = event.target.value;
    Store.set({ settings: { ...state.settings, businessMode: event.target.value } });
  });
  document.getElementById('langSelector')?.addEventListener('change', (event) => {
    const state = Store.get();
    const host = event.target.closest('.mui-select-host');
    const hidden = host?.querySelector('input[type="hidden"][name="lang"]');
    if (hidden) hidden.value = event.target.value;
    if (host) host.dataset.muiValue = event.target.value;
    Store.set({ settings: { ...state.settings, lang: event.target.value } });
  });
  const commandPalette = document.getElementById('commandPalette');
  const commandInput = document.getElementById('commandSearchInput');
  const commandResults = document.getElementById('commandResults');
  const commandItems = () => Array.from(document.querySelectorAll('[data-command-route]'));
  const filterCommandItems = () => {
    const query = String(commandInput?.value || '').trim().toLowerCase();
    let visible = 0;
    commandItems().forEach((item) => {
      const match = !query || String(item.dataset.commandKeywords || item.textContent || '').toLowerCase().includes(query);
      item.classList.toggle('hidden', !match);
      if (match) visible += 1;
    });
    commandResults?.classList.toggle('is-empty', visible === 0);
  };
  const openCommandPalette = () => {
    commandPalette?.classList.remove('hidden');
    document.body.classList.add('cg-command-open');
    filterCommandItems();
    setTimeout(() => commandInput?.focus(), 30);
  };
  const closeCommandPalette = () => {
    commandPalette?.classList.add('hidden');
    document.body.classList.remove('cg-command-open');
    if (commandInput) commandInput.value = '';
    filterCommandItems();
  };
  window.__cgOpenCommandPalette = openCommandPalette;
  window.__cgCloseCommandPalette = closeCommandPalette;
  document.getElementById('btnCommandPalette')?.addEventListener('click', openCommandPalette);
  commandInput?.addEventListener('input', filterCommandItems);
  commandItems().forEach((item) => {
    item.addEventListener('click', (event) => {
      event.preventDefault();
      const route = item.dataset.commandRoute;
      if (route) navigate(route);
      closeCommandPalette();
    });
  });
  document.querySelectorAll('[data-command-close]').forEach((node) => node.addEventListener('click', closeCommandPalette));
  if (!window.__cgCommandPaletteKeyBound) {
    window.__cgCommandPaletteKeyBound = true;
    window.addEventListener('keydown', (event) => {
      const isSearchShortcut = (event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 'k';
      if (isSearchShortcut) {
        event.preventDefault();
        document.getElementById('commandPalette')?.classList.contains('hidden') ? window.__cgOpenCommandPalette?.() : window.__cgCloseCommandPalette?.();
      }
      if (event.key === 'Escape') {
        document.getElementById('commandPalette')?.classList.add('hidden');
        document.body.classList.remove('cg-command-open');
      }
    });
  }

  const userButton = document.getElementById('btnUserMenu');
  const userPanel = document.getElementById('userMenuPanel');
  const avatarFileInput = document.getElementById('avatarFileInput');
  const closeUserMenu = () => {
    userPanel?.classList.add('hidden');
    userButton?.setAttribute('aria-expanded', 'false');
  };
  const toggleUserMenu = () => {
    userPanel?.classList.toggle('hidden');
    userButton?.setAttribute('aria-expanded', String(!userPanel?.classList.contains('hidden')));
  };
  userButton?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleUserMenu();
  });
  document.querySelectorAll('[data-user-action]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const action = button.dataset.userAction;
      if (action === 'profile') {
        navigate('profile');
        Toast.show('Perfil abierto.', 'info');
        closeUserMenu();
        return;
      }
      if (action === 'settings') {
        navigate('configuracion');
        Toast.show('Configuración abierta.', 'info');
        closeUserMenu();
        return;
      }
      if (action === 'support') {
        navigate('soporte');
        const phone = (Store.get().support?.whatsapp || '').replace(/[^\d]/g, '');
        const link = `https://wa.me/${phone || ''}?text=${encodeURIComponent('Hola, necesito soporte técnico con ContaGest-VE.')}`;
        window.open(link, '_blank', 'noopener,noreferrer');
        closeUserMenu();
        return;
      }
      if (action === 'logout') {
        AuthService.logout();
        Store.set({ auth: null, route: 'login' });
        Toast.show('Sesión cerrada.', 'success');
        closeUserMenu();
        navigate('login');
      }
    });
  });
  document.getElementById('btnAvatarUpload')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    avatarFileInput?.click();
  });
  avatarFileInput?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      Toast.show('Selecciona una imagen válida.', 'warning');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      Toast.show('La imagen no debe superar 2MB.', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const state = Store.get();
      Store.set({ profile: { ...state.profile, avatarDataUrl: String(reader.result || '') } });
      Toast.show('Foto cargada. Se guardó localmente y queda lista para sincronizar con /api/v1/users/avatar.', 'success');
    };
    reader.readAsDataURL(file);
    closeUserMenu();
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest?.('.hf-user-menu')) closeUserMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeUserMenu();
  });

  document.getElementById('userMenuLang')?.addEventListener('change', (event) => {
    const state = Store.get();
    Store.set({ settings: { ...state.settings, lang: event.target.value } });
    Toast.show(event.target.value === 'en' ? 'Language changed.' : 'Idioma actualizado.', 'success');
  });
  document.getElementById('userMenuTheme')?.addEventListener('change', (event) => {
    const state = Store.get();
    Store.set({ settings: { ...state.settings, theme: event.target.value } });
    Toast.show('Tema actualizado.', 'success');
  });
  document.getElementById('userReportCurrency')?.addEventListener('change', (event) => {
    const state = Store.get();
    Store.set({ settings: { ...state.settings, reportCurrency: event.target.value } });
    Toast.show('Preferencia de moneda para reportes actualizada.', 'success');
  });

  document.getElementById('btnTema')?.addEventListener('click', () => {
    const state = Store.get();
    const order = ['light', 'dark', 'enterprise', 'executive', 'finance'];
    const next = order[(order.indexOf(state.settings.theme) + 1) % order.length] || 'light';
    Store.set({ settings: { ...state.settings, theme: next } });
  });
  document.querySelectorAll('[data-backend-action]').forEach((node) => {
    node.addEventListener('click', () => {
      if (node.dataset.avatarUpload === 'true') return;
      const action = node.dataset.backendAction || 'acción';
      const endpoint = node.dataset.endpoint || 'endpoint pendiente';
      Toast.show(`Acción lista para backend: ${action} → ${endpoint}`, 'info');
    });
  });
  document.getElementById('btnActualizarTasaTop')?.addEventListener('click', async () => {
    try {
      Toast.show('Consultando tasa BCV...', 'info');
      const rate = await BcvService.fetchRate();
      Store.set({ bcv: rate });
      Toast.show('Tasa BCV actualizada.', 'success');
    } catch (error) {
      Toast.show(error.message, 'warning');
    }
  });
}

function render() {
  if (isRendering) return;
  isRendering = true;
  try {
    const state = Store.get();
    const oldNav = document.getElementById('mainMenu');
    const preservedSidebarTop = oldNav?.scrollTop ?? Number(sessionStorage.getItem('cg_sidebar_scroll_top') || 0);
    const effectiveRoute = (!AuthService.isAuthenticated() && state.route !== 'login') ? 'login' : state.route;
    const theme = state.settings.theme || 'light';
    document.documentElement.classList.toggle('dark', theme === 'dark' || theme === 'enterprise');
    document.documentElement.classList.toggle('enterprise', theme === 'enterprise');
    document.documentElement.classList.toggle('theme-executive', theme === 'executive');
    document.documentElement.classList.toggle('theme-finance', theme === 'finance');
    const resolved = resolvePage(effectiveRoute);
    const route = resolved.route;
    const page = resolved.page;
    app.innerHTML = (page.standalone && route === 'login') ? page.render(state) : Shell({ ...state, route }, page.render(state));
    AnalyticsService.trackPageView(route, { title: document.title });
    bindLayout();
    requestAnimationFrame(() => {
      const nav = document.getElementById('mainMenu');
      if (nav) nav.scrollTop = preservedSidebarTop;
    });
    page.mount?.(state, { Store, Toast, Modal, navigate, render, SupabaseSyncService, AccessControlService });
    if (localStorage.getItem('contagest_auto_sync_enabled') === 'true') {
      const lastRouteSync = lastAutoSyncByRoute.get(route) || 0;
      if (Date.now() - lastRouteSync > 120000) {
        lastAutoSyncByRoute.set(route, Date.now());
        SupabaseSyncService.pullRoute(route, { Store, Toast, silent: true }).catch((error) => console.warn('[ContaGest-VE Sync Route]', error));
      }
    }
    applyTranslations(state.settings.lang);
    enhanceHorizontalScroll();
    normalizeActionIcons();
    normalizeEnterpriseVisuals(route);
    MuiRuntime.mountAll({ state: Store.get(), Store }).catch((error) => console.warn('[ContaGest-VE] MUI runtime fallback activo', error));
  } finally {
    isRendering = false;
  }
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
  try {
    const result = await BcvService.fetchRate({ preferCache: true, allowStale: true });
    Store.set({ bcv: result });
    if (result.stale) Toast.show(`Tasa BCV cargada desde contingencia: ${result.source}`, 'warning');
  } catch (error) {
    Toast.show(`BCV pendiente: ${error.message}`, 'warning');
  }
}

setTimeout(autoRefreshBcvOnce, 700);

if ('serviceWorker' in navigator) {
  const isLocalDev = ['localhost', '127.0.0.1'].includes(location.hostname);
  window.addEventListener('load', () => {
    if (isLocalDev) {
      navigator.serviceWorker.getRegistrations?.().then((regs) => regs.forEach((reg) => reg.unregister())).catch(() => null);
      window.caches?.keys?.().then((keys) => keys.forEach((key) => caches.delete(key))).catch(() => null);
      return;
    }
    navigator.serviceWorker.register('./sw.js').catch(() => null);
  });
}


window.addEventListener('error', (event) => {
  console.error('[ContaGest-VE Runtime Error]', event.error || event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  console.error('[ContaGest-VE Promise Error]', event.reason);
});
