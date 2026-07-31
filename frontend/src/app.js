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
import { VeterinaryClinicPage } from './pages/VeterinaryClinicPage.jsx';
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
  veterinaria: VeterinaryClinicPage,
  gimnasio: GymManagementPage,
  rutinas: GymManagementPage,
  nutricion: GymManagementPage,
  mensajes: CommunicationTemplatesPage
};

const app = document.querySelector('#app');
let lastRoute = null;

UrlStateService.bootstrap({ Store, routes: Object.keys(pages) });

function createPageContext(state) {
  return {
    Store,
    Toast,
    Modal,
    Loading,
    BcvService,
    AnalyticsService,
    AuthService,
    SupabaseSyncService,
    AccessControlService,
    MuiRuntime,
    UrlStateService,
    query: UrlStateService.getParams(),
    state
  };
}

function render() {
  const state = Store.get();
  const route = state.route || 'dashboard';
  UrlStateService.ensureRoute(route, { replace: lastRoute === null });
  const page = pages[route] || ModuleRuntimePage;
  const pageHtml = page.render(state, { query: UrlStateService.getParams(), UrlStateService });
  app.innerHTML = route === 'login' ? pageHtml : Shell(state, pageHtml);
  document.body.dataset.route = route;
  document.title = `${route === 'dashboard' ? 'Inicio' : route.replaceAll('-', ' ')} · ContaGest-VE`;
  applyTranslations(app);
  MuiRuntime.mountAll(app, createPageContext(state));
  page.mount?.(state, createPageContext(state));
  if (lastRoute !== route) {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    lastRoute = route;
  }
}

Store.subscribe(render);
render();
