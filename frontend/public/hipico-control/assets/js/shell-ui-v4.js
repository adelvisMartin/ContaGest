import { icon } from './ui.js';
import {
  applyThemePreference,
  cycleTheme,
  getSidebarCollapsed,
  getThemePreference,
  hasStoredTheme,
  migrateLegacyTheme,
  setSidebarCollapsed,
  setThemePreference
} from './presentation-preferences.js';

const root = document.querySelector('#app');
let enhancementQueued = false;
let utilityMenuOpen = false;

const THEME_LABELS = Object.freeze({ system: 'Sistema', light: 'Claro', dark: 'Oscuro' });
const ACTION_ICONS = Object.freeze({
  'copy-metrics': 'copy',
  'copy-balances': 'copy',
  'copy-daily': 'copy',
  'copy-plan': 'copy',
  'copy-closure': 'copy',
  'new-group': 'plus',
  'new-participant': 'plus',
  'new-movement': 'plus',
  'close-day': 'check',
  'close-week': 'check',
  'export-history': 'report',
  'export-balances': 'report',
  'export-daily-pdf': 'report',
  'export-daily-xlsx': 'report',
  'export-weekly-pdf': 'report',
  'export-weekly-xlsx': 'report',
  'export-balances-pdf': 'report',
  'export-balances-xlsx': 'report',
  'install-app': 'plus'
});
const ICON_LABELS = Object.freeze({
  'go-back': 'Volver',
  'focus-fast': 'Captura rápida',
  'calendar-prev': 'Mes anterior',
  'calendar-next': 'Mes siguiente',
  'close-modal': 'Cerrar',
  'dismiss-toast': 'Cerrar notificación',
  'toggle-theme': 'Cambiar tema'
});

function brandLockup({ hero = false } = {}) {
  return `<span class="hc-brand-lockup ${hero ? 'hc-brand-lockup--hero' : ''}" data-v4-brand><span class="hc-brand-mark" aria-hidden="true">CH</span>${hero ? '<span class="hc-brand-lockup__copy"><strong>CONTROL HÍPICO</strong><small>Consola operativa</small></span>' : ''}</span>`;
}

export function replaceLegacyBranding(scope = document) {
  scope.querySelectorAll?.('img.brand-logo').forEach((image) => {
    if (image.dataset.v4Replaced === 'true') return;
    const hero = image.classList.contains('brand-logo--wordmark') || image.classList.contains('brand-logo--splash') || image.closest('.auth-wordmark, .group-hero__logo');
    const template = document.createElement('template');
    template.innerHTML = brandLockup({ hero: Boolean(hero) });
    image.replaceWith(template.content.firstElementChild);
  });
  scope.querySelectorAll?.('img[src*="logo-control-hipico.png"]').forEach((image) => {
    const template = document.createElement('template');
    template.innerHTML = brandLockup({ hero: true });
    image.replaceWith(template.content.firstElementChild);
  });
}

function currentTheme() {
  return getThemePreference();
}

function effectiveThemeIcon(theme = currentTheme()) {
  if (theme === 'dark') return 'moon';
  if (theme === 'light') return 'sun';
  return 'settings';
}

function applyTheme(theme) {
  const value = setThemePreference(theme);
  applyThemePreference(value);
  refreshThemeControls();
  return value;
}

function migrateThemeIfNeeded() {
  if (!hasStoredTheme()) {
    migrateLegacyTheme(document.documentElement.dataset.theme || 'system');
  }
  applyThemePreference(currentTheme());
}

function refreshThemeControls() {
  const theme = currentTheme();
  document.querySelectorAll('[data-v4-action="cycle-theme"]').forEach((button) => {
    button.innerHTML = icon(effectiveThemeIcon(theme));
    button.setAttribute('title', `Tema: ${THEME_LABELS[theme]}. Cambiar tema`);
    button.setAttribute('aria-label', 'Cambiar tema');
  });
  document.querySelectorAll('[data-v4-action="set-theme"]').forEach((button) => {
    const active = button.dataset.theme === theme;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-checked', String(active));
  });
  document.querySelectorAll('[data-action="toggle-theme"]').forEach((button) => {
    button.innerHTML = icon(effectiveThemeIcon(theme));
    button.setAttribute('aria-label', 'Cambiar tema');
    button.setAttribute('title', `Tema: ${THEME_LABELS[theme]}. Cambiar tema`);
  });
}

function setMenuOpen(open, { focus = false } = {}) {
  utilityMenuOpen = Boolean(open);
  document.querySelectorAll('[data-v4-utility-menu]').forEach((menu) => {
    menu.hidden = !utilityMenuOpen;
    menu.classList.toggle('is-open', utilityMenuOpen);
  });
  document.querySelectorAll('[data-v4-action="toggle-utility-menu"]').forEach((button) => {
    button.setAttribute('aria-expanded', String(utilityMenuOpen));
    button.classList.toggle('is-active', utilityMenuOpen);
  });
  if (utilityMenuOpen && focus) {
    requestAnimationFrame(() => document.querySelector('[data-v4-utility-menu] button')?.focus());
  }
}

function utilityMarkup() {
  const theme = currentTheme();
  return `<div class="global-utility-nav" data-v4-utilities>
    <button type="button" class="v4-icon-button" data-v4-action="cycle-theme" aria-label="Cambiar tema" title="Tema: ${THEME_LABELS[theme]}. Cambiar tema">${icon(effectiveThemeIcon(theme))}</button>
    <button type="button" class="v4-icon-button" data-v4-action="toggle-utility-menu" aria-label="Abrir menú" title="Opciones" aria-haspopup="menu" aria-expanded="false">${icon('settings')}</button>
    <div class="v4-utility-menu" data-v4-utility-menu role="menu" aria-label="Opciones rápidas" hidden>
      <span class="v4-utility-menu__label">Apariencia</span>
      <button type="button" class="theme-choice ${theme === 'system' ? 'is-active' : ''}" data-v4-action="set-theme" data-theme="system" role="menuitemradio" aria-checked="${theme === 'system'}">${icon('settings')}<span>Sistema</span></button>
      <button type="button" class="theme-choice ${theme === 'light' ? 'is-active' : ''}" data-v4-action="set-theme" data-theme="light" role="menuitemradio" aria-checked="${theme === 'light'}">${icon('sun')}<span>Claro</span></button>
      <button type="button" class="theme-choice ${theme === 'dark' ? 'is-active' : ''}" data-v4-action="set-theme" data-theme="dark" role="menuitemradio" aria-checked="${theme === 'dark'}">${icon('moon')}<span>Oscuro</span></button>
      <span class="v4-utility-menu__label">Accesos</span>
      <button type="button" data-view="settings" role="menuitem">${icon('settings')}<span>Configuración</span></button>
      <button type="button" data-action="show-tips" role="menuitem">${icon('help')}<span>Ayuda</span></button>
    </div>
  </div>`;
}

function enhanceGlobalHeader(scope = document) {
  const topActions = scope.querySelector?.('.topbar .top-actions');
  if (!topActions) return;
  if (!topActions.querySelector('[data-v4-utilities]')) topActions.insertAdjacentHTML('beforeend', utilityMarkup());
  refreshThemeControls();
  setMenuOpen(utilityMenuOpen);
}

function sidebarCollapseMarkup(collapsed) {
  return `<button type="button" class="button button--ghost button--small sidebar-collapse" data-v4-action="toggle-sidebar" aria-label="${collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}" title="${collapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}">${icon(collapsed ? 'menu' : 'back')}<span>${collapsed ? 'Expandir' : 'Colapsar'}</span></button>`;
}

function enhanceSidebar(scope = document) {
  const shell = scope.querySelector?.('.shell');
  if (!shell) return;
  const collapsed = getSidebarCollapsed();
  shell.classList.toggle('is-sidebar-collapsed', collapsed);
  shell.dataset.sidebarState = collapsed ? 'collapsed' : 'expanded';
  const sidebar = shell.querySelector('.sidebar');
  if (!sidebar) return;
  sidebar.setAttribute('aria-label', 'Navegación principal');
  sidebar.querySelectorAll('.nav-button').forEach((button) => {
    const label = button.querySelector('span')?.textContent?.trim();
    if (label) {
      button.setAttribute('aria-label', label);
      button.setAttribute('title', label);
    }
  });
  const logout = sidebar.querySelector('[data-action="logout"]');
  if (logout) {
    logout.setAttribute('aria-label', 'Cerrar sesión');
    logout.setAttribute('title', 'Cerrar sesión');
  }
  const footer = sidebar.querySelector('.sidebar-footer');
  if (!footer) return;
  footer.querySelector('[data-v4-action="toggle-sidebar"]')?.remove();
  footer.insertAdjacentHTML('beforeend', sidebarCollapseMarkup(collapsed));
}

function enhanceIconButtons(scope = document) {
  scope.querySelectorAll?.('button.icon-button').forEach((button) => {
    if (!button.getAttribute('aria-label')) {
      const label = ICON_LABELS[button.dataset.action] || button.getAttribute('title') || 'Acción';
      button.setAttribute('aria-label', label);
    }
    if (!button.getAttribute('title')) button.setAttribute('title', button.getAttribute('aria-label'));
  });
}

function enhanceActionIcons(scope = document) {
  for (const [action, iconName] of Object.entries(ACTION_ICONS)) {
    scope.querySelectorAll?.(`button[data-action="${action}"]`).forEach((button) => {
      if (!button.querySelector('svg')) button.insertAdjacentHTML('afterbegin', icon(iconName));
    });
  }
}

function enhanceSurface(scope = document) {
  migrateThemeIfNeeded();
  replaceLegacyBranding(scope);
  enhanceSidebar(scope);
  enhanceGlobalHeader(scope);
  enhanceIconButtons(scope);
  enhanceActionIcons(scope);
  refreshThemeControls();
}

function scheduleEnhancement() {
  if (enhancementQueued) return;
  enhancementQueued = true;
  queueMicrotask(() => {
    enhancementQueued = false;
    enhanceSurface(document);
  });
}

function handleV4Action(button) {
  const action = button.dataset.v4Action;
  if (action === 'toggle-sidebar') {
    setSidebarCollapsed(!getSidebarCollapsed());
    enhanceSidebar(document);
    return true;
  }
  if (action === 'cycle-theme') {
    applyTheme(cycleTheme(currentTheme()));
    return true;
  }
  if (action === 'set-theme') {
    applyTheme(button.dataset.theme || 'system');
    setMenuOpen(false);
    return true;
  }
  if (action === 'toggle-utility-menu') {
    setMenuOpen(!utilityMenuOpen, { focus: !utilityMenuOpen });
    return true;
  }
  return false;
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  const legacyThemeButton = target.closest('[data-action="toggle-theme"]');
  if (legacyThemeButton) {
    event.preventDefault();
    event.stopPropagation();
    applyTheme(cycleTheme(currentTheme()));
    return;
  }

  const v4Button = target.closest('[data-v4-action]');
  if (v4Button && handleV4Action(v4Button)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  if (utilityMenuOpen && target.closest('[data-v4-utility-menu] [data-view], [data-v4-utility-menu] [data-action]')) {
    setMenuOpen(false);
    return;
  }
  if (utilityMenuOpen && !target.closest('[data-v4-utilities]')) setMenuOpen(false);
}, true);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && utilityMenuOpen) {
    setMenuOpen(false);
    document.querySelector('[data-v4-action="toggle-utility-menu"]')?.focus();
  }
});

if (root) new MutationObserver(scheduleEnhancement).observe(root, { childList: true, subtree: true });

const media = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
media?.addEventListener?.('change', () => {
  if (currentTheme() === 'system') applyThemePreference('system');
});

scheduleEnhancement();
