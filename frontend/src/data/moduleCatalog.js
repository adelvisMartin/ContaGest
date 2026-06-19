export const MODULE_TIERS = {
  core: { label: 'Core real', tone: 'success', description: 'Módulos que deben estar completos para vender producción.' },
  advanced: { label: 'Módulo avanzado', tone: 'brand', description: 'Módulos fuertes que pueden venderse con alcance definido.' },
  demo: { label: 'Módulo demo/comercial', tone: 'warning', description: 'Módulos útiles para demo, preventa o personalización.' }
};

export const MODULE_AREAS = [
  'Inicio',
  'Ventas',
  'Operaciones',
  'Inventario',
  'Compras',
  'Contabilidad',
  'Fiscal',
  'RRHH',
  'Analítica',
  'Administración',
  'Soporte'
];

export const MODULE_CATALOG = [
  { route: 'dashboard', name: 'Dashboard', area: 'Inicio', tier: 'core', modes: ['contador','comercio','restaurante','servicios','admin'] },
  { route: 'mobile', name: 'Vista móvil', area: 'Inicio', tier: 'advanced', modes: ['comercio','restaurante','servicios','admin'] },

  { route: 'ventas', name: 'Ventas', area: 'Ventas', tier: 'core', modes: ['comercio','restaurante','servicios','admin'] },
  { route: 'cotizacion', name: 'Cotizador', area: 'Ventas', tier: 'core', modes: ['comercio','servicios','admin'] },
  { route: 'clientes', name: 'Clientes', area: 'Ventas', tier: 'core', modes: ['contador','comercio','restaurante','servicios','admin'] },
  { route: 'historial', name: 'Histórico', area: 'Ventas', tier: 'advanced', modes: ['comercio','servicios','admin'] },

  { route: 'pos-sede', name: 'POS sede', area: 'Operaciones', tier: 'advanced', modes: ['restaurante','comercio','admin'] },
  { route: 'pedidos', name: 'Pedidos', area: 'Operaciones', tier: 'advanced', modes: ['restaurante','comercio','admin'] },
  { route: 'tracking-pedidos', name: 'Tracking pedidos', area: 'Operaciones', tier: 'advanced', modes: ['restaurante','comercio','admin'] },
  { route: 'delivery-mapa', name: 'Delivery mapa', area: 'Operaciones', tier: 'advanced', modes: ['restaurante','comercio','admin'] },
  { route: 'tasks', name: 'Tareas', area: 'Operaciones', tier: 'advanced', modes: ['contador','comercio','restaurante','servicios','admin'] },

  { route: 'inventario', name: 'Inventario', area: 'Inventario', tier: 'core', modes: ['comercio','restaurante','admin'] },
  { route: 'inventario-scan', name: 'Escáner inventario', area: 'Inventario', tier: 'advanced', modes: ['comercio','restaurante','admin'] },
  { route: 'kardex', name: 'Kardex', area: 'Inventario', tier: 'core', modes: ['comercio','restaurante','admin'] },
  { route: 'qr', name: 'QR / Barcode', area: 'Inventario', tier: 'advanced', modes: ['comercio','restaurante','admin'] },

  { route: 'proveedores', name: 'Proveedores', area: 'Compras', tier: 'core', modes: ['comercio','restaurante','admin'] },
  { route: 'compras', name: 'Compras', area: 'Compras', tier: 'core', modes: ['contador','comercio','restaurante','admin'] },

  { route: 'contabilidad', name: 'Libro diario', area: 'Contabilidad', tier: 'core', modes: ['contador','admin'] },
  { route: 'plan-cuentas', name: 'Plan de cuentas', area: 'Contabilidad', tier: 'core', modes: ['contador','admin'] },
  { route: 'libro-mayor', name: 'Libro mayor', area: 'Contabilidad', tier: 'core', modes: ['contador','admin'] },
  { route: 'balance-sumas-saldos', name: 'Balance de sumas y saldos', area: 'Contabilidad', tier: 'core', modes: ['contador','admin'] },
  { route: 'hoja-trabajo', name: 'Hoja de trabajo', area: 'Contabilidad', tier: 'core', modes: ['contador','admin'] },
  { route: 'estados-financieros', name: 'Estados financieros', area: 'Contabilidad', tier: 'core', modes: ['contador','admin'] },
  { route: 'cierre-contable', name: 'Cierre contable', area: 'Contabilidad', tier: 'advanced', modes: ['contador','admin'] },
  { route: 'bancos', name: 'Bancos', area: 'Contabilidad', tier: 'advanced', modes: ['contador','comercio','admin'] },
  { route: 'normativa-contable', name: 'Normativa contable', area: 'Contabilidad', tier: 'advanced', modes: ['contador','admin'] },

  { route: 'tributos', name: 'Tributos', area: 'Fiscal', tier: 'core', modes: ['contador','admin'] },
  { route: 'libro-ventas', name: 'Libro de ventas', area: 'Fiscal', tier: 'core', modes: ['contador','admin'] },
  { route: 'normativa', name: 'Normativa legal', area: 'Fiscal', tier: 'advanced', modes: ['contador','admin'] },

  { route: 'nomina', name: 'Nómina', area: 'RRHH', tier: 'advanced', modes: ['contador','admin'] },
  { route: 'rrhh', name: 'Dashboard RRHH', area: 'RRHH', tier: 'advanced', modes: ['contador','admin'] },

  { route: 'analytics', name: 'Analítica', area: 'Analítica', tier: 'advanced', modes: ['admin'] },
  { route: 'reportes', name: 'Reportes', area: 'Analítica', tier: 'core', modes: ['contador','comercio','restaurante','servicios','admin'] },
  { route: 'auditoria', name: 'Auditoría', area: 'Analítica', tier: 'advanced', modes: ['contador','admin'] },

  { route: 'configuracion', name: 'Configuración', area: 'Administración', tier: 'core', modes: ['admin'] },
  { route: 'backend', name: 'Backend & APIs', area: 'Administración', tier: 'core', modes: ['admin'] },
  { route: 'admin', name: 'Panel admin', area: 'Administración', tier: 'core', modes: ['admin'] },
  { route: 'marca', name: 'Manual de marca', area: 'Administración', tier: 'advanced', modes: ['admin'] },
  { route: 'demo-control', name: 'Control demos', area: 'Administración', tier: 'core', modes: ['admin'] },
  { route: 'licencias', name: 'Licencias', area: 'Administración', tier: 'core', modes: ['admin'] },
  { route: 'importacion-data', name: 'Carga masiva', area: 'Administración', tier: 'core', modes: ['admin','contador','comercio'] },
  { route: 'reglas-negocio', name: 'Reglas de negocio', area: 'Administración', tier: 'core', modes: ['admin','contador'] },
  { route: 'modulos-madurez', name: 'Madurez módulos', area: 'Administración', tier: 'core', modes: ['admin'] },
  { route: 'pretesting', name: 'Pretesting QA', area: 'Administración', tier: 'core', modes: ['admin'] },
  { route: 'vistas', name: 'Prototipos Stitch', area: 'Administración', tier: 'demo', modes: ['demo','admin'] },
  { route: 'profile', name: 'Perfil', area: 'Administración', tier: 'advanced', modes: ['contador','comercio','restaurante','servicios','admin'] },

  { route: 'asistente-ia', name: 'Asistente IA', area: 'Soporte', tier: 'advanced', modes: ['contador','comercio','restaurante','servicios','admin'] },
  { route: 'soporte', name: 'Soporte WhatsApp', area: 'Soporte', tier: 'core', modes: ['contador','comercio','restaurante','servicios','admin'] },
  { route: 'ayuda', name: 'Ayuda', area: 'Soporte', tier: 'core', modes: ['contador','comercio','restaurante','servicios','admin'] }
];

export const BUSINESS_MODES = {
  contador: { label: 'Modo Contador', description: 'Contabilidad, fiscal, nómina y reportes.' },
  comercio: { label: 'Modo Comercio', description: 'Ventas, inventario, clientes y pedidos básicos.' },
  restaurante: { label: 'Modo Restaurante', description: 'POS, pedidos, cocina, delivery y stock.' },
  servicios: { label: 'Modo Servicios', description: 'Cotizaciones, clientes, facturación y soporte.' },
  demo: { label: 'Modo Demo Comercial', description: 'Módulos de preventa y vistas demostrativas.' },
  admin: { label: 'Modo Administrador', description: 'Todos los módulos, seguridad y configuración.' }
};

export function modulesForMode(mode = 'admin') {
  if (mode === 'admin') return MODULE_CATALOG;
  return MODULE_CATALOG.filter((module) => module.modes.includes(mode));
}

export function modulesByArea(mode = 'admin', { includeAll = false } = {}) {
  const source = includeAll ? MODULE_CATALOG : modulesForMode(mode);
  return MODULE_AREAS.reduce((acc, area) => {
    const items = source.filter((module) => module.area === area);
    if (items.length) acc[area] = items;
    return acc;
  }, {});
}
