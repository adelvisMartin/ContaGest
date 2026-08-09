import './styles/tailwind.css';
import './styles/precision-ledger.css';
import './styles/enterprise-refinement.css';
import './styles/compact-enterprise-v1110.css';
import './styles/theme-v1115.css';
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

const pageModules = import.meta.glob(['./pages/*Page.js', './pages/*Page.jsx', '!./pages/ModuleRuntimePage.js']);
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

let renderToken = 0;
let pendingPagePromise = null;
let pendingRoute = null;
let currentPage = null;
let currentQuery = {};
let renderQueued = false;

function routeState() {
  return UrlStateService.read();
}

function resolvePageEntry(route) {
  const entry = pageRegistry[route];
  if (!entry) return null;
  const [path, exportName] = entry;
  const loader = pageModules[path];
  return loader ? { loader, exportName } : null;
}

async function loadPage(route) {
  const entry = resolvePageEntry(route);
  if (!entry) return ModuleRuntimePage;
  if (pendingRoute === route && pendingPagePromise) return pendingPagePromise;
  pendingRoute = route;
  pendingPagePromise = entry.loader().then((module) => module[entry.exportName] || ModuleRuntimePage);
  try { return await pendingPagePromise; }
  finally { pendingRoute = null; pendingPagePromise = null; }
}

function setBodyRoute(route) {
  document.body.dataset.route = route;
}

async function render() {
  const token = ++renderToken;
  const state = Store.get();
  const url = routeState();
  const route = state.route || url.route || 'dashboard';
  currentQuery = url.query || {};
  setBodyRoute(route);
  Loading.show();
  try {
    const page = await loadPage(route);
    if (token !== renderToken) return;
    currentPage = page;
    const html = page.render(state, { query:currentQuery, route });
    const root = document.getElementById('app');
    root.innerHTML = page.standalone ? html : Shell(state, html);
    applyTranslations(root, state.settings?.lang || 'es');
    MuiRuntime.mount(root);
    page.mount?.(Store.get(), { Store, Toast, Modal, navigate, render, SupabaseSyncService, UrlStateService, QueryParamEnhancer });
    QueryParamEnhancer.mount(root, { route, query:currentQuery, navigate:UrlStateService.navigate, setParams:UrlStateService.setParams });
  } catch (error) {
    console.error('[ContaGest render]', error);
    Toast.show(error.message || 'No se pudo abrir el módulo.', 'error');
  } finally {
    Loading.hide();
  }
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  queueMicrotask(() => {
    renderQueued = false;
    render();
  });
}

function navigate(route, params = {}) {
  UrlStateService.navigate(route, params);
}

Store.subscribe(queueRender);
window.addEventListener('popstate', () => {
  const { route } = routeState();
  if (route && Store.get().route !== route) Store.set({ route });
  else queueRender();
});

const initial = routeState();
if (initial.route && Store.get().route !== initial.route) Store.set({ route:initial.route });
else render();

export { navigate, render };
