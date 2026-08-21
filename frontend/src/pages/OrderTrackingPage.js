import { PageHeader, Badge, Button, EmptyState, MetricGrid } from '../components/ui/index.js';
import { ORDER_STATUSES, OrderService, orderStatusMeta, updateOrderStatus, estimateEta, buildTrackingUrl, buildWhatsAppOrderMessage, whatsappDeepLink } from '../services/orderService.js';
import { escapeHtml } from '../utils/dom.js';

const safe=(value)=>escapeHtml(String(value??''));
const progressIndex=(status)=>Math.max(0,ORDER_STATUSES.findIndex((item)=>item.key===status));

export const OrderTrackingPage = {
  render(state,{query={}}={}) {
    const orders=state.foodOrders||[];
    const selectedOrder=query.order||'';
    const open=orders.filter((order)=>!['delivered','cancelled'].includes(order.status)).length;
    const delivered=orders.filter((order)=>order.status==='delivered').length;
    const late=orders.filter((order)=>order.status==='dispatched'&&estimateEta(order)>45).length;
    const cards=orders.map((order)=>{
      const index=progressIndex(order.status);
      const meta=orderStatusMeta(order.status);
      const eta=estimateEta(order);
      const selected=selectedOrder===order.id;
      const next=ORDER_STATUSES[Math.min(index+1,ORDER_STATUSES.length-2)];
      const id=safe(order.id);
      return `<article class="cgx-section cg-tracking-card ${selected?'is-selected':''}" data-order-card="${id}">
        <header class="cgx-section-head cg-tracking-head"><div><h2>${safe(order.number)}</h2><p>${safe(order.customer)} · ${safe(order.phone||'sin teléfono')} · ${safe(order.serviceMode)}</p>${order.address?`<small class="cg-ui-muted">${safe(order.address)}</small>`:''}</div><div class="cg-ui-stack cg-ui-gap-xs cg-u-items-end">${Badge(meta.label,meta.tone==='warning'?'warning':meta.tone==='danger'?'danger':'success')}<small class="cg-ui-muted">${eta===0?'Entregado':`ETA ${safe(eta)} min`}</small></div></header>
        <div class="cgx-section-body cg-ui-stack cg-ui-gap-md">
          <div class="cg-stepper" aria-label="Progreso del pedido">${ORDER_STATUSES.filter((step)=>step.key!=='cancelled').map((step,stepIndex)=>`<div class="cg-step ${stepIndex<=index?'done':''}"><span aria-hidden="true"><i class="fa-solid ${safe(step.icon)}"></i></span><small>${safe(step.label)}</small></div>`).join('')}</div>
          <div class="cg-ui-grid cg-ui-grid-two cg-tracking-content"><div class="cg-order-events">${(order.events||[]).slice(0,5).map((event)=>`<p><strong>${safe(new Date(event.at).toLocaleTimeString('es-VE',{hour:'2-digit',minute:'2-digit'}))}</strong> ${safe(event.message||event.type)}</p>`).join('')||'<p class="cg-ui-muted">Sin eventos.</p>'}</div><div class="cg-ui-stack cg-ui-gap-sm cg-tracking-actions">
            ${!['delivered','cancelled'].includes(order.status)?Button({text:`Avanzar a ${next?.label||'Entregado'}`,icon:'fa-forward',attrs:`data-order-advance="${id}"`}):''}
            ${Button({text:'Compartir seguimiento',icon:'fa-share-nodes',variant:'secondary',attrs:`data-order-share="${id}"`})}
            ${Button({text:'WhatsApp',icon:'fa-message',variant:'secondary',attrs:`data-order-whatsapp="${id}"`})}
            ${order.status==='dispatched'?Button({text:'Confirmar entrega',icon:'fa-camera',variant:'secondary',attrs:`data-order-proof="${id}"`}):''}
          </div></div>
          ${order.proofOfDelivery?`<footer class="cgx-meta-row"><span><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Entrega confirmada ${safe(new Date(order.proofOfDelivery.at).toLocaleString('es-VE'))}</span><span>${safe(order.proofOfDelivery.note||'Sin observación')}</span></footer>`:''}
        </div>
      </article>`;
    }).join('');
    return `<section class="cgx-page cg-page-stack cg-tracking-workspace">
      ${PageHeader({eyebrow:'Última milla',title:'Seguimiento de pedidos',description:'Estados, ETA, comunicaciones y prueba de entrega en una sola vista.',actions:Button({text:'Despacho y mapa',icon:'fa-route',variant:'secondary',attrs:'data-route="delivery-mapa"'})})}
      ${MetricGrid([
        {label:'Total',value:String(orders.length),hint:'Pedidos registrados',iconName:'fa-box'},
        {label:'Abiertos',value:String(open),hint:'Requieren seguimiento',iconName:'fa-truck-fast',tone:open?'warning':'success'},
        {label:'Entregados',value:String(delivered),hint:'Cierre confirmado',iconName:'fa-circle-check',tone:'success'},
        {label:'ETA alta',value:String(late),hint:'Más de 45 minutos',iconName:'fa-triangle-exclamation',tone:late?'warning':'success'}
      ])}
      <div class="cg-tracking-list cg-ui-stack cg-ui-gap-md">${cards||EmptyState({title:'Sin pedidos',description:'Los pedidos aparecerán aquí con su trazabilidad.',iconName:'fa-box-open'})}</div>
    </section>`;
  },
  mount(state,{Store,Toast,UrlStateService}) {
    const orders=()=>Store.get().foodOrders||[];
    document.querySelectorAll('[data-order-card]').forEach((card)=>card.addEventListener('click',(event)=>{if(event.target.closest('button,a,select,input'))return;UrlStateService.setParams({order:card.dataset.orderCard});}));
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
