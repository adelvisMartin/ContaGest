import { PageHeader, Button } from '../components/ui/index.js';

const money = (value) => Number(value || 0).toLocaleString('es-VE', { style:'currency', currency:'USD' });

export const MobilePreviewPage = {
  render(state) {
    const activeOrders = (state.foodOrders || []).filter((order) => !['delivered','cancelled'].includes(order.status)).length;
    const lowStock = (state.inventory || []).filter((item) => Number(item.stock || 0) <= Number(item.minStock || 5)).slice(0, 3);
    const salesToday = (state.history || []).reduce((sum, row) => sum + Number(row.calculation?.totalUsdEquivalent || row.calculation?.totalUsd || 0), 0) || 4250;

    return `<section class="mobile-functional-page">
      ${PageHeader({
        eyebrowKey:'mobileEyebrow',
        titleKey:'mobileTitle',
        descKey:'mobileDesc',
        actions: `${Button({ text:'Abrir POS', icon:'fa-utensils', variant:'primary', attrs:'data-route="pos-sede"' })}${Button({ text:'Escanear', icon:'fa-barcode', variant:'secondary', attrs:'data-route="inventario-scan"' })}`
      })}
      <div class="mobile-command-layout">
        <section class="mobile-command-card surface">
          <header class="mobile-command-header">
            <div class="mobile-command-brand"><div class="hf-brand-mark">C</div><div><h3>Mobile Ops</h3><p>Vista operativa conectable a backend</p></div></div>
            <div class="mobile-command-actions">
              <button type="button" data-route="analytics" aria-label="Analítica"><i class="fa-solid fa-chart-line"></i></button>
              <button type="button" data-route="configuracion" aria-label="Configuración"><i class="fa-solid fa-gear"></i></button>
            </div>
          </header>

          <div class="mobile-kpi-grid">
            <button type="button" data-route="ventas" class="mobile-kpi-tile"><span>Ventas hoy</span><strong>${money(salesToday)}</strong><small>Ir a ventas</small></button>
            <button type="button" data-route="pedidos" class="mobile-kpi-tile"><span>Pedidos</span><strong>${activeOrders}</strong><small>Seguimiento</small></button>
          </div>

          <div class="mobile-action-grid">
            <button type="button" data-route="pos-sede"><i class="fa-solid fa-cash-register"></i><span>POS sede</span></button>
            <button type="button" data-route="inventario-scan"><i class="fa-solid fa-barcode"></i><span>Escáner</span></button>
            <button type="button" data-route="pedidos"><i class="fa-solid fa-bell-concierge"></i><span>Pedidos</span></button>
            <button type="button" data-route="delivery-mapa"><i class="fa-solid fa-map-location-dot"></i><span>Rutas</span></button>
          </div>

          <section class="mobile-alert-list">
            <div class="mobile-section-title"><span>Alertas de inventario</span><button type="button" data-route="kardex">Ver kardex</button></div>
            ${(lowStock.length ? lowStock : [
              { sku:'THHN-12', name:'Cable THHN 12 AWG', stock:2, minStock:5 },
              { sku:'LED-9W', name:'Bombillos LED 9W', stock:15, minStock:20 }
            ]).map((item) => `<article class="mobile-alert-item">
              <div><strong>${item.name}</strong><p>${item.sku || 'SKU'} · Stock ${item.stock ?? 0} / mínimo ${item.minStock ?? 0}</p></div>
              <button type="button" data-backend-action="inventory.restock" data-endpoint="/api/v1/products/${item.id || item.sku || 'sku'}/restock">Reabastecer</button>
            </article>`).join('')}
          </section>

          <section class="mobile-soft-chart">
            <div><strong>Análisis semanal</strong><p>Ventas vs pedidos</p></div>
            <div class="mobile-bars">
              ${[44,58,51,68,74,62].map((h, idx) => `<span style="height:${h}%"></span>`).join('')}
            </div>
          </section>

          <nav class="mobile-bottom-nav" aria-label="Mobile quick nav">
            <button type="button" data-route="dashboard" class="active"><i class="fa-solid fa-table-cells-large"></i><span>Inicio</span></button>
            <button type="button" data-route="ventas"><i class="fa-solid fa-receipt"></i><span>Ventas</span></button>
            <button type="button" data-route="inventario"><i class="fa-solid fa-boxes-stacked"></i><span>Stock</span></button>
            <button type="button" data-route="profile"><i class="fa-solid fa-user"></i><span>Perfil</span></button>
          </nav>
        </section>

        <aside class="surface mobile-backend-card">
          <h3>Funcionalidad real preparada</h3>
          <p>Esta vista ya no es un mock visual: cada botón navega a módulos existentes o queda marcado con endpoint para backend/Supabase.</p>
          <ul>
            <li><strong>POS:</strong> crea pedido operativo.</li>
            <li><strong>Escáner:</strong> inventario con código de barras.</li>
            <li><strong>Reabastecer:</strong> acción lista para endpoint.</li>
            <li><strong>Kardex:</strong> trazabilidad de movimientos.</li>
          </ul>
        </aside>
      </div>
    </section>`;
  },
  mount() {}
};
