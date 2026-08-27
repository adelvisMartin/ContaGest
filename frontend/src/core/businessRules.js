import { uid } from '../utils/dom.js';

export const ORDER_RULES = {
  reserveOn: 'accepted',
  consumeOn: 'preparing',
  invoiceOn: 'paid_or_delivered',
  cancelAllowedUntil: 'ready',
  partialPayment: 'allowed_with_balance',
  afterDispatched: 'only_return_or_delivery_failed'
};

export const INVENTORY_RULES = {
  stockMinimum: 'alert_only',
  reservation: 'order_accepted',
  returnFlow: 'create_return_movement',
  shrinkage: 'requires_authorized_adjustment',
  adjustment: 'requires_reason_user_and_audit',
  costMethod: 'weighted_average',
  kardex: 'all_movements_are_immutable'
};

export const ACCOUNTING_RULES = {
  mandatoryAccounts: ['1.1.01.001', '1.1.02.001', '1.1.03.001', '2.1.02.001', '4.1.01.001', '5.1.01.001'],
  closeMonthly: true,
  reversals: 'never_delete_posted_entries',
  blockClosedPeriods: true,
  cancelledDocuments: 'reverse_and_mark_cancelled'
};

export const PAYROLL_RULES = {
  parameterVersioning: true,
  incidencesRequired: ['vacation','absence','overtime','bonus','deduction'],
  receiptRequired: true,
  vacationAccrual: 'monthly',
  utilities: 'annual_or_configured_period',
  benefits: 'seniority_benefits_by_policy'
};

export const PAYMENT_RULES = {
  allowedPartial: true,
  requireCashierClose: true,
  requirePaymentReference: ['transfer','mobile_payment','card'],
  overpayment: 'create_credit_balance',
  underpayment: 'keep_order_pending_balance'
};

const orderProgress = ['new','accepted','preparing','ready','dispatched','delivered'];

export function canCancelOrder(status) {
  return orderProgress.indexOf(status) <= orderProgress.indexOf(ORDER_RULES.cancelAllowedUntil);
}

export function applyOrderBusinessTransition({ order, nextStatus, inventory = [] }) {
  const events = [{ id: uid('evt'), at: new Date().toISOString(), type: 'transition', from: order.status, to: nextStatus, message: `Cambio a ${nextStatus}` }, ...(order.events || [])];
  const warnings = [];
  let movements = [];
  if (nextStatus === 'accepted') warnings.push('Inventario reservado: confirmar disponibilidad real antes de preparar.');
  if (nextStatus === 'preparing') {
    movements = (order.items || []).map((item) => ({ id: uid('mov'), sku: item.sku, type: 'out', source: 'food-order', sourceId: order.id, qty: Number(item.qty || 0), note: `Consumo por pedido ${order.number}` }));
  }
  if (nextStatus === 'cancelled' && !canCancelOrder(order.status)) warnings.push('Cancelación tardía: requiere autorización, reverso y motivo.');
  return { order: { ...order, status: nextStatus, updatedAt: new Date().toISOString(), events }, movements, warnings };
}

export function buildKardex({ product, movements = [] }) {
  let stock = 0;
  let reserved = 0;
  let avgCost = Number(product?.costUsd || 0);
  let totalCost = 0;
  return movements.filter((m) => !product?.sku || m.sku === product.sku || m.productId === product.id).map((m) => {
    const raw = Number(m.qty ?? m.quantity ?? 0);
    let inQty = 0;
    let outQty = 0;
    let reservedDelta = 0;
    if (m.type === 'in' || m.type === 'return') inQty = Math.abs(raw);
    else if (m.type === 'out' || m.type === 'shrinkage') outQty = Math.abs(raw);
    else if (m.type === 'adjustment') {
      if (raw >= 0) inQty = raw;
      else outQty = Math.abs(raw);
    } else if (m.type === 'reservation') reservedDelta = Math.abs(raw);
    else if (m.type === 'release') reservedDelta = -Math.abs(raw);
    const unitCost = Number(m.unitCost ?? avgCost ?? 0);
    if (inQty > 0) {
      totalCost += inQty * unitCost;
      stock += inQty;
      avgCost = stock ? totalCost / stock : avgCost;
    }
    if (outQty > 0) {
      stock -= outQty;
      totalCost = Math.max(0, stock * avgCost);
    }
    if (reservedDelta !== 0) reserved += reservedDelta;
    return { ...m, inQty, outQty, reservedDelta, balanceQty: stock, reservedQty: reserved, availableQty: stock - reserved, averageCost: avgCost, balanceValue: totalCost };
  });
}