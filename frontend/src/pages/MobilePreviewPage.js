import { PageHeader, Button, EmptyState, Badge } from '../components/ui/index.js';
import { escapeHtml } from '../utils/dom.js';

const money = (value) => Number(value || 0).toLocaleString('es-VE', { style:'currency', currency:'USD' });
const safe=(value)=>escapeHtml(String(value??''));

export const MobilePreviewPage = {
  render(state) {
    const activeOrders=(state.foodOrders||[]).filter((order)=>!['delivered','cancelled'].includes(order.status)).length;
    const lowStock=(state.inventory||[]).filter((item)=>Number(item.stock||0)<=Number(item.minStock||5)).slice(0,4);
    const salesToday=(state.history||[]).reduce((sum,row)=>sum+Number(row.calculation?.totalUsdEquivalent||row.calculation?.totalUsd||0),0);

    return `<section class="cg-page-stack mobile-functional-page">
      ${PageHeader({
        eyebrowKey:'mobileEyebrow',
        titleKey:'mobileTitle',
        descKey:'mobileDesc',
        actions:`${Button({text:'Abrir POS',icon:'fa-cash-register',variant:'primary',attrs:'data-route="pos-sede"'})}${Button({text:'Escanear',icon:'fa-barcode',variant:'secondary',attrs:'data-route="inventario-scan"'})}`
      })}
      <div class="mobile-command-layout">
        <section class="mobile-command-card surface">
          <header class="mobile-command-header"><div><p class="cgx-eyebrow">Operación móvil</p><h3>Accesos rápidos</h3><p class="cg-ui-muted">Datos reales del estado actual; sin registros de demostración inyectados.</p></div><div>${Badge('Vista operativa','brand')}</div></header>
          <div class="mobile-kpi-grid">
            <button type="button" data-route="ventas" class="mobile-kpi-tile"><span>Ventas registradas</span><strong>${safe(money(salesToday))}</strong><small>Abrir ventas</small></button>
            <button type="button" data-route="pedidos" class="mobile-kpi-tile"><span>Pedidos activos</span><strong>${activeOrders}</strong><small>Abrir seguimiento</small></button>
          </div>
          <div class="mobile-action-grid">
            <button type="button" data-route="pos-sede"><i class="fa-solid fa-cash-register"></i><span>POS sede</span></button>
            <button type="button" data-route="inventario-scan"><i class="fa-solid fa-barcode"></i><span>Escáner</span></button>
            <button type="button" data-route="pedidos"><i class="fa-solid fa-bell-concierge"></i><span>Pedidos</span></button>
            <button type="button" data-route="delivery-mapa"><i class="fa-solid fa-map-location-dot"></i><span>Rutas</span></button>
          </div>
          <section class="mobile-alert-list">
            <div class="mobile-section-title"><span>Alertas de inventario</span><button type="button" data-route="kardex">Ver kardex</button></div>
            ${lowStock.length?lowStock.map((item)=>`<article class="mobile-alert-item"><div><strong>${safe(item.name||'Producto')}</strong><p>${safe(item.sku||'SKU')} · Stock ${safe(item.stock??0)} / mínimo ${safe(item.minStock??0)}</p></div><button type="button" data-route="inventario">Revisar stock</button></article>`).join(''):EmptyState({title:'Sin alertas de stock',description:'No hay productos registrados por debajo del mínimo.',iconName:'fa-box-open'})}
          </section>
          <nav class="mobile-bottom-nav" aria-label="Navegación móvil rápida">
            <button type="button" data-route="dashboard" class="active"><i class="fa-solid fa-table-cells-large"></i><span>Inicio</span></button>
            <button type="button" data-route="ventas"><i class="fa-solid fa-receipt"></i><span>Ventas</span></button>
            <button type="button" data-route="inventario"><i class="fa-solid fa-boxes-stacked"></i><span>Stock</span></button>
            <button type="button" data-route="profile"><i class="fa-solid fa-user"></i><span>Perfil</span></button>
          </nav>
        </section>
        <aside class="surface mobile-backend-card"><h3>Atajos conectados</h3><p>Los controles de esta vista únicamente navegan a módulos operativos existentes. Las mutaciones de inventario, ventas y pedidos se realizan dentro de sus flujos autorizados.</p><ul><li><strong>POS:</strong> crea pedidos desde el módulo de caja.</li><li><strong>Escáner:</strong> registra lecturas de inventario.</li><li><strong>Stock:</strong> los ajustes se hacen en Inventario/Kardex.</li><li><strong>Delivery:</strong> abre despacho y seguimiento.</li></ul></aside>
      </div>
    </section>`;
  },
  mount() {}
};
