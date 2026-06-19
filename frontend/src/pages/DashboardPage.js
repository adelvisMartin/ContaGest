import { Badge, Button, DataTable, MetricGrid, PageHeader, Section, Timeline } from '../components/ui/index.js';
import { bs, usd } from '../core/formatters.js';
import { calculateInventory, calculateLedger } from '../core/calculator.js';

export const DashboardPage = {
  render(state) {
    const inv = calculateInventory(state.inventory || []);
    const ledger = calculateLedger(state.ledger?.entries || []);
    const salesTotal = (state.sales || []).reduce((s, item) => s + Number(item.amount || 0), 0) || 450200;
    const purchasesTotal = (state.purchases || []).reduce((s, item) => s + Number(item.amount || item.total || 0), 0) || 210500;
    const payrollTotal = (state.payroll.records || []).reduce((s, item) => s + Number(item.result?.net || 0), 0) || 120000;
    const rate = Math.max(Number(state.bcv.rate || 36.25), 1);
    const fiscalDue = Number(state.calculation?.iva || 38352) + Number(state.calculation?.igtf || 8450);
    const operatingMargin = salesTotal ? ((salesTotal - purchasesTotal - payrollTotal) / salesTotal) * 100 : 0;
    const rows = [
      { area: 'Ventas', status: 'Operativo', value: bs(salesTotal), tone: 'success' },
      { area: 'Compras', status: 'Controlado', value: bs(purchasesTotal), tone: 'warning' },
      { area: 'Fiscal', status: 'Vence en 3 días', value: bs(fiscalDue), tone: 'warning' },
      { area: 'Inventario', status: `${state.inventory.length} productos`, value: usd(inv.retailUsd), tone: inv.lowStock ? 'warning' : 'success' },
      { area: 'Contabilidad', status: ledger.balanced ? 'Balanceado' : 'Descuadre', value: bs(ledger.diff), tone: ledger.balanced ? 'success' : 'danger' },
      { area: 'Nómina', status: `${state.payroll.records.length} recibos`, value: bs(payrollTotal), tone: 'brand' }
    ];
    const months = [
      ['Ago',58,39], ['Sep',62,44], ['Oct',54,49], ['Nov',76,58], ['Dic',84,67], ['Ene',70,40]
    ];
    const chart = months.map(([m, income, expense]) => `<div class="cgx-chart-col"><div class="cgx-chart-bars"><span class="is-income" style="height:${income * 2.15}px"></span><span class="is-expense" style="height:${expense * 2.15}px"></span></div><strong>${m}</strong></div>`).join('');
    return `
      <section class="cgx-page cgx-dashboard">
        ${PageHeader({
          eyebrow: 'Panel ejecutivo ERP',
          title: 'Centro financiero y operativo',
          description: 'Vista consolidada de ventas, fiscalidad, inventario, caja y control administrativo con navegación rápida para operación diaria.',
          meta: [`BCV ${bs(state.bcv.rate)} / USD`, state.bcv.source || 'Fuente pendiente', ledger.balanced ? 'Contabilidad balanceada' : 'Revisar asientos'],
          actions: `${Button({ label: 'Nueva venta', iconName: 'fa-cash-register', route: 'ventas' })}${Button({ label: 'Reporte', iconName: 'fa-file-export', variant: 'secondary', route: 'reportes' })}`
        })}

        ${MetricGrid([
          { label: 'Ventas del período', value: bs(salesTotal), hint: usd(salesTotal / rate), iconName: 'fa-arrow-trend-up', tone: 'success', trend: '+12%' },
          { label: 'Compras y costos', value: bs(purchasesTotal), hint: usd(purchasesTotal / rate), iconName: 'fa-cart-shopping', tone: 'warning' },
          { label: 'Carga fiscal estimada', value: bs(fiscalDue), hint: 'IVA + IGTF proyectado', iconName: 'fa-landmark', tone: 'brand' },
          { label: 'Inventario retail', value: usd(inv.retailUsd), hint: `${inv.lowStock} alertas de stock`, iconName: 'fa-boxes-stacked', tone: inv.lowStock ? 'warning' : 'neutral' },
          { label: 'Nómina mensual', value: bs(payrollTotal), hint: `${state.payroll.records.length} recibos`, iconName: 'fa-users-gear', tone: 'neutral' },
          { label: 'Margen operativo', value: `${operatingMargin.toFixed(1)}%`, hint: 'Ventas - compras - nómina', iconName: 'fa-chart-line', tone: operatingMargin >= 0 ? 'success' : 'danger' }
        ])}

        <div class="cgx-dashboard-grid">
          ${Section({
            title: 'Rentabilidad últimos 6 meses',
            subtitle: 'Comparativo visual de ingresos y egresos para decisiones rápidas.',
            actions: '<span class="cgx-legend"><i class="is-income"></i> Ingresos</span><span class="cgx-legend"><i class="is-expense"></i> Egresos</span>',
            children: `<div class="cgx-chart dashboard-soft-chart">${chart}</div>`,
            className: 'cgx-section-chart'
          })}
          ${Section({
            title: 'Acciones rápidas',
            subtitle: 'Flujos principales del ERP.',
            children: `<div class="cgx-action-list">
              ${Button({ label: 'Módulo de ventas', iconName: 'fa-receipt', variant: 'secondary', route: 'ventas' })}
              ${Button({ label: 'Inventario y kardex', iconName: 'fa-boxes-stacked', variant: 'secondary', route: 'kardex' })}
              ${Button({ label: 'Libro de ventas', iconName: 'fa-book-open', variant: 'secondary', route: 'libro-ventas' })}
              ${Button({ label: 'Configuración empresa', iconName: 'fa-building', variant: 'secondary', route: 'configuracion' })}
            </div>`
          })}
        </div>

        <div class="cgx-dashboard-grid cgx-dashboard-grid-secondary">
          ${Section({
            title: 'Resumen operativo',
            subtitle: 'Estado por área crítica.',
            children: DataTable({
              columns: [
                { key: 'area', label: 'Área' },
                { key: 'status', label: 'Estado', render: (row) => Badge({ label: row.status, tone: row.tone }) },
                { key: 'value', label: 'Monto / métrica', align: 'right' }
              ],
              rows
            })
          })}
          ${Section({
            title: 'Actividad y alertas',
            subtitle: 'Eventos de control para auditoría interna.',
            children: Timeline([
              { title: 'Tasa BCV verificada', description: state.bcv.source || 'Fuente pendiente de actualizar', time: 'Hoy' },
              { title: 'Revisión fiscal sugerida', description: `Carga fiscal estimada ${bs(fiscalDue)}`, time: 'Próximo cierre' },
              { title: 'Inventario crítico', description: `${inv.lowStock} productos requieren reposición`, time: 'Operaciones' },
              { title: 'Membrete documental', description: 'Configurable desde Empresa y configuración', time: 'Listo' }
            ])
          })}
        </div>
      </section>`;
  },
  mount() {}
};
