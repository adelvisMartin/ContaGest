import { PageHeader, Button } from '../components/ui/index.js';
import { MapsService } from '../services/mapsService.js';

export const DeliveryMapPage = {
  render(state) {
    const deliveryOrders = (state.foodOrders || []).filter((order) => order.serviceMode === 'delivery' && order.address);
    return `
      <section class="cg-page-stack">
        ${PageHeader({
          eyebrowKey:'deliveryEyebrow',
          titleKey:'deliveryTitle',
          descKey:'deliveryDesc',
          actions: Button({ id:'btnGeocodeAll', text:'Validar direcciones', icon:'fa-location-crosshairs', variant:'primary' })
        })}
        <div class="cg-delivery-layout">
          <section class="surface cg-delivery-map">
            <div class="cg-map-placeholder">
              <i class="fa-solid fa-map-location-dot"></i>
              <h3>Mapa operativo</h3>
              <p>Con Google Maps o Mapbox configurado, aquí se geocodifican direcciones y se abre ruta de despacho.</p>
              <a class="btn btn-secondary" href="${MapsService.mapUrl('Caracas Venezuela')}" target="_blank" rel="noopener noreferrer">Abrir mapa base</a>
            </div>
          </section>
          <aside class="surface cg-delivery-panel">
            <h3>Direcciones pendientes</h3>
            <div class="cg-delivery-list">
              ${deliveryOrders.length ? deliveryOrders.map((order) => `<article>
                <strong>${order.number}</strong>
                <span>${order.customer}</span>
                <p>${order.address}</p>
                <div class="flex gap-2 flex-wrap">
                  <a class="btn btn-secondary" target="_blank" rel="noopener noreferrer" href="${MapsService.mapUrl(order.address)}"><i class="fa-solid fa-map-pin"></i> Ver</a>
                  <a class="btn btn-primary" target="_blank" rel="noopener noreferrer" href="${MapsService.directionsUrl(state.settings.companyAddress, order.address)}"><i class="fa-solid fa-route"></i> Ruta</a>
                </div>
              </article>`).join('') : '<div class="cg-empty-mini">No hay pedidos delivery con dirección.</div>'}
            </div>
          </aside>
        </div>
      </section>`;
  },
  mount(state, { Toast }) {
    document.getElementById('btnGeocodeAll')?.addEventListener('click', async () => {
      Toast.show('Validando direcciones con proveedor de mapas o fallback...', 'info');
      const addresses = (state.foodOrders || []).filter((order) => order.address).slice(0, 5);
      await Promise.all(addresses.map((order) => MapsService.geocode(order.address)));
      Toast.show('Direcciones procesadas. Revisa enlaces de ruta.', 'success');
    });
  }
};
