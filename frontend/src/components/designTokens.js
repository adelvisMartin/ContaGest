export const Tokens = {
  colors: {
    primary: '#00236f', primaryContainer: '#1e3a8a', accent: '#6366f1',
    surface: '#f7f9fb', canvas: '#ffffff', darkSurface: '#0f172a', line: '#cbd5e1',
    success: '#059669', warning: '#d97706', danger: '#ba1a1a', ink: '#191c1e'
  },
  radii: { sm: '0.25rem', md: '0.5rem', lg: '1rem', xl: '1.5rem', pill: '9999px' },
  shadow: { soft: '0 1px 4px rgba(15,23,42,.06)', lifted: '0 18px 40px rgba(15,23,42,.10)' },
  iconMap: {
    dashboard: 'fa-chart-pie', sales: 'fa-cash-register', purchases: 'fa-cart-shopping', payroll: 'fa-users-gear',
    taxes: 'fa-scale-balanced', inventory: 'fa-boxes-stacked', accounting: 'fa-book', banking: 'fa-building-columns',
    audit: 'fa-shield-halved', reports: 'fa-chart-simple', settings: 'fa-gear', export: 'fa-file-export', api: 'fa-plug-circle-bolt'
  }
};

export function icon(name, className = 'w-5') {
  return `<i class="fa-solid ${Tokens.iconMap[name] || name || 'fa-circle-dot'} ${className}"></i>`;
}
