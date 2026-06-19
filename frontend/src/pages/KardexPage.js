import { PageHeader, Badge } from '../components/ui/index.js';
import { buildKardex } from '../core/businessRules.js';
import { usd } from '../core/formatters.js';

export const KardexPage = {
  render(state) {
    const product = state.inventory?.[0] || {};
    const sample = [
      { id:'ini', at:new Date().toISOString(), sku:product.sku, type:'in', qty:Number(product.stock||0), unitCost:Number(product.costUsd||0), note:'Saldo inicial' },
      ...(state.inventoryMovements || [])
    ];
    const rows = buildKardex({ product, movements: sample });
    return `<section class="cg-page-stack">${PageHeader({eyebrowKey:'kardexEyebrow', titleKey:'kardexTitle', descKey:'kardexDesc'})}<div class="surface p-5 rounded-[1.5rem]"><h3 class="text-xl font-black">Producto base: ${product.name || 'N/D'} ${Badge(product.sku || 'SKU','brand')}</h3><p class="subtitle">Método: costo promedio ponderado. Todo movimiento debe quedar inmutable y auditado.</p></div><div class="pl-table-wrap"><table class="pl-table"><thead><tr><th>Fecha</th><th>Tipo</th><th>Entrada</th><th>Salida</th><th>Saldo</th><th>Costo prom.</th><th>Valor</th><th>Nota</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${new Date(r.at || r.createdAt).toLocaleString('es-VE')}</td><td>${r.type}</td><td class="num">${r.inQty}</td><td class="num">${r.outQty}</td><td class="num">${r.balanceQty}</td><td class="num">${usd(r.averageCost)}</td><td class="num">${usd(r.balanceValue)}</td><td>${r.note || ''}</td></tr>`).join('')}</tbody></table></div></section>`;
  }
};
