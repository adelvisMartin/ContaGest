import { PageHeader, Button, Field, Select, EmptyState } from '../components/ui/index.js';
import { createOrderDraft } from '../services/orderService.js';
import { NotificationService } from '../services/notificationService.js';
import { escapeHtml } from '../utils/dom.js';

const categories = ['Combos','Burgers','Bebidas','Extras'];
const safe = (value) => escapeHtml(String(value ?? ''));
const money = (value) => `$${Number(value || 0).toFixed(2)}`;

function productCard(product) {
  const sku=safe(product.sku);
  const name=safe(product.name || 'Producto');
  const category=safe(product.category || 'General');
  const rawIcon=String(product.icon || 'fa-utensils').replace(/[^a-z0-9-]/gi,'');
  return `<button type="button" class="cg-pos-product" data-pos-add="${sku}" aria-label="Agregar ${name} a la orden">
    <span class="cg-pos-icon" aria-hidden="true"><i class="fa-solid ${rawIcon}"></i></span>
    <strong>${name}</strong>
    <small>${category}</small>
    <b>${safe(money(product.price))}</b>
  </button>`;
}

function cartLine(item) {
  const sku=safe(item.sku),name=safe(item.name || 'Producto');
  return `<li>
    <div><strong>${name}</strong><span>${safe(item.qty)} × ${safe(money(item.price))}</span></div>
    <div class="cg-cart-line-actions" aria-label="Cantidad de ${name}">
      <button type="button" data-cart-dec="${sku}" aria-label="Quitar una unidad de ${name}">−</button>
      <button type="button" data-cart-inc="${sku}" aria-label="Agregar una unidad de ${name}">+</button>
    </div>
  </li>`;
}

export const FastFoodPosPage = {
  render(state) {
    const products = state.fastFoodMenu || [];
    const cart = state.posCart || [];
    const subtotal = cart.reduce((sum, item) => sum + item.qty * item.price, 0);
    const total = subtotal * 1.16;
    const draft=state.posDraft||{};
    const productContent=products.length
      ? `<div class="cg-pos-grid">${products.map(productCard).join('')}</div>`
      : EmptyState({title:'Sin productos disponibles',description:'Agrega productos reales al menú antes de iniciar una venta.',iconName:'fa-burger'});

    return `
      <section class="cg-page-stack cg-pos-shell">
        ${PageHeader({
          eyebrowKey:'posEyebrow',
          titleKey:'posTitle',
          descKey:'posDesc',
          actions:`${Button({ id:'btnClearCart', text:'Vaciar', icon:'fa-trash', variant:'secondary' })}${Button({ id:'btnCreateCounterOrder', text:'Crear pedido', icon:'fa-paper-plane', variant:'primary' })}`,
          meta:['Carrito persistente','Pedido real','Canal y cliente explícitos']
        })}
        <div class="cg-pos-layout">
          <section class="cg-pos-products surface" aria-label="Productos disponibles">
            <nav class="cg-pos-tabs" aria-label="Categorías del menú">${categories.map((cat, i) => `<button type="button" class="pl-tab ${i===0?'active':''}" aria-pressed="${i===0?'true':'false'}">${safe(cat)}</button>`).join('')}</nav>
            ${productContent}
          </section>
          <aside class="cg-pos-cart surface" aria-label="Orden actual">
            <h3><i class="fa-solid fa-receipt" aria-hidden="true"></i> Orden actual</h3>
            <div class="cg-record-fields cg-fields-compact cg-pos-order-fields">
              ${Field({ id:'posTable', labelKey:'Mesa / canal', name:'table', value:draft.table || '', placeholder:'Ej. Mesa 4, mostrador o retiro' })}
              ${Field({ id:'posCustomer', labelKey:'Cliente', name:'customer', value:draft.customer || '', placeholder:'Nombre del cliente' })}
              ${Field({ id:'posPhone', labelKey:'Teléfono WhatsApp', name:'phone', value:draft.phone || '', placeholder:'Ej. +58 412 0000000', attrs:'inputmode="tel" autocomplete="tel"' })}
              ${Select({ labelKey:'Modo', name:'mode', value:draft.mode || 'dine_in', attrs:'id="posMode"', options:[
                {value:'dine_in',label:'Atención en sede'},
                {value:'pickup',label:'Retiro'},
                {value:'delivery',label:'Delivery'}
              ] })}
            </div>
            <ul class="cg-cart-lines" aria-live="polite">${cart.length ? cart.map(cartLine).join('') : '<li class="cg-empty-mini">Selecciona productos para vender</li>'}</ul>
            <div class="cg-cart-total"><span>Subtotal</span><b>${safe(money(subtotal))}</b></div>
            <div class="cg-cart-total"><span>IVA 16%</span><b>${safe(money(subtotal * .16))}</b></div>
            <div class="cg-cart-total main"><span>Total</span><b>${safe(money(total))}</b></div>
            ${Button({ id:'btnSendOrderWhatsapp', text:'Notificar por WhatsApp', icon:'fa-brands fa-whatsapp', variant:'secondary', className:'w-full' })}
          </aside>
        </div>
      </section>`;
  },
  mount(state, { Store, Toast, navigate, SupabaseSyncService }) {
    const bySku = new Map((state.fastFoodMenu || []).map((p) => [String(p.sku), p]));
    const updateCart = (sku, delta) => {
      Store.update((draft) => {
        const product = bySku.get(String(sku));
        if (!product) return draft;
        const existing = (draft.posCart || []).find((item) => String(item.sku) === String(sku));
        if (!existing && delta > 0) draft.posCart = [...(draft.posCart || []), { sku:product.sku, name:product.name, price:product.price, qty:1 }];
        else draft.posCart = (draft.posCart || []).map((item) => String(item.sku) === String(sku) ? { ...item, qty: Math.max(0, item.qty + delta) } : item).filter((item) => item.qty > 0);
        return draft;
      });
    };
    document.querySelectorAll('[data-pos-add]').forEach((button) => button.addEventListener('click', () => updateCart(button.dataset.posAdd, 1)));
    document.querySelectorAll('[data-cart-inc]').forEach((button) => button.addEventListener('click', () => updateCart(button.dataset.cartInc, 1)));
    document.querySelectorAll('[data-cart-dec]').forEach((button) => button.addEventListener('click', () => updateCart(button.dataset.cartDec, -1)));
    document.getElementById('btnClearCart')?.addEventListener('click', () => Store.set({ posCart: [] }));

    const buildOrder = () => {
      const latest = Store.get();
      return createOrderDraft({
        source:'counter',
        serviceMode:document.getElementById('posMode')?.value || 'dine_in',
        table:document.getElementById('posTable')?.value || '',
        customer:document.getElementById('posCustomer')?.value || '',
        phone:document.getElementById('posPhone')?.value || '',
        items:latest.posCart || []
      });
    };
    document.getElementById('btnCreateCounterOrder')?.addEventListener('click', async () => {
      const order = buildOrder();
      if (!order.items.length) return Toast.show('Agrega productos antes de crear el pedido.', 'warning');
      if (!String(order.customer||'').trim()) return Toast.show('Indica el nombre del cliente.', 'warning');
      try {
        const saved = await SupabaseSyncService.createFoodOrder(order);
        Store.update((draft) => { draft.foodOrders = [saved, ...(draft.foodOrders || []).filter((item) => item.id !== saved.id)]; draft.posCart = []; });
        Toast.show('Pedido creado en Supabase y enviado a cocina.', 'success');
      } catch (error) {
        Store.update((draft) => { draft.foodOrders = [{ ...order, source:'local' }, ...(draft.foodOrders || [])]; draft.posCart = []; });
        Toast.show(`Pedido creado localmente. Backend: ${error.message}`, 'warning');
      }
      navigate('pedidos');
    });
    document.getElementById('btnSendOrderWhatsapp')?.addEventListener('click', async () => {
      const order = buildOrder();
      if (!order.items.length) return Toast.show('Agrega productos antes de notificar.', 'warning');
      if (!String(order.phone||'').trim()) return Toast.show('Indica el teléfono real del cliente antes de abrir WhatsApp.', 'warning');
      await NotificationService.notifyOrder(order, 'whatsapp', { companyName: Store.get().settings.companyName });
    });
  }
};
