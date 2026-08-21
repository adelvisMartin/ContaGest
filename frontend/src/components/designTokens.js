/*
 * Compatibility token facade.
 *
 * The canonical values live in `styles/contagest-visual-system-v12.css`.
 * This module intentionally exposes CSS variable references instead of a second
 * palette so older JS components inherit the active light/dark theme.
 */
export const Tokens = Object.freeze({
  colors: Object.freeze({
    primary: 'var(--cg-v-brand)',
    primaryContainer: 'var(--cg-v-brand-soft)',
    accent: 'var(--cg-v-brand)',
    surface: 'var(--cg-v-surface)',
    canvas: 'var(--cg-v-bg)',
    darkSurface: 'var(--cg-v-surface)',
    line: 'var(--cg-v-border)',
    success: 'var(--cg-v-success)',
    warning: 'var(--cg-v-warning)',
    danger: 'var(--cg-v-danger)',
    ink: 'var(--cg-v-text)',
    muted: 'var(--cg-v-text-muted)'
  }),
  radii: Object.freeze({
    sm: 'var(--cg-v-radius-xs)',
    md: 'var(--cg-v-radius-sm)',
    lg: 'var(--cg-v-radius-md)',
    xl: 'var(--cg-v-radius-lg)',
    pill: '9999px'
  }),
  shadow: Object.freeze({
    soft: 'var(--cg-v-shadow-1)',
    lifted: 'var(--cg-v-shadow-2)'
  }),
  typography: Object.freeze({
    metadata: 'var(--cg-v-text-2xs)',
    label: 'var(--cg-v-text-xs)',
    dense: 'var(--cg-v-text-sm)',
    body: 'var(--cg-v-text-md)',
    section: 'var(--cg-v-text-section)',
    page: 'var(--cg-v-text-page)',
    kpi: 'var(--cg-v-text-kpi)'
  }),
  iconMap: Object.freeze({
    dashboard: 'fa-chart-pie', sales: 'fa-cash-register', purchases: 'fa-cart-shopping', payroll: 'fa-users-gear',
    taxes: 'fa-scale-balanced', inventory: 'fa-boxes-stacked', accounting: 'fa-book', banking: 'fa-building-columns',
    audit: 'fa-shield-halved', reports: 'fa-chart-simple', settings: 'fa-gear', export: 'fa-file-export', api: 'fa-plug-circle-bolt'
  })
});

const safeIconName = (value) => String(value || '').replace(/[^a-zA-Z0-9_-]/g, '');
const safeClassList = (value) => String(value || '').replace(/[^a-zA-Z0-9_\-\s:/]/g, '').trim();

export function icon(name, className = 'w-5') {
  const resolved = Tokens.iconMap[name] || name || 'fa-circle-dot';
  return `<i class="fa-solid ${safeIconName(resolved)} ${safeClassList(className)}"></i>`;
}
