import { PageHeader, Button, Badge, Field, EmptyState, MetricGrid, Section } from '../components/ui/index.js';
import { MapsService } from '../services/mapsService.js';
import { estimateEta, orderStatusMeta } from '../services/orderService.js';
import { escapeHtml } from '../utils/dom.js';

const safe=(value)=>escapeHtml(String(value??''));
const externalLink=(href,label,iconName='fa-arrow-up-right-from-square',variant='secondary')=>`<a class="cgx-btn cgx-btn-${variant} btn btn-${variant}" href="${safe(href)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid ${safe(iconName)}" aria-hidden="true"></i><span>${safe(label)}</span></a>`;

export const DeliveryMapPage = {
  render(state,{query={}}={}) {
    const orders=(state.foodOrders||[]).filter((order)=>order.serviceMode==='delivery'&&order.address);
    const search=String(query.search||'').toLowerCase();
    const status=query.status||'active';
    const filtered=orders.filter((order)=>{
      const matches=!search||[order.number,order.customer,order.address,order.assignedDriver].some((value)=>String(value||'').toLowerCase().includes(search));
      const statusMatches=status==='all'||(status==='active'?!['delivered','cancelled'].includes(order.status):order.status===status);
      return matches&&statusMatches;
    }).sort((a,b)=>Number(a.routeSequence||999)-Number(b.routeSequence||999));
    const active=orders.filter((order)=>!['delivered','cancelled'].includes(order.status)).length;
    const assigned=orders.filter((order)=>order.assignedDriver&&!['delivered','cancelled'].includes(order.status)).length;
    const unlocated=orders.filter((order)=>!order.geocode?.lat&&!['delivered','cancelled'].includes(order.status)).length;

    const routeCards=filtered.map((order)=>{
      const meta=orderStatusMeta(order.status);
      const mapUrl=MapsService.mapUrl(order.address);
      const directionsUrl=MapsService.directionsUrl(state.settings?.companyAddress,order.address);
      return `<article class="cgx-section cg-delivery-card">
        <header class="cgx-section-head"><div><h2>${order.routeSequence?`#${safe(order.routeSequence)} · `:''}${safe(order.number)}</h2><p>${safe(order.customer)} · ${safe(order.phone||'sin teléfono')}</p></div>${Badge(meta.label,meta.tone==='danger'?'danger':meta.tone==='warning'?'warning':'success')}</header>
        <div class="cgx-section-body cg-ui-stack cg-ui-gap-sm">
          <p class="cg-ui-muted"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${safe(order.address)}</p>
          <div class="cgx-meta-row"><span>Conductor: ${safe(order.assignedDriver||'Sin asignar')}</span><span>ETA: ${safe(estimateEta(order))} min</span>${order.deliveryWindow?`<span>Ventana: ${safe(order.deliveryWindow)}</span>`:''}<span>${order.geocode?.lat?'Dirección validada':'Geocodificación pendiente'}</span></div>
          <div class="cg-row-actions">${externalLink(mapUrl,'Ver','fa-map-pin')}${externalLink(directionsUrl,'Navegar','fa-route','primary')}${Button({text:'Asignar',icon:'fa-user-tag',variant:'secondary',attrs:`data-delivery-assign="${safe(order.id)}"`})}${Button({text:'Seguimiento',icon:'fa-timeline',variant:'secondary',attrs:`data-route="tracking-pedidos" data-query-params='${safe(JSON.stringify({order:order.id}))}'`})}</div>
        </div>
      </article>`;
    }).join('');

    const routeUrl=filtered.length?MapsService.directionsUrl(state.settings?.companyAddress,filtered[0].address):MapsService.mapUrl(state.settings?.companyAddress||'Caracas Venezuela');
    const toolbar=`<div class="cgx-toolbar"><strong>${filtered.length} entregas</strong><label><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-query-param="search" value="${safe(query.search||'')}" placeholder="Buscar pedido, cliente o dirección"></label><div><select class="select cgx-field-normalized" data-query-param="status" aria-label="Estado de entrega"><option value="active">Activas</option><option value="all" ${status==='all'?'selected':''}>Todas</option><option value="dispatched" ${status==='dispatched'?'selected':''}>En ruta</option><option value="delivered" ${status==='delivered'?'selected':''}>Entregadas</option></select>${Button({text:'Limpiar',icon:'fa-eraser',variant:'secondary',attrs:'data-query-clear="search,status"'})}</div></div>`;
    const stops=filtered.length?`<ol class="cg-ui-stack cg-ui-gap-sm cg-delivery-route-list">${filtered.map((order,index)=>`<li class="cg-ui-card cg-ui-card-body"><strong>${index+1}. ${safe(order.customer)}</strong><p class="cg-ui-muted">${safe(order.address)} · ETA ${safe(estimateEta(order))} min</p></li>`).join('')}</ol>`:EmptyState({title:'Sin paradas',description:'La ruta activa aparecerá aquí.',iconName:'fa-route'});

    return `<section class="cgx-page cg-page-stack cg-delivery-workspace">
      ${PageHeader({eyebrow:'Despacho',title:'Centro de entregas',description:'Validación de direcciones, secuencia de ruta, conductores, ETA y seguimiento.',actions:`${Button({id:'btnPlanRoutes',text:'Planificar ruta',icon:'fa-route'})}${Button({id:'btnValidateAddresses',text:'Validar direcciones',icon:'fa-location-crosshairs',variant:'secondary'})}`})}
      ${MetricGrid([
        {label:'Entregas',value:String(orders.length),hint:'Total con dirección',iconName:'fa-truck',tone:'neutral'},
        {label:'Activas',value:String(active),hint:'En operación',iconName:'fa-road',tone:active?'warning':'success'},
        {label:'Asignadas',value:String(assigned),hint:'Con conductor',iconName:'fa-user-check',tone:'brand'},
        {label:'Sin validar',value:String(unlocated),hint:'Requieren geocodificación',iconName:'fa-location-crosshairs',tone:unlocated?'warning':'success'}
      ])}
      ${Section({title:'Comando de despacho',subtitle:'Filtra las entregas, ordena la ruta y abre navegación desde la sede.',actions:externalLink(routeUrl,'Abrir navegación','fa-diamond-turn-right','primary'),children:toolbar})}
      <div class="cg-ui-grid cg-ui-grid-two cg-delivery-layout"><div class="cg-ui-stack cg-ui-gap-md">${routeCards||EmptyState({title:'Sin entregas',description:'No hay pedidos delivery para los filtros seleccionados.',iconName:'fa-route'})}</div>${Section({title:'Ruta activa',subtitle:'Secuencia sugerida por ventana y antigüedad.',children:`${stops}<div class="cg-delivery-driver-field">${Field({labelKey:'Conductor para asignación rápida',name:'dispatchDriver',id:'dispatchDriver',placeholder:'Nombre del conductor'})}<small class="cg-ui-muted">La asignación se registra en el pedido y queda disponible en seguimiento.</small></div>`})}</div>
    </section>`;
  },
  mount(_state,{Store,Toast}) {
    const activeOrders=()=>(Store.get().foodOrders||[]).filter((order)=>order.serviceMode==='delivery'&&order.address&&!['delivered','cancelled'].includes(order.status));
    document.getElementById('btnValidateAddresses')?.addEventListener('click',async()=>{
      const orders=activeOrders();if(!orders.length)return Toast.show('No hay direcciones pendientes.','warning');
      Toast.show('Validando direcciones…','info');
      const results=await Promise.all(orders.map(async(order)=>({id:order.id,result:await MapsService.geocode(order.address)})));
      Store.update((draft)=>{results.forEach(({id,result})=>{const order=draft.foodOrders.find((item)=>item.id===id);if(order)order.geocode=result;});});
      const valid=results.filter(({result})=>result.ok).length;Toast.show(`${valid} de ${results.length} direcciones validadas.`,valid===results.length?'success':'warning');
    });
    document.getElementById('btnPlanRoutes')?.addEventListener('click',()=>{
      Store.update((draft)=>{const orders=(draft.foodOrders||[]).filter((order)=>order.serviceMode==='delivery'&&order.address&&!['delivered','cancelled'].includes(order.status)).sort((a,b)=>String(a.deliveryWindow||'99:99').localeCompare(String(b.deliveryWindow||'99:99'))||new Date(a.createdAt)-new Date(b.createdAt));orders.forEach((order,index)=>{order.routeSequence=index+1;order.etaMinutes=20+index*12;});});
      Toast.show('Ruta secuenciada por ventana y antigüedad.','success');
    });
    document.querySelectorAll('[data-delivery-assign]').forEach((button)=>button.addEventListener('click',()=>{
      const input=document.getElementById('dispatchDriver');const driver=String(input?.value||'').trim();if(!driver)return Toast.show('Escribe el nombre del conductor.','warning');
      Store.update((draft)=>{const order=draft.foodOrders.find((item)=>item.id===button.dataset.deliveryAssign);if(order){order.assignedDriver=driver;order.updatedAt=new Date().toISOString();order.events=[{at:new Date().toISOString(),type:'dispatch',message:`Asignado a ${driver}`},...(order.events||[])];}});
      Toast.show('Conductor asignado.','success');
    }));
  }
};
