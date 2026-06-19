import { PageHeader, StatCard, Table } from '../components/ui/index.js';
import { bs, usd } from '../core/formatters.js';
import { calculateInventory, calculateLedger } from '../core/calculator.js';
import { escapeHtml } from '../utils/dom.js';

export const ReportsPage = {
  render(state) {
    const inv = calculateInventory(state.inventory);
    const ledger = calculateLedger(state.ledger.entries);
    const sales = state.history.reduce((s, r) => s + Number(r.calculation?.total || 0), 0);
    const taxes = state.history.reduce((s, r) => s + Number(r.calculation?.taxesTotal || 0), 0);
    const purchases = state.purchases.reduce((s, r) => s + Number(r.amount || 0) + Number(r.iva || 0), 0);
    const rows = [
      ['Ventas netas históricas', bs(sales), 'Histórico'], ['Tributos facturados', bs(taxes), 'Cotizador'], ['Compras registradas', bs(purchases), 'Compras'], ['Inventario venta potencial', usd(inv.retailUsd), 'Inventario'], ['Descuadre contable', bs(ledger.diff), 'Libro diario']
    ].map(([metric, value, source]) => `<tr><td>${escapeHtml(metric)}</td><td>${escapeHtml(value)}</td><td>${escapeHtml(source)}</td></tr>`);
    return `<section class="surface rounded-[1.75rem] p-5 sm:p-7">${PageHeader({ eyebrowKey:'reportsEyebrow', titleKey:'reportsTitle', descKey:'reportsDesc' })}<div class="mb-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">${StatCard({label:'Ventas', value:bs(sales), icon:'fa-chart-line'})}${StatCard({label:'Tributos', value:bs(taxes), icon:'fa-receipt', tone:'accent'})}${StatCard({label:'Inventario', value:usd(inv.retailUsd), icon:'fa-boxes-stacked'})}${StatCard({label:'Compras', value:bs(purchases), icon:'fa-cart-shopping'})}</div><div class="panel-soft rounded-[1.5rem] p-4">${Table({ headers:[{label:'Métrica'}, {label:'Valor'}, {key:'source'}], rows })}</div></section>`;
  }, mount() {}
};
