import { Badge, Button, DataTable, MetricGrid, PageHeader, Section, Timeline, EmptyState } from '../components/ui/index.js';
import { bs, usd } from '../core/formatters.js';
import { calculateInventory, calculateLedger } from '../core/calculator.js';
import { escapeHtml } from '../utils/dom.js';
import { t } from '../i18n/useTranslate.js';

const safe = (value) => escapeHtml(String(value ?? ''));
const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
const validDate = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; };

function lastSixMonths(state, locale) {
  const now = new Date();
  const months = Array.from({ length:6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5-index), 1);
    return { key:monthKey(date), label:new Intl.DateTimeFormat(locale,{ month:'short' }).format(date), income:0, expense:0 };
  });
  const byKey = new Map(months.map((item)=>[item.key,item]));
  (state.sales || []).forEach((sale) => { const date=validDate(sale.date); const bucket=date&&byKey.get(monthKey(date)); if(bucket)bucket.income+=Number(sale.amount||0); });
  (state.purchases || []).forEach((purchase) => { const date=validDate(purchase.date); const bucket=date&&byKey.get(monthKey(date)); if(bucket)bucket.expense+=Number(purchase.amount||purchase.total||0)+Number(purchase.iva||0); });
  return months;
}

export const DashboardPage = {
  render(state) {
    const lang = state.settings?.lang || 'es';
    const locale = document.documentElement?.lang || 'es-VE';
    const inv = calculateInventory(state.inventory || []);
    const ledger = calculateLedger(state.ledger?.entries || []);
    const salesTotal = (state.sales || []).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const purchasesTotal = (state.purchases || []).reduce((sum, item) => sum + Number(item.amount || item.total || 0) + Number(item.iva || 0), 0);
    const payrollTotal = (state.payroll?.records || []).reduce((sum, item) => sum + Number(item.result?.net || 0), 0);
    const rate = Number(state.bcv?.rate || 0);
    const fiscalDue = Number(state.calculation?.iva || 0) + Number(state.calculation?.igtf || 0);
    const operatingMargin = salesTotal ? ((salesTotal - purchasesTotal - payrollTotal) / salesTotal) * 100 : 0;
    const rows = [
      { area:t('sales',lang), status:salesTotal ? 'Operativo' : t('noData',lang), value:bs(salesTotal), tone:salesTotal?'success':'neutral' },
      { area:t('purchases',lang), status:purchasesTotal ? 'Registrado' : t('noData',lang), value:bs(purchasesTotal), tone:purchasesTotal?'brand':'neutral' },
      { area:t('taxes',lang), status:fiscalDue ? 'Calculado' : t('pending',lang), value:bs(fiscalDue), tone:fiscalDue?'warning':'neutral' },
      { area:t('inventory',lang), status:`${state.inventory?.length || 0} SKU`, value:usd(inv.retailUsd), tone:inv.lowStock?'warning':'success' },
      { area:t('ledger',lang), status:ledger.balanced ? 'Balanceado' : 'Revisar', value:bs(ledger.diff), tone:ledger.balanced?'success':'danger' },
      { area:t('payroll',lang), status:`${state.payroll?.records?.length || 0} recibos`, value:bs(payrollTotal), tone:'brand' }
    ];
    const months = lastSixMonths(state, locale);
    const maxFlow = Math.max(1, ...months.flatMap((item)=>[item.income,item.expense]));
    const flow = months.some((item)=>item.income||item.expense)
      ? `<div class="cg-flow-list">${months.map((item)=>`<article class="cg-flow-row"><strong>${safe(item.label)}</strong><div><span>Ingresos</span><progress max="${maxFlow}" value="${item.income}"></progress><small>${safe(bs(item.income))}</small></div><div><span>Egresos</span><progress max="${maxFlow}" value="${item.expense}"></progress><small>${safe(bs(item.expense))}</small></div></article>`).join('')}</div>`
      : EmptyState({ title:t('noData',lang), description:'Registra ventas o compras para visualizar la evolución mensual.', iconName:'fa-chart-column' });

    return `<section class="cgx-page cgx-dashboard">${PageHeader({
      eyebrowKey:'dashboardEyebrow', titleKey:'dashboardTitle', descKey:'dashboardDesc',
      meta:[rate ? `BCV ${bs(rate)} / USD` : 'BCV pendiente', state.bcv?.source || t('pending',lang), ledger.balanced ? 'Contabilidad balanceada' : 'Revisar asientos'],
      actions:`${Button({ label:'Nueva venta', iconName:'fa-cash-register', route:'ventas' })}${Button({ label:t('reports',lang), iconName:'fa-file-export', variant:'secondary', route:'reportes' })}`
    })}${MetricGrid([
      { label:'Ventas acumuladas', value:bs(salesTotal), hint:rate ? usd(salesTotal/rate) : 'Tasa BCV pendiente', iconName:'fa-arrow-trend-up', tone:'success' },
      { label:'Compras y costos', value:bs(purchasesTotal), hint:rate ? usd(purchasesTotal/rate) : 'Tasa BCV pendiente', iconName:'fa-cart-shopping', tone:'warning' },
      { label:'Carga fiscal calculada', value:bs(fiscalDue), hint:'IVA + IGTF de la operación actual', iconName:'fa-landmark', tone:'brand' },
      { label:'Inventario retail', value:usd(inv.retailUsd), hint:`${inv.lowStock} alertas de stock`, iconName:'fa-boxes-stacked', tone:inv.lowStock?'warning':'neutral' },
      { label:'Nómina acumulada', value:bs(payrollTotal), hint:`${state.payroll?.records?.length || 0} recibos`, iconName:'fa-users-gear', tone:'neutral' },
      { label:'Margen operativo', value:`${operatingMargin.toFixed(1)}%`, hint:'Ventas - compras - nómina', iconName:'fa-chart-line', tone:operatingMargin>=0?'success':'danger' }
    ])}<div class="cgx-dashboard-grid">${Section({ title:'Flujo de los últimos 6 meses', subtitle:'Ingresos y egresos calculados exclusivamente a partir de operaciones registradas.', children:flow, className:'cgx-section-chart' })}${Section({
      title:'Acciones rápidas', subtitle:'Flujos principales del ERP.',
      children:`<div class="cgx-action-list">${Button({ label:'Ventas', iconName:'fa-receipt', variant:'secondary', route:'ventas' })}${Button({ label:'Inventario y kardex', iconName:'fa-boxes-stacked', variant:'secondary', route:'kardex' })}${Button({ label:'Libro de ventas', iconName:'fa-book-open', variant:'secondary', route:'libro-ventas' })}${Button({ label:'Configuración', iconName:'fa-building', variant:'secondary', route:'configuracion' })}</div>`
    })}</div><div class="cgx-dashboard-grid cgx-dashboard-grid-secondary">${Section({
      title:'Resumen operativo', subtitle:'Estado por área crítica.',
      children:DataTable({ columns:[{key:'area',label:'Área'},{key:'status',label:t('status',lang),render:(row)=>Badge({label:row.status,tone:row.tone})},{key:'value',label:'Monto / métrica',align:'right'}], rows })
    })}${Section({
      title:'Actividad y alertas', subtitle:'Señales de control basadas en el estado actual.',
      children:Timeline([
        { title:'Tasa BCV', description:state.bcv?.source || 'Pendiente de actualización', time:t('today',lang) },
        { title:'Control fiscal', description:fiscalDue ? `Carga calculada ${bs(fiscalDue)}` : 'Sin carga calculada en la operación actual', time:'Fiscal' },
        { title:'Inventario', description:`${inv.lowStock} productos requieren revisión de stock`, time:'Operaciones' },
        { title:'Documentos', description:'Membrete configurable desde Empresa y configuración', time:'Sistema' }
      ])
    })}</div></section>`;
  },
  mount() {}
};
