import { PageHeader, Button } from '../components/ui/index.js';
import { createOrderDraft } from '../services/orderService.js';
import { NotificationService } from '../services/notificationService.js';

const categories = ['Combos','Burgers','Bebidas','Extras'];
const money = (value) => `$${Number(value || 0).toFixed(2)}`;

function productCard(product) {
  return `<button class="cg-pos-product" data-pos-add="${product.sku}">
    <span class="cg-pos-icon"><i class="fa-solid ${product.icon || 'fa-utensils'}"></i></span>
    <strong>${product.name}</strong>
    <small>${product.category}</small>
    <b>${money(product.price)}</b>
  </button>`;
}

function cartLine(item) {
  return `<li>
    <div><strong>${item.name}</strong><span>${item.qty} × ${money(item.price)}</span></div>
    <div class="cg-cart-line-actions">
      <button data-cart-dec="${item.sku}">−</button>
      <button data-cart-inc="${item.sku}">+</button>
    </div>
  </li>`;
}

export const FastFoodPosPage = {
  render(state) {
    const products = state.fastFoodMenu || [];
    const cart = state.posCart || [];
    const subtotal = cart.reduce((sum, item) => sum + item.qty * item.price, 0);
    const total = subtotal * 1.16;
    return `
      <section class="cg-pos-shell">
        ${PageHeader({
          eyebrowKey: 'posEyebrow',
          titleKey: 'posTitle',
          descKey: 'posDesc',
          actions: `${Button({ id: 'btnClearCart', text: 'Vaciar', icon: 'fa-trash', variant: 'secondary' })}${Button({ id: 'btnCreateCounterOrder', text: 'Crear pedido', icon: 'fa-paper-plane', variant: 'primary' })}`
        })}
        <div class="cg-pos-layout">
          <section class="cg-pos-products surface">
            <div class="cg-pos-tabs">${categories.map((cat, i) => `<button class="pl-tab ${i===0?'active':''}">${cat}</button>`).join('')}</div>
            <div class="cg-pos-grid">${products.map(productCard).join('')}</div>
          </section>
          <aside class="cg-pos-cart surface">
            <h3><i class="fa-solid fa-receipt"></i> Orden actual</h3>
            <div class="pl-form-grid">
              <label class="pl-field"><span>Mesa / canal</span><input id="posTable" class="pl-input" value="${state.posDraft?.table || 'Mesa 1'}"></label>
              <label class="pl-field"><span>Cliente</span><input id="posCustomer" class="pl-input" value="${state.posDraft?.customer || 'Cliente sede'}"></label>
              <label class="pl-field"><span>Teléfono WhatsApp</span><input id="posPhone" class="pl-input" value="${state.posDraft?.phone || '+584120000000'}"></label>
              <label class="pl-field"><span>Modo</span><select id="posMode" class="pl-input"><option value="dine_in">Atención en sede</option><option value="pickup">Retiro</option><option value="delivery">Delivery</option></select></label>
            </div>
            <ul class="cg-cart-lines">${cart.length ? cart.map(cartLine).join('') : '<li class="cg-empty-mini">Selecciona productos para vender</li>'}</ul>
            <div class="cg-cart-total"><span>Subtotal</span><b>${money(subtotal)}</b></div>
            <div class="cg-cart-total"><span>IVA 16%</span><b>${money(subtotal * .16)}</b></div>
            <div class="cg-cart-total main"><span>Total</span><b>${money(total)}</b></div>
            <button id="btnSendOrderWhatsapp" class="btn btn-secondary w-full"><i class="fa-brands fa-whatsapp"></i> Notificar por WhatsApp</button>
          </aside>
        </div>
      </section>`;
  },
  mount(state, { Store, Toast, navigate, SupabaseSyncService }) {
    const bySku = new Map((state.fastFoodMenu || []).map((p) => [p.sku, p]));
    const updateCart = (sku, delta) => {
      Store.update((draft) => {
        const product = bySku.get(sku);
        if (!product) return draft;
        const existing = (draft.posCart || []).find((item) => item.sku === sku);
        if (!existing && delta > 0) draft.posCart = [...(draft.posCart || []), { sku, name: product.name, price: product.price, qty: 1 }];
        else draft.posCart = (draft.posCart || []).map((item) => item.sku === sku ? { ...item, qty: Math.max(0, item.qty + delta) } : item).filter((item) => item.qty > 0);
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
        source: 'counter',
        serviceMode: document.getElementById('posMode')?.value || 'dine_in',
        table: document.getElementById('posTable')?.value || '',
        customer: document.getElementById('posCustomer')?.value || '',
        phone: document.getElementById('posPhone')?.value || '',
        items: latest.posCart || []
      });
    };
    document.getElementById('btnCreateCounterOrder')?.addEventListener('click', async () => {
      const order = buildOrder();
      if (!order.items.length) return Toast.show('Agrega productos antes de crear el pedido.', 'warning');
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
      await NotificationService.notifyOrder(order, 'whatsapp', { companyName: Store.get().settings.companyName });
    });
  }
};
