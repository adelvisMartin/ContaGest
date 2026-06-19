import { KpiCard } from './ui/index.js';
import { bs, usd, percent } from '../core/formatters.js';
import { calculateInventory, calculateLedger } from '../core/calculator.js';
import { modulesByArea, BUSINESS_MODES, MODULE_TIERS, MODULE_CATALOG } from '../data/moduleCatalog.js';
import { escapeHtml } from '../utils/dom.js';
import { AccessControlService } from '../services/accessControlService.js';

const MenuSvg = () => `<svg class="hf-menu-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>`;
const CloseSvg = () => `<svg class="hf-menu-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>`;


const areaIcon = (area) => ({
  Inicio:'fa-house',
  Ventas:'fa-cash-register',
  Operaciones:'fa-bell-concierge',
  Inventario:'fa-boxes-stacked',
  Compras:'fa-cart-shopping',
  Contabilidad:'fa-scale-balanced',
  Fiscal:'fa-landmark',
  RRHH:'fa-users-gear',
  Analítica:'fa-chart-line',
  Administración:'fa-user-shield',
  Soporte:'fa-headset'
}[area] || 'fa-layer-group');

const moduleIcon = (route) => ({
  dashboard:'fa-chart-pie',
  mobile:'fa-mobile-screen-button',
  ventas:'fa-receipt',
  cotizacion:'fa-file-invoice-dollar',
  clientes:'fa-users',
  historial:'fa-clock-rotate-left',
  pedidos:'fa-bell-concierge',
  'pos-sede':'fa-utensils',
  'tracking-pedidos':'fa-timeline',
  'delivery-mapa':'fa-map-location-dot',
  tasks:'fa-list-check',
  inventario:'fa-boxes-stacked',
  'inventario-scan':'fa-barcode',
  kardex:'fa-clipboard-list',
  qr:'fa-qrcode',
  proveedores:'fa-truck-field',
  compras:'fa-cart-shopping',
  contabilidad:'fa-book',
  'plan-cuentas':'fa-sitemap',
  'libro-mayor':'fa-book-open-reader',
  'balance-sumas-saldos':'fa-scale-balanced',
  'hoja-trabajo':'fa-table-columns',
  'estados-financieros':'fa-file-invoice-dollar',
  'cierre-contable':'fa-lock',
  bancos:'fa-building-columns',
  'normativa-contable':'fa-globe',
  tributos:'fa-scale-balanced',
  'libro-ventas':'fa-book-open',
  normativa:'fa-book-open',
  nomina:'fa-users-gear',
  rrhh:'fa-user-tie',
  analytics:'fa-chart-line',
  reportes:'fa-chart-simple',
  auditoria:'fa-shield-halved',
  configuracion:'fa-gear',
  backend:'fa-server',
  admin:'fa-user-shield',
  marca:'fa-swatchbook',
  'demo-control':'fa-user-lock',
  licencias:'fa-key',
  'importacion-data':'fa-file-import',
  'reglas-negocio':'fa-gears',
  'modulos-madurez':'fa-cubes',
  pretesting:'fa-vial-circle-check',
  vistas:'fa-layer-group',
  profile:'fa-user',
  'asistente-ia':'fa-robot',
  soporte:'fa-headset',
  ayuda:'fa-circle-question'
}[route] || 'fa-circle-dot');

const quickRoutes = ['dashboard','libro-ventas','inventario','kardex','ventas','pedidos','contabilidad','libro-mayor','balance-sumas-saldos','hoja-trabajo','plan-cuentas','importacion-data','licencias','analytics','pretesting','soporte'];

const BUSINESS_MODE_TOPBAR_OPTIONS = {
  contador: 'Contador',
  comercio: 'Comercio',
  restaurante: 'Restaurante',
  servicios: 'Servicios',
  demo: 'Demo',
  admin: 'Admin'
};

const routeIcon = moduleIcon;
const routeKey = (route) => ({
  ventas:'sales', cotizacion:'quote', clientes:'clients', historial:'history', contabilidad:'ledger', 'libro-mayor':'generalLedger', 'balance-sumas-saldos':'trialBalance', 'hoja-trabajo':'worksheet', 'estados-financieros':'financialStatements', 'cierre-contable':'accountingClose', bancos:'banking',
  nomina:'payroll', normativa:'regulatory', auditoria:'audit', 'libro-ventas':'salesBook', 'plan-cuentas':'chartAccounts',
  rrhh:'hrDashboard', marca:'brandGuidelines', admin:'adminPanel', backend:'backend', vistas:'stitchViews', analytics:'analytics',
  qr:'qrBarcode', 'inventario-scan':'inventoryScanner', pedidos:'orders', 'pos-sede':'posCounter', 'tracking-pedidos':'orderTracking',
  'delivery-mapa':'deliveryMap', 'asistente-ia':'aiAssistant', soporte:'supportCta', 'demo-control':'demoControl',
  licencias:'licenses', 'importacion-data':'dataImport', 'reglas-negocio':'businessRules', 'modulos-madurez':'moduleMaturity',
  kardex:'kardex', 'normativa-contable':'accountingStandards', reportes:'reports', inventario:'inventory', dashboard:'dashboard'
}[route] || route);

const routeLabel = (route) => ({
  dashboard:'Dashboard',
  'libro-ventas':'Libro de ventas',
  inventario:'Inventario',
  kardex:'Kardex',
  ventas:'Ventas',
  pedidos:'Pedidos',
  contabilidad:'Libro diario',
  'libro-mayor':'Libro mayor',
  'balance-sumas-saldos':'Balance de sumas y saldos',
  'hoja-trabajo':'Hoja de trabajo',
  'estados-financieros':'Estados financieros',
  'cierre-contable':'Cierre contable',
  'plan-cuentas':'Plan de cuentas',
  'importacion-data':'Carga masiva',
  licencias:'Licencias',
  analytics:'Analítica',
  soporte:'Soporte',
  pretesting:'Pretesting QA'
}[route] || route);

const tierDot = (tier) => {
  const data = MODULE_TIERS[tier] || MODULE_TIERS.demo;
  return `<span class="hf-tier-dot hf-tier-${tier}" title="${data.label}"></span>`;
};

function routeMeta(route) {
  const byCatalog = MODULE_CATALOG.find((item) => item.route === route);
  if (byCatalog) return byCatalog;
  return { route, name: routeLabel(route), area: 'Inicio', tier: 'demo' };
}

function quickNavItems(activeRoute, state) {
  return quickRoutes.map((route) => {
    const meta = routeMeta(route);
    return {
      route,
      label: meta.name || routeLabel(route),
      area: meta.area || 'Inicio',
      icon: routeIcon(route),
      active: activeRoute === route,
      locked: !AccessControlService.canAccessRoute(state, route)
    };
  });
}

function breadcrumbItems(activeRoute) {
  const meta = routeMeta(activeRoute);
  return [
    { label: 'Inicio', route: 'dashboard' },
    { label: meta.area || 'Área' },
    { label: meta.name || routeLabel(activeRoute), route: activeRoute, current: true }
  ];
}

function commandPaletteItems(state) {
  const seen = new Set();
  const priority = ['dashboard', 'ventas', 'clientes', 'inventario', 'kardex', 'libro-ventas', 'contabilidad', 'libro-mayor', 'balance-sumas-saldos', 'hoja-trabajo', 'estados-financieros', 'reportes', 'configuracion', 'admin', 'backend'];
  const catalog = [...priority.map(routeMeta), ...MODULE_CATALOG]
    .filter((item) => item?.route && !seen.has(item.route) && seen.add(item.route))
    .filter((item) => AccessControlService.canAccessRoute(state, item.route))
    .map((item) => ({
      route: item.route,
      label: item.name || routeLabel(item.route),
      area: item.area || 'Sistema',
      tier: item.tier || 'core',
      icon: moduleIcon(item.route),
      keywords: [item.name, item.area, item.route, item.description].filter(Boolean).join(' ')
    }));
  return catalog.slice(0, 96);
}


function menuSections(state) {
  const byArea = modulesByArea(state.settings?.businessMode || 'admin', { includeAll: true });
  const activeRoute = state.route;
  return Object.entries(byArea).map(([area, items]) => {
    const isActiveArea = items.some((item) => item.route === activeRoute);
    return `
      <details class="hf-menu-section" data-sidebar-section="${area}" ${isActiveArea ? 'open' : 'open'}>
        <summary class="cg-area-toggle">
          <span><i class="fa-solid ${areaIcon(area)}"></i>${area}</span>
          <i class="fa-solid fa-chevron-down hf-section-chevron"></i>
        </summary>
        <div class="hf-menu-list">
          ${items.map((item) => {
            const locked = !AccessControlService.canAccessRoute(state, item.route);
            return `
            <button class="menu-link hf-menu-item ${activeRoute === item.route ? 'active' : ''} ${locked ? 'is-locked' : ''}" data-route="${item.route}" title="${locked ? 'Bloqueado por rol/perfil activo' : item.name}" aria-disabled="${locked ? 'true' : 'false'}">
              <i class="fa-solid ${moduleIcon(item.route)}"></i>
              <span data-i18n-route="${item.route}">${item.name}</span>
              ${locked ? '<i class="fa-solid fa-lock hf-module-lock"></i>' : tierDot(item.tier)}
            </button>`;
          }).join('')}
        </div>
      </details>`;
  }).join('');
}

export const Shell = (state, pagesHtml) => {
  const inv = calculateInventory(state.inventory || []);
  const ledger = calculateLedger(state.ledger?.entries || []);
  const totalHistory = (state.history || []).reduce((s, r) => s + Number(r.calculation?.total || 0), 0);
  const mode = state.settings?.businessMode || 'admin';
  const sidebarCollapsed = Boolean(state.settings?.sidebarCollapsed);
  const sidebarStateClass = sidebarCollapsed ? 'is-collapsed -translate-x-full' : '-translate-x-full lg:translate-x-0';
  const sidebarToggleIcon = sidebarCollapsed ? 'fa-bars' : 'fa-xmark';
  const quickItems = quickNavItems(state.route, state);
  const breadcrumbs = breadcrumbItems(state.route);
  const commandItems = commandPaletteItems(state);
  const avatarSrc = state.profile?.avatarDataUrl || '';
  const avatarInitials = String(state.profile?.name || 'A').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'A';

  return `
  <div id="sidebarBackdrop" class="fixed inset-0 z-40 hidden bg-black/45 lg:hidden"></div>

  <aside id="sidebar" class="hf-sidebar hf-app-sidebar cg-sidebar ${sidebarStateClass}">
    <div class="hf-brand hf-app-brand">
      <div class="hf-brand-mark">C</div>
      <div class="min-w-0">
        <h1>ContaGest-VE</h1>
        <p data-i18n="appTitle">Enterprise ERP</p>
      </div>
      <button id="btnCloseSidebar" class="hf-icon-button ml-auto" aria-label="Cerrar menú">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>

    <div class="hf-sidebar-actions">
      <button class="hf-new-entry" data-route="cotizacion"><span>+</span> Nueva operación</button>
      <button class="hf-mini-action" data-route="inventario"><i class="fa-solid fa-boxes-stacked"></i><span>Ir a inventario</span></button>
    </div>

    <nav class="cg-sidebar-nav hf-app-nav" id="mainMenu" aria-label="Navegación principal">
      ${menuSections(state)}
    </nav>

    <div class="cg-sidebar-footer hf-sidebar-footer">
      <div>
        <p class="hf-footer-kicker">Vista activa</p>
        <strong>${routeLabel(state.route)}</strong>
        <span>${BUSINESS_MODES[mode]?.label || 'Modo Administrador'}</span>
      </div>
      <button class="hf-logout-link" data-route="login">Cerrar sesión</button>
    </div>
  </aside>
<div class="hf-main hf-app-main">
    <header class="hf-topbar hf-app-topbar" data-header-responsive="v9.2">
      <div class="hf-topbar-left">
        <button id="btnOpenSidebar" class="hf-icon-button hf-menu-toggle" type="button" aria-label="${sidebarCollapsed ? 'Abrir menú' : 'Cerrar menú'}" title="${sidebarCollapsed ? 'Abrir menú' : 'Cerrar menú'}">${sidebarCollapsed ? MenuSvg() : CloseSvg()}</button>
        <div>
          <strong>ContaGest-VE</strong>
          <p class="hf-topbar-subtitle">Shell único · listo para Supabase</p>
        </div>
      </div>

      <button id="btnCommandPalette" class="hf-command-trigger" type="button" aria-label="Buscar módulos, acciones y documentos">
        <i class="fa-solid fa-magnifying-glass"></i>
        <span>Buscar en ContaGest</span>
        <kbd>Ctrl K</kbd>
      </button>

      <div class="hf-topbar-actions hf-app-topbar-actions">
        <div class="hf-rate-card">
          <span data-i18n="bcvRate">Tasa BCV</span>
          <strong><span id="tasaHeader">${bs(state.bcv.rate)}</span> / USD</strong>
        </div>
        <div class="hf-rate-card hf-rate-source">
          <span data-i18n="source">Fuente</span>
          <strong id="tasaFuente">${state.bcv.source || 'Pendiente'}${state.bcv.stale ? ' · revisar' : ''}</strong>
        </div>
        <div class="mui-select-host mui-select-topbar" data-mui-select-field data-mui-name="businessMode" data-mui-label="Modo" data-mui-label-hidden="true" data-mui-value="${mode}" data-mui-options="${escapeHtml(JSON.stringify(Object.entries(BUSINESS_MODES).map(([key]) => ({ value:key, label:BUSINESS_MODE_TOPBAR_OPTIONS[key] || key }))))}">
          <input type="hidden" name="businessMode" value="${mode}" />
          <select id="businessModeSelector" class="select mui-fallback-select" data-mui-fallback aria-label="Modo de negocio" title="Modo de negocio">
            ${Object.entries(BUSINESS_MODES).map(([key]) => `<option value="${key}" ${mode === key ? 'selected' : ''}>${BUSINESS_MODE_TOPBAR_OPTIONS[key] || key}</option>`).join('')}
          </select>
          <div class="mui-react-mount" data-mui-mount></div>
        </div>
        <div class="mui-select-host mui-select-topbar hf-lang-select" data-mui-select-field data-mui-name="lang" data-mui-label="Idioma" data-mui-label-hidden="true" data-mui-value="${state.settings?.lang || 'es'}" data-mui-options="${escapeHtml(JSON.stringify([{ value:'es', label:'ES' }, { value:'en', label:'EN' }]))}">
          <input type="hidden" name="lang" value="${state.settings?.lang || 'es'}" />
          <select id="langSelector" class="select mui-fallback-select" data-mui-fallback aria-label="Idioma" title="Idioma">
            <option value="es" ${state.settings?.lang === 'es' ? 'selected' : ''}>ES</option>
            <option value="en" ${state.settings?.lang === 'en' ? 'selected' : ''}>EN</option>
          </select>
          <div class="mui-react-mount" data-mui-mount></div>
        </div>
        <button id="btnActualizarTasaTop" class="cgv-btn cgv-btn-primary"><i class="fa-solid fa-rotate"></i><span data-i18n="refreshBcv">BCV</span></button>
        <button id="btnTema" class="hf-icon-button" aria-label="Cambiar tema"><i class="fa-solid ${state.settings.theme === 'dark' ? 'fa-sun' : 'fa-moon'}"></i></button>
        <div class="hf-user-menu">
          <button id="btnUserMenu" class="hf-avatar hf-avatar-button" aria-label="Abrir menú de usuario y configuración" aria-haspopup="menu" aria-expanded="false" title="Usuario y configuración">${avatarSrc ? `<img src="${avatarSrc}" alt="Avatar de usuario" />` : avatarInitials}</button>
          <div id="userMenuPanel" class="hf-user-panel hidden" role="menu">
            <div class="hf-user-panel-head">
              <strong>${escapeHtml(state.profile?.name || 'Administrador')}</strong>
              <span>${escapeHtml(state.profile?.email || 'admin@erp.local')}</span>
            </div>
            <button type="button" data-user-action="profile"><i class="fa-solid fa-user"></i><span data-i18n="profile">Perfil</span></button>
            <button type="button" id="btnAvatarUpload" data-avatar-upload="true" data-backend-action="avatar.upload" data-endpoint="/api/v1/users/avatar"><i class="fa-solid fa-camera"></i><span>Cambiar foto</span></button>
            <button type="button" data-user-action="settings"><i class="fa-solid fa-building"></i><span data-i18n="settings">Empresa y configuración</span></button>
            <label class="hf-user-select"><span><i class="fa-solid fa-language"></i> Idioma</span><select id="userMenuLang"><option value="es" ${state.settings?.lang === 'es' ? 'selected' : ''}>Español</option><option value="en" ${state.settings?.lang === 'en' ? 'selected' : ''}>English</option></select></label>
            <label class="hf-user-select"><span><i class="fa-solid fa-palette"></i> Tema</span><select id="userMenuTheme"><option value="light" ${state.settings?.theme === 'light' ? 'selected' : ''}>Claro</option><option value="dark" ${state.settings?.theme === 'dark' ? 'selected' : ''}>Oscuro</option><option value="enterprise" ${state.settings?.theme === 'enterprise' ? 'selected' : ''}>Enterprise Slate</option><option value="executive" ${state.settings?.theme === 'executive' ? 'selected' : ''}>Executive Azul</option><option value="finance" ${state.settings?.theme === 'finance' ? 'selected' : ''}>Finanzas Verde</option></select></label>
            <label class="hf-user-select"><span><i class="fa-solid fa-money-bill-transfer"></i> Reportes</span><select id="userReportCurrency"><option value="dual" ${state.settings?.reportCurrency === 'dual' ? 'selected' : ''}>Bs + USD</option><option value="VES" ${state.settings?.reportCurrency === 'VES' ? 'selected' : ''}>Sólo Bs</option><option value="USD" ${state.settings?.reportCurrency === 'USD' ? 'selected' : ''}>Sólo USD</option></select></label>
            <button type="button" data-user-action="support"><i class="fa-brands fa-whatsapp"></i><span>Soporte</span></button>
            <button type="button" data-user-action="logout"><i class="fa-solid fa-right-from-bracket"></i><span>Cerrar sesión</span></button>
          </div>
          <input id="avatarFileInput" type="file" accept="image/*" class="hidden" />
        </div>
      </div>
    </header>

    <main class="hf-content hf-app-content">
      <div class="hf-breadcrumbs-host" data-mui-breadcrumbs data-items="${escapeHtml(JSON.stringify(breadcrumbs))}">
        <nav class="hf-breadcrumbs-fallback" aria-label="Breadcrumb">
          ${breadcrumbs.map((item, index) => item.route && !item.current ? `<button type="button" class="hf-breadcrumb-link" data-route="${item.route}" data-breadcrumb-route="${item.route}">${escapeHtml(item.label)}</button>` : `<span class="hf-breadcrumb-current" ${item.current ? 'aria-current="page"' : ''}>${escapeHtml(item.label)}</span>`).join('<i class="fa-solid fa-chevron-right"></i>')}
        </nav>
        <div class="mui-react-mount" data-mui-breadcrumb-mount></div>
      </div>

      <section class="hf-quickbar-shell" aria-label="Accesos rápidos">
        <button type="button" class="hf-quick-arrow hf-quick-left" data-quick-scroll="left" aria-label="Desplazar accesos a la izquierda"><i class="fa-solid fa-chevron-left"></i></button>
        <div class="hf-quickbar" id="quickTabs" data-mui-quicktabs data-items="${escapeHtml(JSON.stringify(quickItems))}" data-current-route="${state.route}">
          ${quickItems.map((item) => `<button class="page-tab ${item.active ? 'active' : ''} ${item.locked ? 'is-locked' : ''}" data-route="${item.route}" title="${item.locked ? 'Bloqueado por rol/perfil activo' : escapeHtml(item.label)}"><i class="fa-solid ${item.locked ? 'fa-lock' : item.icon}"></i><span>${escapeHtml(item.label)}</span></button>`).join('')}
          <div class="mui-react-mount" data-mui-quicktabs-mount></div>
        </div>
        <button type="button" class="hf-quick-arrow hf-quick-right" data-quick-scroll="right" aria-label="Desplazar accesos a la derecha"><i class="fa-solid fa-chevron-right"></i></button>
      </section>

      <section class="hf-kpi-strip" aria-label="Indicadores principales">
        ${KpiCard({ labelKey: 'currentNetTotal', valueId: 'kpiTotal', subId: 'kpiTotalUsd', icon: 'fa-sack-dollar', value: bs(state.calculation.total), sub: usd(state.calculation.totalUsdEquivalent) })}
        ${KpiCard({ labelKey: 'taxableBase', valueId: 'kpiBase', subId: 'kpiBaseSub', icon: 'fa-building-columns', value: bs(state.calculation.baseImponible), sub: usd(state.calculation.baseUsd) })}
        ${KpiCard({ labelKey: 'taxSum', valueId: 'kpiTributos', subId: 'kpiCargaFiscal', icon: 'fa-receipt', value: bs(state.calculation.taxesTotal), sub: `${percent(state.calculation.taxBurdenPct)} de la base` })}
        ${KpiCard({ labelKey: 'inventory', valueId: 'kpiInventario', subId: 'kpiStock', icon: 'fa-boxes-stacked', value: usd(inv.retailUsd), sub: `${inv.lowStock} alertas stock` })}
        ${KpiCard({ labelKey: 'ledger', valueId: 'kpiLedger', subId: 'kpiLedgerDiff', icon: 'fa-scale-balanced', value: ledger.balanced ? 'Balanceado' : bs(ledger.diff), sub: `${bs(ledger.debit)} / ${bs(ledger.credit)}` })}
        ${KpiCard({ labelKey: 'history', valueId: 'kpiHistorico', subId: 'kpiPromedio', icon: 'fa-clock-rotate-left', value: String(state.history.length), sub: bs(totalHistory / Math.max(state.history.length, 1)) })}
      </section>

      <div id="pages" class="route-enter hf-route-panel">${pagesHtml}</div>
      <a class="cg-whatsapp-float" href="https://wa.me/?text=Hola%2C%20necesito%20soporte%20t%C3%A9cnico%20con%20ContaGest-VE" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp soporte"><i class="fa-brands fa-whatsapp"></i></a>
      <div id="commandPalette" class="hf-command-layer hidden" role="dialog" aria-modal="true" aria-labelledby="commandPaletteTitle">
        <div class="hf-command-backdrop" data-command-close="true"></div>
        <section class="hf-command-box">
          <header class="hf-command-head">
            <div>
              <p class="hf-eyebrow">Centro de mando</p>
              <h2 id="commandPaletteTitle">Buscar módulos, acciones y reportes</h2>
            </div>
            <button type="button" class="hf-icon-button" data-command-close="true" aria-label="Cerrar búsqueda"><i class="fa-solid fa-xmark"></i></button>
          </header>
          <label class="hf-command-input">
            <i class="fa-solid fa-magnifying-glass"></i>
            <input id="commandSearchInput" type="search" placeholder="Ej: nueva venta, inventario, libro de ventas, empresa, roles..." autocomplete="off" />
          </label>
          <div id="commandResults" class="hf-command-results">
            ${commandItems.map((item) => `<button type="button" class="hf-command-item" data-command-route="${escapeHtml(item.route)}" data-command-keywords="${escapeHtml(`${item.label} ${item.area} ${item.keywords}`.toLowerCase())}"><span class="hf-command-icon"><i class="fa-solid ${item.icon}"></i></span><span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.area)} · ${escapeHtml(MODULE_TIERS[item.tier]?.label || 'Módulo')}</small></span><i class="fa-solid fa-arrow-right"></i></button>`).join('')}
          </div>
          <footer class="hf-command-foot"><span><kbd>Esc</kbd> cerrar</span><span><kbd>Ctrl</kbd> + <kbd>K</kbd> abrir</span></footer>
        </section>
      </div>
    </main>
  </div>`;
};
