import { PageHeader, Button, Badge } from '../components/ui/index.js';
import { Store } from '../state/store.js';
import { createOrderDraft, updateOrderStatus, ORDER_STATUSES, orderStatusMeta } from '../services/orderService.js';
import { NotificationService } from '../services/notificationService.js';
import { MapsService } from '../services/mapsService.js';

const money = (value) => `$${Number(value || 0).toFixed(2)}`;
const statusColumns = ['new','accepted','preparing','ready','dispatched','delivered'];

function orderCard(order) {
  const meta = orderStatusMeta(order.status);
  return `
    <article class="cg-order-card" data-order-id="${order.id}">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3>${order.number}</h3>
          <p>${order.customer || 'Cliente'} · ${order.serviceMode === 'delivery' ? 'Delivery' : order.serviceMode === 'pickup' ? 'Retiro' : 'Sede'}</p>
        </div>
        ${Badge(meta.label, meta.tone === 'danger' ? 'danger' : meta.tone === 'warning' ? 'warning' : meta.tone === 'success' ? 'success' : 'brand')}
      </div>
      <ul class="cg-order-items">
        ${(order.items || []).slice(0, 4).map((item) => `<li><span>${item.qty} × ${item.name}</span><strong>${money(Number(item.qty||0) * Number(item.price||0))}</strong></li>`).join('')}
      </ul>
      <div class="cg-order-total"><span>Total</span><strong>${money(order.total)}</strong></div>
      <div class="cg-order-actions">
        <button class="btn btn-secondary" data-whatsapp-order="${order.id}"><i class="fa-brands fa-whatsapp"></i> WhatsApp</button>
        ${order.address ? `<button class="btn btn-secondary" data-map-order="${order.id}"><i class="fa-solid fa-map-location-dot"></i> Mapa</button>` : ''}
        <select class="select cg-order-select" data-status-order="${order.id}">
          ${ORDER_STATUSES.map((s) => `<option value="${s.key}" ${s.key === order.status ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
      </div>
    </article>`;
}

export const FoodOrdersPage = {
  render(state) {
    const orders = state.foodOrders || [];
    const total = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const pending = orders.filter((order) => !['delivered','cancelled'].includes(order.status)).length;
    return `
      <section class="cg-page-stack">
        ${PageHeader({
          eyebrowKey: 'ordersEyebrow',
          titleKey: 'ordersTitle',
          descKey: 'ordersDesc',
          actions: `
            ${Button({ id: 'btnSeedFastFood', text: 'Pedido demo', icon: 'fa-burger', variant: 'secondary' })}
            ${Button({ id: 'btnNewFastFood', text: 'Nuevo pedido rápido', icon: 'fa-plus', variant: 'primary' })}
          `
        })}
        <div class="ds-kpi-grid">
          <article class="ds-kpi"><div class="ds-kpi-top"><span>Pedidos activos</span><i class="fa-solid fa-bell-concierge"></i></div><strong>${pending}</strong><p>En cocina, caja o delivery</p></article>
          <article class="ds-kpi"><div class="ds-kpi-top"><span>Ventas pedido</span><i class="fa-solid fa-sack-dollar"></i></div><strong>${money(total)}</strong><p>Acumulado en pedidos</p></article>
          <article class="ds-kpi"><div class="ds-kpi-top"><span>WhatsApp</span><i class="fa-brands fa-whatsapp"></i></div><strong>${orders.filter(o=>o.notified).length}</strong><p>Notificaciones enviadas</p></article>
          <article class="ds-kpi"><div class="ds-kpi-top"><span>Delivery</span><i class="fa-solid fa-motorcycle"></i></div><strong>${orders.filter(o=>o.serviceMode==='delivery').length}</strong><p>Con dirección enlazada</p></article>
        </div>
        <div class="cg-kanban">
          ${statusColumns.map((status) => {
            const meta = orderStatusMeta(status);
            const list = orders.filter((order) => order.status === status);
            return `<section class="cg-kanban-col">
              <header><i class="fa-solid ${meta.icon}"></i><span>${meta.label}</span><strong>${list.length}</strong></header>
              <div class="cg-kanban-list">${list.length ? list.map(orderCard).join('') : '<div class="cg-empty-mini">Sin pedidos</div>'}</div>
            </section>`;
          }).join('')}
        </div>
      </section>`;
  },
  mount(state, { Store, Toast, SupabaseSyncService }) {
    const sampleItems = [
      { sku: 'BUR-CLAS', name: 'Burger clásica', qty: 2, price: 7.5 },
      { sku: 'PAP-MED', name: 'Papas medianas', qty: 1, price: 2.5 },
      { sku: 'REF-355', name: 'Refresco 355ml', qty: 2, price: 1.8 }
    ];
    const createDemo = (mode = 'delivery') => createOrderDraft({
      source: 'whatsapp',
      serviceMode: mode,
      table: mode === 'dine_in' ? 'Mesa 4' : '',
      customer: mode === 'delivery' ? 'Carlos Pérez' : 'Cliente sede',
      phone: '+584120000000',
      address: mode === 'delivery' ? 'Altamira, Caracas, Venezuela' : '',
      items: sampleItems,
      notes: 'Sin cebolla, entregar con punto.'
    });

    const persistOrder = async (order, successMessage) => {
      try {
        const saved = await SupabaseSyncService.createFoodOrder(order);
        Store.update((draft) => {
          draft.foodOrders = [saved, ...(draft.foodOrders || []).filter((item) => item.id !== saved.id)];
        });
        Toast.show(`${successMessage} Guardado en Supabase.`, 'success');
      } catch (error) {
        Store.update((draft) => {
          draft.foodOrders = [{ ...order, source:'local' }, ...(draft.foodOrders || [])];
        });
        Toast.show(`${successMessage} Guardado localmente. Backend: ${error.message}`, 'warning');
      }
    };

    document.getElementById('btnSeedFastFood')?.addEventListener('click', () => {
      persistOrder(createDemo('delivery'), 'Pedido demo creado.');
    });

    document.getElementById('btnNewFastFood')?.addEventListener('click', () => {
      persistOrder(createDemo('dine_in'), 'Pedido rápido de sede creado.');
    });

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
        const order = Store.get().foodOrders?.find((o) => o.id === button.dataset.whatsappOrder);
        if (!order) return;
        await NotificationService.notifyOrder(order, 'whatsapp', { companyName: Store.get().settings.companyName, supportPhone: Store.get().support?.whatsapp });
        Store.update((draft) => {
          draft.foodOrders = (draft.foodOrders || []).map((o) => o.id === order.id ? { ...o, notified: true, notifiedAt: new Date().toISOString() } : o);
        });
        Toast.show('WhatsApp abierto para notificación del pedido.', 'success');
      });
    });

    document.querySelectorAll('[data-map-order]').forEach((button) => {
      button.addEventListener('click', () => {
        const order = Store.get().foodOrders?.find((o) => o.id === button.dataset.mapOrder);
        if (order?.address) window.open(MapsService.mapUrl(order.address), '_blank', 'noopener,noreferrer');
      });
    });
  }
};
