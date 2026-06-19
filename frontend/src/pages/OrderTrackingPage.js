import { PageHeader, Badge } from '../components/ui/index.js';
import { ORDER_STATUSES, orderStatusMeta } from '../services/orderService.js';

const progressIndex = (status) => Math.max(0, ORDER_STATUSES.findIndex((s) => s.key === status));

export const OrderTrackingPage = {
  render(state) {
    const orders = state.foodOrders || [];
    return `
      <section class="cg-page-stack">
        ${PageHeader({ eyebrowKey:'trackingEyebrow', titleKey:'trackingTitle', descKey:'trackingDesc' })}
        <div class="cg-tracking-list">
          ${orders.length ? orders.map((order) => {
            const idx = progressIndex(order.status);
            const meta = orderStatusMeta(order.status);
            return `<article class="surface cg-tracking-card">
              <div class="cg-tracking-head">
                <div><h3>${order.number}</h3><p>${order.customer} · ${order.phone || 'sin teléfono'} · ${order.serviceMode}</p></div>
                ${Badge(meta.label, meta.tone === 'warning' ? 'warning' : meta.tone === 'danger' ? 'danger' : 'success')}
              </div>
              <div class="cg-stepper">
                ${ORDER_STATUSES.filter(s => s.key !== 'cancelled').map((step, i) => `<div class="cg-step ${i <= idx ? 'done' : ''}"><span><i class="fa-solid ${step.icon}"></i></span><small>${step.label}</small></div>`).join('')}
              </div>
              <div class="cg-order-events">
                ${(order.events || []).slice(0, 4).map((ev) => `<p><strong>${new Date(ev.at).toLocaleTimeString('es-VE')}</strong> ${ev.message || ev.type}</p>`).join('')}
              </div>
            </article>`;
          }).join('') : '<div class="pl-empty">Aún no hay pedidos para seguimiento.</div>'}
        </div>
      </section>`;
  }
};
