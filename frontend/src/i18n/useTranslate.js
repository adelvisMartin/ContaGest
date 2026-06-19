import { translations } from './translations.js';

const routeTranslations = {
  es: {
    dashboard:'Dashboard', mobile:'Vista móvil', ventas:'Ventas', cotizacion:'Cotizador', clientes:'Clientes', historial:'Histórico', pedidos:'Pedidos', 'pos-sede':'POS sede', 'tracking-pedidos':'Tracking pedidos', 'delivery-mapa':'Mapa delivery', tasks:'Tareas', inventario:'Inventario', 'inventario-scan':'Escáner inventario', kardex:'Kardex', qr:'QR / Barcode', proveedores:'Proveedores', compras:'Compras', contabilidad:'Libro diario', 'plan-cuentas':'Plan de cuentas', 'libro-mayor':'Libro mayor', 'balance-sumas-saldos':'Balance de sumas y saldos', 'hoja-trabajo':'Hoja de trabajo', 'estados-financieros':'Estados financieros', 'cierre-contable':'Cierre contable', bancos:'Bancos y conciliación', 'normativa-contable':'Normativa contable', tributos:'Tributos', 'libro-ventas':'Libro de ventas', normativa:'Normativa', nomina:'Nómina', rrhh:'Recursos humanos', analytics:'Analítica', reportes:'Reportes', auditoria:'Auditoría', configuracion:'Configuración', backend:'Backend', admin:'Panel admin', marca:'Marca', 'demo-control':'Control demos', licencias:'Licencias', 'importacion-data':'Carga masiva', pretesting:'Pretesting', ayuda:'Ayuda', soporte:'Soporte'
  },
  en: {
    dashboard:'Dashboard', mobile:'Mobile view', ventas:'Sales', cotizacion:'Quoter', clientes:'Clients', historial:'History', pedidos:'Orders', 'pos-sede':'Counter POS', 'tracking-pedidos':'Order tracking', 'delivery-mapa':'Delivery map', tasks:'Tasks', inventario:'Inventory', 'inventario-scan':'Inventory scanner', kardex:'Kardex', qr:'QR / Barcode', proveedores:'Suppliers', compras:'Purchases', contabilidad:'Journal', 'plan-cuentas':'Chart of accounts', 'libro-mayor':'General ledger', 'balance-sumas-saldos':'Trial balance', 'hoja-trabajo':'Worksheet', 'estados-financieros':'Financial statements', 'cierre-contable':'Accounting close', bancos:'Banking reconciliation', 'normativa-contable':'Accounting standards', tributos:'Taxes', 'libro-ventas':'Sales book', normativa:'Regulations', nomina:'Payroll', rrhh:'Human resources', analytics:'Analytics', reportes:'Reports', auditoria:'Audit', configuracion:'Settings', backend:'Backend', admin:'Admin panel', marca:'Brand', 'demo-control':'Demo control', licencias:'Licenses', 'importacion-data':'Bulk import', pretesting:'Pretesting', ayuda:'Help', soporte:'Support'
  }
};

export function t(key, lang = 'es') {
  return translations[lang]?.[key] || translations.es[key] || key;
}

export function routeT(route, lang = 'es') {
  return routeTranslations[lang]?.[route] || routeTranslations.es[route] || route;
}

export function applyTranslations(lang = 'es') {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n, lang);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
    node.setAttribute('placeholder', t(node.dataset.i18nPlaceholder, lang));
  });
  document.querySelectorAll('[data-i18n-route]').forEach((node) => {
    node.textContent = routeT(node.dataset.i18nRoute, lang);
  });
}
