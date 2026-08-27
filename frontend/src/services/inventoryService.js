import { BackendApi } from './backendApi.js';

const idempotencyKey = (scope='inventory') => {
  if (globalThis.crypto?.randomUUID) return `cg-${scope}-${globalThis.crypto.randomUUID()}`;
  return `cg-${scope}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const precise = (value) => String(value ?? '').trim();

const normalizeProduct = (product) => ({
  ...product,
  category: product.description || 'Inventario',
  stock: Number(product.stock ?? 0),
  reserved: Number(product.reserved ?? 0),
  available: Number(product.available ?? (Number(product.stock ?? 0) - Number(product.reserved ?? 0))),
  min: Number(product.minStock ?? 0),
  costUsd: Number(product.cost ?? 0),
  priceUsd: Number(product.price ?? 0),
  source: 'supabase'
});

const normalizeMovement = (movement) => ({
  ...movement,
  qty: Number(movement.quantity ?? 0),
  quantity: Number(movement.quantity ?? 0),
  at: movement.createdAt,
  unitCost: movement.unitCost == null ? null : Number(movement.unitCost)
});

export const InventoryService = {
  normalizeProduct,
  normalizeMovement,

  async listMovements(productId='') {
    const query = productId ? `?productId=${encodeURIComponent(productId)}` : '';
    return (await BackendApi.get(`/inventory/movements${query}`) || []).map(normalizeMovement);
  },

  async integrity(productId='') {
    const query = productId ? `?productId=${encodeURIComponent(productId)}` : '';
    return BackendApi.get(`/inventory/integrity${query}`);
  },

  async createMovement(data) {
    const result = await BackendApi.request('/inventory/movements', {
      method:'POST',
      headers:{ 'Idempotency-Key': idempotencyKey('inv-move') },
      body:{
        productId:data.productId,
        type:data.type,
        quantity:precise(data.quantity),
        ...(data.unitCost !== '' && data.unitCost != null ? { unitCost:precise(data.unitCost) } : {}),
        ...(data.source ? { source:data.source } : {}),
        ...(data.sourceId ? { sourceId:data.sourceId } : {}),
        ...(data.reasonCode ? { reasonCode:data.reasonCode } : {}),
        ...(data.note ? { note:data.note } : {})
      }
    });
    return { movement:normalizeMovement(result.movement), product:normalizeProduct(result.product) };
  },

  async adjust(data) {
    const result = await BackendApi.request('/inventory/adjustments', {
      method:'POST',
      headers:{ 'Idempotency-Key': idempotencyKey('inv-adjust') },
      body:{ productId:data.productId, targetStock:precise(data.targetStock), reasonCode:data.reasonCode, note:data.note }
    });
    return { movement:normalizeMovement(result.movement), product:normalizeProduct(result.product) };
  },

  async reverse(movementId, reason, reasonCode='REVERSAL') {
    const result = await BackendApi.request(`/inventory/movements/${encodeURIComponent(movementId)}/reverse`, {
      method:'POST', headers:{ 'Idempotency-Key':idempotencyKey('inv-reverse') }, body:{ reason, reasonCode }
    });
    return { ...result, movement:normalizeMovement(result.movement), product:normalizeProduct(result.product) };
  }
};