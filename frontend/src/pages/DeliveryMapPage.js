import { PageHeader, Button, Badge, Field, EmptyState } from '../components/ui/index.js';
import { MapsService } from '../services/mapsService.js';
import { estimateEta, orderStatusMeta } from '../services/orderService.js';
import { escapeHtml } from '../utils/dom.js';

export const DeliveryMapPage = {
  render(state, { query = {} } = {}) {
    const orders = (state.foodOrders || []).filter((order)=>order.serviceMode==='delivery'&&order.address);
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
      return `<article class="cgx-section"><header class="cgx-section-head"><div><h2>${order.routeSequence?`#${order.routeSequence} · `:''}${escapeHtml(order.number)}</h2><p>${escapeHtml(order.customer)} · ${escapeHtml(order.phone||'sin teléfono')}</p></div>${Badge(meta.label,meta.tone==='danger'?'danger':meta.tone==='warning'?'warning':'success')}</header><div class="cgx-section-body grid gap-3"><p><i class="fa-solid fa-location-dot"></i> ${escapeHtml(order.address)}</p><div class="cgx-meta-row"><span>Conductor: ${escapeHtml(order.assignedDriver||'Sin asignar')}</span><span>ETA: ${estimateEta(order)} min</span>${order.deliveryWindow?`<span>Ventana: ${escapeHtml(order.deliveryWindow)}</span>`:''}${order.geocode?.lat?'<span>Dirección validada</span>':'<span>Geocodificación pendiente</span>'}</div><div class="cg-row-actions"><a class="btn btn-secondary" href="${MapsService.mapUrl(order.address)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-map-pin"></i> Ver</a><a class="btn btn-primary" href="${MapsService.directionsUrl(state.settings?.companyAddress,order.address)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-route"></i> Navegar</a><button type="button" class="btn btn-secondary" data-delivery-assign="${order.id}"><i class="fa-solid fa-user-tag"></i> Asignar</button><button type="button" class="btn btn-secondary" data-route="tracking-pedidos" data-query-params='{"order":"${order.id}"}'><i class="fa-solid fa-timeline"></i> Seguimiento</button></div></div></article>`;
    }).join('');
    const routeUrl=filtered.length?MapsService.directionsUrl(state.settings?.companyAddress,filtered[0].address):MapsService.mapUrl(state.settings?.companyAddress||'Caracas Venezuela');
    return `<section class="cg-page-stack">
      ${PageHeader({eyebrow:'Despacho',title:'Centro de entregas',description:'Validación de direcciones, secuencia de ruta, conductores, ETA y seguimiento.',actions:`${Button({id:'btnPlanRoutes',text:'Planificar ruta',icon:'fa-route'})}${Button({id:'btnValidateAddresses',text:'Validar direcciones',icon:'fa-location-crosshairs',variant:'secondary'})}`})}
      <div class="grid gap-3 md:grid-cols-4"><article class="cgx-metric"><div class="cgx-metric-icon"><i class="fa-solid fa-truck"></i></div><div><p>Entregas</p><strong>${orders.length}</strong><small>Total con dirección</small></div></article><article class="cgx-metric"><div class="cgx-metric-icon"><i class="fa-solid fa-road"></i></div><div><p>Activas</p><strong>${active}</strong><small>En operación</small></div></article><article class="cgx-metric"><div class="cgx-metric-icon"><i class="fa-solid fa-user-check"></i></div><div><p>Asignadas</p><strong>${assigned}</strong><small>Con conductor</small></div></article><article class="cgx-metric"><div class="cgx-metric-icon"><i class="fa-solid fa-location-crosshairs"></i></div><div><p>Sin validar</p><strong>${unlocated}</strong><small>Requieren geocodificación</small></div></article></div>
      <section class="cgx-section"><header class="cgx-section-head"><div><h2>Comando de despacho</h2><p>Ordena la ruta y abre navegación desde la sede.</p></div><a class="btn btn-primary" href="${routeUrl}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-diamond-turn-right"></i> Abrir navegación</a></header><div class="cgx-section-body"><div class="cgx-toolbar"><strong>${filtered.length} entregas</strong><label><i class="fa-solid fa-magnifying-glass"></i><input type="search" data-query-param="search" value="${escapeHtml(query.search||'')}" placeholder="Buscar pedido, cliente o dirección"></label><select class="select" data-query-param="status"><option value="active">Activas</option><option value="all" ${status==='all'?'selected':''}>Todas</option><option value="dispatched" ${status==='dispatched'?'selected':''}>En ruta</option><option value="delivered" ${status==='delivered'?'selected':''}>Entregadas</option></select><button class="btn btn-secondary" type="button" data-query-clear="search,status">Limpiar</button></div></div></section>
      <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]"><div class="grid gap-3">${routeCards||EmptyState({title:'Sin entregas',description:'No hay pedidos delivery para los filtros seleccionados.',iconName:'fa-route'})}</div><aside class="cgx-section"><header class="cgx-section-head"><div><h2>Ruta activa</h2><p>Secuencia sugerida por ventana y antigüedad.</p></div></header><div class="cgx-section-body"><ol class="grid gap-2">${filtered.map((order,index)=>`<li class="panel-soft p-3 rounded-xl"><strong>${index+1}. ${escapeHtml(order.customer)}</strong><br><small>${escapeHtml(order.address)} · ETA ${estimateEta(order)} min</small></li>`).join('')||'<li>Sin paradas.</li>'}</ol><hr class="my-3">${Field({labelKey:'Conductor para asignación rápida',name:'dispatchDriver',id:'dispatchDriver',placeholder:'Nombre del conductor'})}<small>La asignación se registra en el pedido y queda disponible en seguimiento.</small></div></aside></div>
    </section>`;
  },
  mount(state,{Store,Toast}) {
    const activeOrders=()=> (Store.get().foodOrders||[]).filter((order)=>order.serviceMode==='delivery'&&order.address&&!['delivered','cancelled'].includes(order.status));
    document.getElementById('btnValidateAddresses')?.addEventListener('click',async()=>{
      const orders=activeOrders();if(!orders.length)return Toast.show('No hay direcciones pendientes.','warning');
      Toast.show('Validando direcciones…','info');
      const results=await Promise.all(orders.map(async(order)=>({id:order.id,result:await MapsService.geocode(order.address)})));
      Store.update((draft)=>{results.forEach(({id,result})=>{const order=draft.foodOrders.find((item)=>item.id===id);if(order)order.geocode=result;});});
      const valid=results.filter(({result})=>result.ok).length;Toast.show(`${valid} de ${results.length} direcciones validadas.` , valid===results.length?'success':'warning');
    });
    document.getElementById('btnPlanRoutes')?.addEventListener('click',()=>{
      Store.update((draft)=>{const orders=(draft.foodOrders||[]).filter((order)=>order.serviceMode==='delivery'&&order.address&&!['delivered','cancelled'].includes(order.status)).sort((a,b)=>String(a.deliveryWindow||'99:99').localeCompare(String(b.deliveryWindow||'99:99'))||new Date(a.createdAt)-new Date(b.createdAt));orders.forEach((order,index)=>{order.routeSequence=index+1;order.etaMinutes=20+index*12;});});
      Toast.show('Ruta secuenciada por ventana y antigüedad.','success');
    });
    document.querySelectorAll('[data-delivery-assign]').forEach((button)=>button.addEventListener('click',()=>{
      const input=document.getElementById('dispatchDriver');const driver=String(input?.value||'').trim();if(!driver)return Toast.show('Escribe el nombre del conductor.','warning');
      Store.update((draft)=>{const order=draft.foodOrders.find((item)=>item.id===button.dataset.deliveryAssign);if(order){order.assignedDriver=driver;order.updatedAt=new Date().toISOString();order.events=[{at:new Date().toISOString(),type:'dispatch',message:`Asignado a ${driver}`},...(order.events||[])];}});Toast.show('Conductor asignado.','success');
    }));
  }
};
