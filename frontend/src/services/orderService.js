import { BackendApi } from './backendApi.js';
import { RuntimePolicy } from './runtimePolicy.js';

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

export function createOrderDraft({ source = 'counter', serviceMode = 'dine_in', table = '', customer = '', phone = '', address = '', items = [], notes = '', deliveryWindow = '' } = {}) {
  const subtotal = items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.price || 0), 0);
  const iva = subtotal * 0.16;
  return {
    id: uid('food'), number: `PED-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source, serviceMode, table,
    customer: customer || 'Cliente mostrador', phone, address, notes, deliveryWindow,
    status: 'new', paymentStatus: 'pending', paymentMethod: 'pendiente', assignedDriver: '', etaMinutes: null,
    proofOfDelivery: null, items, subtotal, iva, total: subtotal + iva,
    events: [{ at: new Date().toISOString(), type: 'created', message: 'Pedido creado' }]
  };
}

export function addOrder(state, order) { return { ...state, foodOrders: [order, ...(state.foodOrders || [])] }; }

export function updateOrderStatus(order, status, message = '', extra = {}) {
  return {
    ...order, ...extra, status, updatedAt: new Date().toISOString(),
    events: [{ at: new Date().toISOString(), type: 'status', status, message: message || `Estado actualizado a ${status}` }, ...(order.events || [])]
  };
}

export function orderStatusMeta(status) { return ORDER_STATUSES.find((item) => item.key === status) || ORDER_STATUSES[0]; }

export function estimateEta(order, averageMinutes = 35) {
  if (order.status === 'delivered') return 0;
  if (Number(order.etaMinutes) >= 0) return Number(order.etaMinutes);
  const index = Math.max(0, ORDER_STATUSES.findIndex((item) => item.key === order.status));
  const remaining = Math.max(1, 5 - index);
  return Math.round((averageMinutes / 5) * remaining);
}

export function buildTrackingUrl(order) {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('module', 'tracking-pedidos');
  url.searchParams.set('order', order.id);
  return url.toString();
}

export function buildWhatsAppOrderMessage(order, businessName = 'ContaGest-VE') {
  const lines = (order.items || []).map((item) => `• ${item.qty} x ${item.name} = $${(Number(item.qty || 0) * Number(item.price || 0)).toFixed(2)}`);
  return [`*${businessName}*`,`Pedido: ${order.number}`,`Cliente: ${order.customer || 'N/D'}`,`Modo: ${order.serviceMode}`,order.table?`Mesa: ${order.table}`:'',order.address?`Dirección: ${order.address}`:'',order.deliveryWindow?`Ventana: ${order.deliveryWindow}`:'','',...lines,'',`Total: $${Number(order.total || 0).toFixed(2)}`,`Estado: ${orderStatusMeta(order.status).label}`,Number.isFinite(estimateEta(order))?`ETA: ${estimateEta(order)} min`:'',order.notes?`Nota: ${order.notes}`:'',`Seguimiento: ${buildTrackingUrl(order)}`].filter(Boolean).join('\n');
}

export function whatsappDeepLink(phone, message) {
  const normalized = String(phone || '').replace(/[^\d]/g, '');
  const text = encodeURIComponent(message || '');
  return normalized ? `https://wa.me/${normalized}?text=${text}` : `https://wa.me/?text=${text}`;
}

async function withPolicy(operation, fallback) {
  try { return await operation(); }
  catch (error) {
    const decision = RuntimePolicy.handlePersistenceFailure(error, 'la operación de delivery');
    if (decision.allowFallback) return fallback(error);
    throw new Error(decision.message);
  }
}

export const OrderService = {
  async syncOrder(order) {
    return withPolicy(() => BackendApi.post('/api/v1/food/orders', order), (error) => ({ ok:false, offline:true, error:error.message, data:order }));
  },
  async updateStatus(id, status, extra = {}) {
    return withPolicy(() => BackendApi.post(`/api/v1/food/orders/${encodeURIComponent(id)}/status`, { status, ...extra }), (error) => ({ ok:false, offline:true, error:error.message }));
  }
};
