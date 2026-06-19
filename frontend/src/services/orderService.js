import { BackendApi } from './backendApi.js';

const uid = (prefix = 'ord') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const ORDER_STATUSES = [
  { key: 'new', label: 'Nuevo', icon: 'fa-bell', tone: 'info' },
  { key: 'accepted', label: 'Aceptado', icon: 'fa-circle-check', tone: 'success' },
  { key: 'preparing', label: 'Preparando', icon: 'fa-fire-burner', tone: 'warning' },
  { key: 'ready', label: 'Listo', icon: 'fa-bag-shopping', tone: 'brand' },
  { key: 'dispatched', label: 'En ruta', icon: 'fa-motorcycle', tone: 'info' },
  { key: 'delivered', label: 'Entregado', icon: 'fa-check-double', tone: 'success' },
  { key: 'cancelled', label: 'Cancelado', icon: 'fa-ban', tone: 'danger' }
];

export function createOrderDraft({ source = 'counter', serviceMode = 'dine_in', table = '', customer = '', phone = '', address = '', items = [], notes = '' } = {}) {
  const subtotal = items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.price || 0), 0);
  const iva = subtotal * 0.16;
  const total = subtotal + iva;
  return {
    id: uid('food'),
    number: `PED-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source,
    serviceMode,
    table,
    customer: customer || 'Cliente mostrador',
    phone,
    address,
    notes,
    status: 'new',
    paymentStatus: 'pending',
    paymentMethod: 'pendiente',
    items,
    subtotal,
    iva,
    total,
    events: [{ at: new Date().toISOString(), type: 'created', message: 'Pedido creado' }]
  };
}

export function addOrder(state, order) {
  return { ...state, foodOrders: [order, ...(state.foodOrders || [])] };
}

export function updateOrderStatus(order, status, message = '') {
  return {
    ...order,
    status,
    updatedAt: new Date().toISOString(),
    events: [
      { at: new Date().toISOString(), type: 'status', status, message: message || `Estado actualizado a ${status}` },
      ...(order.events || [])
    ]
  };
}

export function orderStatusMeta(status) {
  return ORDER_STATUSES.find((item) => item.key === status) || ORDER_STATUSES[0];
}

export function buildWhatsAppOrderMessage(order, businessName = 'ContaGest-VE') {
  const lines = (order.items || []).map((item) => `• ${item.qty} x ${item.name} = $${(Number(item.qty || 0) * Number(item.price || 0)).toFixed(2)}`);
  return [
    `*${businessName}*`,
    `Pedido: ${order.number}`,
    `Cliente: ${order.customer || 'N/D'}`,
    `Modo: ${order.serviceMode}`,
    order.table ? `Mesa: ${order.table}` : '',
    order.address ? `Dirección: ${order.address}` : '',
    '',
    ...lines,
    '',
    `Total: $${Number(order.total || 0).toFixed(2)}`,
    `Estado: ${order.status}`,
    order.notes ? `Nota: ${order.notes}` : ''
  ].filter(Boolean).join('\n');
}

export function whatsappDeepLink(phone, message) {
  const normalized = String(phone || '').replace(/[^\d]/g, '');
  const text = encodeURIComponent(message || '');
  return normalized ? `https://wa.me/${normalized}?text=${text}` : `https://wa.me/?text=${text}`;
}

export const OrderService = {
  async syncOrder(order) {
    try {
      return await BackendApi.post('/api/v1/food/orders', order);
    } catch (error) {
      return { ok: false, offline: true, error: error.message, data: order };
    }
  },
  async updateStatus(id, status) {
    try {
      return await BackendApi.post(`/api/v1/food/orders/${encodeURIComponent(id)}/status`, { status });
    } catch (error) {
      return { ok: false, offline: true, error: error.message };
    }
  }
};
