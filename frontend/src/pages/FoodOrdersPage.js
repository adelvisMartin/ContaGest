import { PageHeader, Button, Badge, MetricGrid, EmptyState } from '../components/ui/index.js';
import { Store } from '../state/store.js';
import { updateOrderStatus, ORDER_STATUSES, orderStatusMeta } from '../services/orderService.js';
import { NotificationService } from '../services/notificationService.js';
import { MapsService } from '../services/mapsService.js';
import { escapeHtml } from '../utils/dom.js';

const money = (value) => `$${Number(value || 0).toFixed(2)}`;
const safe = (value) => escapeHtml(String(value ?? ''));
const statusColumns = ['new','accepted','preparing','ready','dispatched','delivered'];

function orderCard(order) {
  const meta = orderStatusMeta(order.status);
  const id=safe(order.id),number=safe(order.number),customer=safe(order.customer || 'Cliente');
  const service=order.serviceMode === 'delivery' ? 'Delivery' : order.serviceMode === 'pickup' ? 'Retiro' : 'Sede';
  return `
    <article class="cg-order-card" data-order-id="${id}">
      <div class="cg-order-card-head">
        <div>
          <h3>${number}</h3>
          <p>${customer} · ${safe(service)}</p>
        </div>
        ${Badge(meta.label, meta.tone === 'danger' ? 'danger' : meta.tone === 'warning' ? 'warning' : meta.tone === 'success' ? 'success' : 'brand')}
      </div>
      <ul class="cg-order-items">
        ${(order.items || []).slice(0, 4).map((item) => `<li><span>${safe(item.qty)} × ${safe(item.name)}</span><strong>${safe(money(Number(item.qty||0) * Number(item.price||0)))}</strong></li>`).join('')}
      </ul>
      <div class="cg-order-total"><span>Total</span><strong>${safe(money(order.total))}</strong></div>
      <div class="cg-order-actions">
        ${Button({ text:'WhatsApp', icon:'fa-comment-dots', variant:'secondary', attrs:`data-whatsapp-order="${id}" type="button"` })}
        ${order.address ? Button({ text:'Mapa', icon:'fa-map-location-dot', variant:'secondary', attrs:`data-map-order="${id}" type="button"` }) : ''}
        <label class="cg-order-status-field"><span class="sr-only">Estado del pedido ${number}</span><select class="select cgx-field-normalized cg-order-select" data-status-order="${id}" aria-label="Estado del pedido ${number}">
          ${ORDER_STATUSES.map((s) => `<option value="${safe(s.key)}" ${s.key === order.status ? 'selected' : ''}>${safe(s.label)}</option>`).join('')}
        </select></label>
      </div>
    </article>`;
}

export const FoodOrdersPage = {
  render(state) {
    const orders = state.foodOrders || [];
    const total = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const pending = orders.filter((order) => !['delivered','cancelled'].includes(order.status)).length;
    return `
      <section class="cg-page-stack cg-orders-workspace">
        ${PageHeader({
          eyebrowKey:'ordersEyebrow',
          titleKey:'ordersTitle',
          descKey:'ordersDesc',
          actions:Button({ text:'Crear pedido en POS', icon:'fa-plus', route:'pos-sede', variant:'primary' }),
          meta:['Pedidos reales del tenant','Estados operativos','WhatsApp y delivery']
        })}
        ${MetricGrid([
          {label:'Pedidos activos',value:String(pending),hint:'En cocina, caja o delivery',iconName:'fa-bell-concierge',tone:pending?'warning':'success'},
          {label:'Ventas pedido',value:money(total),hint:'Acumulado en pedidos',iconName:'fa-sack-dollar',tone:'brand'},
          {label:'WhatsApp',value:String(orders.filter((order)=>order.notified).length),hint:'Notificaciones enviadas',iconName:'fa-comment-dots',tone:'neutral'},
          {label:'Delivery',value:String(orders.filter((order)=>order.serviceMode==='delivery').length),hint:'Con dirección enlazada',iconName:'fa-motorcycle',tone:'neutral'}
        ])}
        ${orders.length ? `<div class="cg-kanban" aria-label="Tablero de pedidos">
          ${statusColumns.map((status) => {
            const meta = orderStatusMeta(status);
            const list = orders.filter((order) => order.status === status);
            return `<section class="cg-kanban-col" aria-label="${safe(meta.label)}">
              <header><i class="fa-solid ${safe(meta.icon)}" aria-hidden="true"></i><span>${safe(meta.label)}</span><strong>${list.length}</strong></header>
              <div class="cg-kanban-list">${list.length ? list.map(orderCard).join('') : '<div class="cg-empty-mini">Sin pedidos</div>'}</div>
            </section>`;
          }).join('')}
        </div>` : EmptyState({title:'Sin pedidos',description:'Crea el primer pedido desde el POS. Esta vista ya no genera clientes, teléfonos ni productos ficticios.',iconName:'fa-bell-concierge'})}
      </section>`;
  },
  mount(_state, { Store, Toast, SupabaseSyncService }) {
    document.querySelectorAll('[data-status-order]').forEach((select) => {
      select.addEventListener('change', async () => {
        try {
          const saved = await SupabaseSyncService.updateFoodOrderStatus(select.dataset.statusOrder, select.value);
          Store.update((draft) => {
            draft.foodOrders = (draft.foodOrders || []).map((order) => order.id === select.dataset.statusOrder ? saved : order);
          });
          Toast.show('Estado del pedido actualizado en Supabase.', 'success');
        } catch (error) {
          Store.update((draft) => {
            draft.foodOrders = (draft.foodOrders || []).map((order) => order.id === select.dataset.statusOrder ? updateOrderStatus(order, select.value) : order);
          });
          Toast.show(`Estado actualizado localmente. Backend: ${error.message}`, 'warning');
        }
      });
    });

    document.querySelectorAll('[data-whatsapp-order]').forEach((button) => {
      button.addEventListener('click', async () => {
        const order = Store.get().foodOrders?.find((item) => item.id === button.dataset.whatsappOrder);
        if (!order) return;
        await NotificationService.notifyOrder(order, 'whatsapp', { companyName: Store.get().settings.companyName, supportPhone: Store.get().support?.whatsapp });
        Store.update((draft) => {
          draft.foodOrders = (draft.foodOrders || []).map((item) => item.id === order.id ? { ...item, notified: true, notifiedAt: new Date().toISOString() } : item);
        });
        Toast.show('WhatsApp abierto para notificación del pedido.', 'success');
      });
    });

    document.querySelectorAll('[data-map-order]').forEach((button) => {
      button.addEventListener('click', () => {
        const order = Store.get().foodOrders?.find((item) => item.id === button.dataset.mapOrder);
        if (order?.address) window.open(MapsService.mapUrl(order.address), '_blank', 'noopener,noreferrer');
      });
    });
  }
};
