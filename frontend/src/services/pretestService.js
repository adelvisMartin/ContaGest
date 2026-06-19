import { API_INTEGRATIONS, integrationScore, classifyIntegration } from './integrationRegistry.js';

export const CORE_FLOWS = [
  {
    key: 'sales-to-accounting',
    name: 'Ventas → Pago → Inventario → Factura → Asiento',
    modules: ['ventas', 'pedidos', 'inventario', 'libro-ventas', 'contabilidad'],
    risks: ['correlativos duplicados', 'inventario negativo', 'asientos descuadrados'],
    controls: ['idempotencia', 'kardex', 'partida doble', 'bloqueo de período']
  },
  {
    key: 'purchase-to-stock',
    name: 'Compras → Inventario → IVA crédito → Asiento',
    modules: ['compras', 'proveedores', 'inventario', 'kardex', 'contabilidad'],
    risks: ['doble carga', 'proveedor inválido', 'costo promedio incorrecto'],
    controls: ['hash documental', 'validación RIF', 'kardex y costo promedio']
  },
  {
    key: 'hr-to-ledger',
    name: 'Nómina → Recibo → Asiento → Reporte',
    modules: ['nomina', 'rrhh', 'contabilidad', 'reportes'],
    risks: ['parámetros vencidos', 'incidencias no aprobadas', 'recibos duplicados'],
    controls: ['parámetros por vigencia', 'workflow de aprobación', 'audit log']
  },
  {
    key: 'demo-to-conversion',
    name: 'Demo → Licencia → Analítica → Conversión',
    modules: ['demo-control', 'licencias', 'analytics', 'admin'],
    risks: ['uso fuera de vigencia', 'módulos no autorizados', 'key duplicada'],
    controls: ['key única', 'fingerprint', 'heartbeat', 'vencimiento']
  }
];

export function moduleRobustness(module) {
  const base = {
    route: module.route,
    name: module.name,
    area: module.area,
    tier: module.tier,
    score: 45,
    findings: [],
    recommendation: ''
  };
  if (module.tier === 'core') base.score += 20;
  if (['Ventas','Inventario','Contabilidad','Fiscal','Administración'].includes(module.area)) base.score += 10;
  if (['libro-ventas','plan-cuentas','kardex','licencias','importacion-data','backend','analytics','inventario-scan','pedidos','pos-sede'].includes(module.route)) base.score += 18;
  if (['vistas','mobile','marca','ayuda'].includes(module.route)) base.score -= 12;
  base.score = Math.max(0, Math.min(100, base.score));
  if (base.score >= 80) base.recommendation = 'Consolidar con pruebas E2E, permisos y datos reales.';
  else if (base.score >= 65) base.recommendation = 'Subir reglas de negocio, persistencia y validaciones.';
  else base.recommendation = 'Mantener como demo o rediseñar antes de vender producción.';
  return base;
}

export function integrationReport() {
  return API_INTEGRATIONS.map((item) => ({
    ...item,
    score: integrationScore(item),
    status: classifyIntegration(item)
  }));
}
