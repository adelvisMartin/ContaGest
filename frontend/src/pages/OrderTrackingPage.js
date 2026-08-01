import { PageHeader, Badge, Button, EmptyState } from '../components/ui/index.js';
import { ORDER_STATUSES, OrderService, orderStatusMeta, updateOrderStatus, estimateEta, buildTrackingUrl, buildWhatsAppOrderMessage, whatsappDeepLink } from '../services/orderService.js';
import { escapeHtml } from '../utils/dom.js';

const progressIndex = (status) => Math.max(0, ORDER_STATUSES.findIndex((item) => item.key === status));

export const OrderTrackingPage = {
  render(state, { query = {} } = {}) {
    const orders = state.foodOrders || [];
    const selectedOrder = query.order || '';
    const open = orders.filter((order)=>!['delivered','cancelled'].includes(order.status)).length;
    const delivered = orders.filter((order)=>order.status==='delivered').length;
    const late = orders.filter((order)=>order.status==='dispatched' && estimateEta(order) > 45).length;
    const cards = orders.map((order)=>{
      const index=progressIndex(order.status);
      const meta=orderStatusMeta(order.status);
      const eta=estimateEta(order);
      const selected=selectedOrder===order.id;
      const next=ORDER_STATUSES[Math.min(index+1,ORDER_STATUSES.length-2)];
      return `<article class="surface cg-tracking-card ${selected?'ring-2 ring-blue-500':''}" data-order-card="${order.id}">
        <div class="cg-tracking-head"><div><h3>${escapeHtml(order.number)}</h3><p>${escapeHtml(order.customer)} · ${escapeHtml(order.phone||'sin teléfono')} · ${escapeHtml(order.serviceMode)}</p>${order.address?`<small>${escapeHtml(order.address)}</small>`:''}</div><div class="grid gap-1 justify-items-end">${Badge(meta.label,meta.tone==='warning'?'warning':meta.tone==='danger'?'danger':'success')}<small>${eta===0?'Entregado':`ETA ${eta} min`}</small></div></div>
        <div class="cg-stepper">${ORDER_STATUSES.filter((step)=>step.key!=='cancelled').map((step,stepIndex)=>`<div class="cg-step ${stepIndex<=index?'done':''}"><span><i class="fa-solid ${step.icon}"></i></span><small>${step.label}</small></div>`).join('')}</div>
        <div class="grid gap-3 md:grid-cols-[1fr_auto]"><div class="cg-order-events">${(order.events||[]).slice(0,5).map((event)=>`<p><strong>${new Date(event.at).toLocaleTimeString('es-VE',{hour:'2-digit',minute:'2-digit'})}</strong> ${escapeHtml(event.message||event.type)}</p>`).join('')||'<p>Sin eventos.</p>'}</div><div class="grid gap-2 content-start">
          ${!['delivered','cancelled'].includes(order.status)?Button({text:`Avanzar a ${next?.label||'Entregado'}`,icon:'fa-forward',attrs:`data-order-advance="${order.id}"`}):''}
          ${Button({text:'Compartir seguimiento',icon:'fa-share-nodes',variant:'secondary',attrs:`data-order-share="${order.id}"`})}
          ${Button({text:'WhatsApp',icon:'fa-message',variant:'secondary',attrs:`data-order-whatsapp="${order.id}"`})}
          ${order.status==='dispatched'?Button({text:'Confirmar entrega',icon:'fa-camera',variant:'secondary',attrs:`data-order-proof="${order.id}"`}):''}
        </div></div>
        ${order.proofOfDelivery?`<footer class="cgx-meta-row"><span><i class="fa-solid fa-circle-check"></i> Entrega confirmada ${new Date(order.proofOfDelivery.at).toLocaleString('es-VE')}</span><span>${escapeHtml(order.proofOfDelivery.note||'Sin observación')}</span></footer>`:''}
      </article>`;
    }).join('');
    return `<section class="cg-page-stack">
      ${PageHeader({eyebrow:'Última milla',title:'Seguimiento de pedidos',description:'Estados, ETA, comunicaciones y prueba de entrega en una sola vista.',actions:Button({text:'Despacho y mapa',icon:'fa-route',variant:'secondary',attrs:'data-route="delivery-mapa"'})})}
      <div class="grid gap-3 md:grid-cols-4"><article class="cgx-metric"><div class="cgx-metric-icon"><i class="fa-solid fa-box"></i></div><div><p>Total</p><strong>${orders.length}</strong><small>Pedidos registrados</small></div></article><article class="cgx-metric"><div class="cgx-metric-icon"><i class="fa-solid fa-truck-fast"></i></div><div><p>Abiertos</p><strong>${open}</strong><small>Requieren seguimiento</small></div></article><article class="cgx-metric"><div class="cgx-metric-icon"><i class="fa-solid fa-circle-check"></i></div><div><p>Entregados</p><strong>${delivered}</strong><small>Cierre confirmado</small></div></article><article class="cgx-metric"><div class="cgx-metric-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div><p>ETA alta</p><strong>${late}</strong><small>Más de 45 minutos</small></div></article></div>
      <div class="cg-tracking-list">${cards||EmptyState({title:'Sin pedidos',description:'Los pedidos aparecerán aquí con su trazabilidad.',iconName:'fa-box-open'})}</div>
    </section>`;
  },
  mount(state,{Store,Toast,UrlStateService}) {
    const orders=()=>Store.get().foodOrders||[];
    document.querySelectorAll('[data-order-card]').forEach((card)=>card.addEventListener('click',(event)=>{if(event.target.closest('button,a'))return;UrlStateService.setParams({order:card.dataset.orderCard});}));
    document.querySelectorAll('[data-order-advance]').forEach((button)=>button.addEventListener('click',async()=>{
      const order=orders().find((item)=>item.id===button.dataset.orderAdvance);if(!order)return;
      const index=progressIndex(order.status);const next=ORDER_STATUSES[Math.min(index+1,ORDER_STATUSES.length-2)]?.key||'delivered';
      try{await OrderService.updateStatus(order.id,next);Store.update((draft)=>{const current=draft.foodOrders.find((item)=>item.id===order.id);Object.assign(current,updateOrderStatus(current,next,`Pedido ${orderStatusMeta(next).label.toLowerCase()}`));});Toast.show(`Pedido actualizado a ${orderStatusMeta(next).label}.`,'success');}catch(error){Toast.show(error.message,'error');}
    }));
    document.querySelectorAll('[data-order-share]').forEach((button)=>button.addEventListener('click',async()=>{
      const order=orders().find((item)=>item.id===button.dataset.orderShare);if(!order)return;const url=buildTrackingUrl(order);
      try{await navigator.clipboard.writeText(url);Toast.show('Enlace de seguimiento copiado.','success');}catch{window.prompt('Copia el enlace de seguimiento',url);}
    }));
    document.querySelectorAll('[data-order-whatsapp]').forEach((button)=>button.addEventListener('click',()=>{const order=orders().find((item)=>item.id===button.dataset.orderWhatsapp);if(order)window.open(whatsappDeepLink(order.phone,buildWhatsAppOrderMessage(order,state.settings?.companyName)),'_blank','noopener,noreferrer');}));
    document.querySelectorAll('[data-order-proof]').forEach((button)=>button.addEventListener('click',async()=>{
      const order=orders().find((item)=>item.id===button.dataset.orderProof);if(!order)return;const note=window.prompt('Observación de entrega','Entregado al destinatario');if(note===null)return;
      try{await OrderService.updateStatus(order.id,'delivered',{proofOfDelivery:{note}});Store.update((draft)=>{const current=draft.foodOrders.find((item)=>item.id===order.id);Object.assign(current,updateOrderStatus(current,'delivered','Entrega confirmada',{proofOfDelivery:{at:new Date().toISOString(),note}}));});Toast.show('Prueba de entrega registrada.','success');}catch(error){Toast.show(error.message,'error');}
    }));
  }
};
