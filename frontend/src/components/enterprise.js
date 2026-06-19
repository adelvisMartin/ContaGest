import { escapeHtml } from '../utils/dom.js';

export const MaterialIcon = (name, className = '') => `<span class="material-symbols-outlined ${className}">${escapeHtml(name)}</span>`;

export const TopIconButton = ({ icon, label, route = '', action = '', endpoint = '' }) => `
  <button type="button" class="hf-icon-button icon-action-button" aria-label="${escapeHtml(label)}" ${route ? `data-route="${escapeHtml(route)}"` : ''} ${action ? `data-backend-action="${escapeHtml(action)}"` : ''} ${endpoint ? `data-endpoint="${escapeHtml(endpoint)}"` : ''}>
    ${MaterialIcon(icon)}
  </button>`;

export const EnterpriseButton = ({ text, icon = '', variant = 'primary', id = '', attrs = '', className = '' }) => {
  const muiVariant = variant === 'primary' || variant === 'accent' ? 'contained' : 'outlined';
  return `
  <span class="mui-button-host ${className}" data-mui-button-field data-mui-text="${escapeHtml(text)}" data-mui-icon="${escapeHtml(icon)}" data-mui-variant="${muiVariant}" data-mui-color="primary">
    <button type="button" ${id ? `id="${escapeHtml(id)}"` : ''} class="cgv-btn cgv-btn-${variant} ${className}" ${attrs} data-mui-button-fallback>
      ${icon ? MaterialIcon(icon, 'text-[18px]') : ''}<span>${escapeHtml(text)}</span>
    </button>
    <span class="mui-react-mount" data-mui-button-mount></span>
  </span>`;
};

export const EnterpriseKpi = ({ label, value, sub = '', trend = '', tone = 'neutral' }) => `
  <article class="cgv-kpi-card">
    <p class="cgv-label">${escapeHtml(label)}</p>
    <div class="cgv-kpi-value">${escapeHtml(value)}</div>
    <div class="mt-3 flex items-center justify-between gap-2">
      <p class="cgv-muted text-sm">${escapeHtml(sub)}</p>
      ${trend ? `<span class="cgv-chip cgv-chip-${tone}">${trend}</span>` : ''}
    </div>
  </article>`;

export const EnterpriseShellHeader = ({ title, subtitle = '', actions = '' }) => `
  <div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
    <div>
      <h2 class="cgv-display">${escapeHtml(title)}</h2>
      ${subtitle ? `<p class="mt-2 text-base font-medium text-slate-600 dark:text-slate-300">${escapeHtml(subtitle)}</p>` : ''}
    </div>
    <div class="flex flex-wrap gap-3">${actions}</div>
  </div>`;

export const FiscalTable = ({ headers, rows }) => `
  <div class="cgv-table-shell">
    <table class="cgv-table">
      <thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>
  </div>`;

const routes = {
  dashboard: ['dashboard', 'Dashboard'],
  clientes: ['groups', 'Clientes'],
  ventas: ['payments', 'Ventas'],
  compras: ['shopping_cart', 'Compras'],
  nomina: ['badge', 'Nómina'],
  tributos: ['receipt_long', 'Impuestos'],
  inventario: ['inventory_2', 'Inventario'],
  contabilidad: ['account_balance_wallet', 'Contabilidad'],
  auditoria: ['rule', 'Auditoría'],
  reportes: ['assessment', 'Reportes'],
  configuracion: ['settings', 'Configuración']
};

export const StandaloneSideNav = ({ active = 'dashboard', mode = 'erp', brandSubtitle = 'Enterprise ERP' } = {}) => {
  const items = mode === 'brand'
    ? [
        ['dashboard', 'dashboard', 'Dashboard'], ['clientes', 'groups', 'Clients'], ['ventas', 'payments', 'Sales'], ['compras', 'shopping_cart', 'Purchases'], ['nomina', 'account_balance_wallet', 'Payroll'], ['tributos', 'receipt_long', 'Taxes'], ['inventario', 'inventory_2', 'Inventory'], ['contabilidad', 'menu_book', 'Accounting'], ['reportes', 'assessment', 'Reports'], ['marca', 'settings', 'Brand Guidelines']
      ]
    : Object.entries(routes).map(([route, [icon, label]]) => [route, icon, label]);
  return `
    <aside class="hf-sidebar ${mode === 'admin' ? 'hf-sidebar-admin' : ''}">
      <div class="hf-brand">
        <div class="hf-brand-mark">${mode === 'admin' ? MaterialIcon('domain', 'icon-fill') : 'C'}</div>
        <div>
          <h1>ContaGest-VE</h1>
          <p>${escapeHtml(brandSubtitle)}</p>
        </div>
      </div>
      ${mode !== 'brand' ? `<button class="hf-new-entry" data-route="cotizacion"><span>+</span> New Entry</button>` : ''}
      <nav class="hf-menu">
        ${items.map(([route, icon, label]) => `
          <button class="hf-menu-item ${active === route ? 'active' : ''}" data-route="${route}">
            ${MaterialIcon(icon)}<span>${escapeHtml(label)}</span>
          </button>`).join('')}
      </nav>
      ${mode === 'brand' ? `<div class="hf-sidebar-footer"><button class="hf-menu-item" data-route="ayuda">${MaterialIcon('help')}<span>Help Center</span></button><button class="hf-menu-item">${MaterialIcon('logout')}<span>Logout</span></button></div>` : ''}
    </aside>`;
};

export const StandaloneTopbar = ({ brand = 'ContaGest-VE', company = 'Empresa Demo C.A.', rif = 'J-12345678-9', mode = 'erp' } = {}) => `
  <header class="hf-topbar ${mode === 'admin' ? 'hf-topbar-admin' : ''}">
    <div class="hf-topbar-left">
      ${MaterialIcon(mode === 'sales' ? 'menu' : 'search')}
      ${mode === 'sales' ? `<strong>${escapeHtml(brand)}</strong>` : `<div class="hf-search"><span>Buscar...</span></div>`}
    </div>
    <div class="hf-topbar-actions">
      ${TopIconButton({ icon: mode === 'sales' ? 'notifications' : 'account_balance', label: mode === 'sales' ? 'Notificaciones' : 'Bancos', route: mode === 'sales' ? '' : 'bancos', action: mode === 'sales' ? 'notifications.open' : '' })}
      ${TopIconButton({ icon: mode === 'sales' ? 'help_outline' : 'notifications_active', label: mode === 'sales' ? 'Ayuda' : 'Alertas', route: mode === 'sales' ? 'ayuda' : 'auditoria' })}
      ${TopIconButton({ icon: mode === 'sales' ? 'apps' : 'smart_toy', label: mode === 'sales' ? 'Aplicaciones' : 'Asistente IA', route: mode === 'sales' ? 'vistas' : 'asistente-ia' })}
      <span class="hf-divider"></span>
      ${mode === 'admin' ? `<button class="hf-client-switch">Selector de Cliente ${MaterialIcon('arrow_drop_down', 'text-[16px]')}</button>` : `<div class="hf-company"><strong>${escapeHtml(company)}</strong><small>${escapeHtml(rif)}</small></div>`}
      <div class="hf-avatar">${mode === 'sales' ? 'ED' : 'A'}</div>
    </div>
  </header>`;

export const StandaloneLayout = ({ active, mode = 'erp', brandSubtitle = 'Enterprise ERP', topbar = true, children = '' }) => `
  <div class="hf-shell ${mode === 'brand' ? 'hf-shell-brand' : ''}">
    ${StandaloneSideNav({ active, mode, brandSubtitle })}
    <div class="hf-main">
      ${topbar ? StandaloneTopbar({ mode: mode === 'admin' ? 'admin' : 'sales' }) : ''}
      <main class="hf-content ${mode === 'brand' ? 'hf-content-brand' : ''}">${children}</main>
    </div>
  </div>`;
