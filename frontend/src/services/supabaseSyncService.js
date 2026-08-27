import { BackendApi } from './backendApi.js';

const loadedAt = new Map();
const pulling = new Set();
const TTL_MS = 120_000;
const FAILURE_COOLDOWN_MS = 60_000;
const failedAt = new Map();

const fiscalPeriod = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const dateOnly = (value) => value ? String(value).slice(0, 10) : new Date().toISOString().slice(0, 10);
const strip = (value) => value === '' || value === undefined || value === null ? undefined : value;

const statusFromUi = (value) => ({
  'Cobrada': 'paid',
  'Pendiente': 'issued',
  'Anulada': 'cancelled',
  'Borrador': 'draft'
}[value] || value || 'issued');

const statusToUi = (value) => ({
  paid: 'Cobrada',
  issued: 'Pendiente',
  overdue: 'Pendiente',
  cancelled: 'Anulada',
  draft: 'Borrador'
}[value] || value || 'Pendiente');

function normalizeClient(client) {
  return {
    id: client.id,
    name: client.name,
    rif: client.rif,
    email: client.email || '',
    phone: client.phone || '',
    type: client.type || client.fiscalType || 'ordinary',
    address: client.address || '',
    contact: client.contact || '',
    active: client.active !== false,
    source: 'supabase'
  };
}

function clientPayload(data) {
  return {
    name: data.name,
    rif: data.rif,
    contact: strip(data.contact),
    email: strip(data.email),
    phone: strip(data.phone),
    address: strip(data.address),
    fiscalType: strip(data.type) || strip(data.fiscalType) || 'ordinary',
    active: true
  };
}

function normalizeSupplier(item) {
  return {
    id: item.id,
    name: item.name,
    rif: item.rif,
    email: item.email || '',
    phone: item.phone || '',
    category: item.category || item.retentionProfile || 'Insumos',
    address: item.address || '',
    active: item.active !== false,
    source: 'supabase'
  };
}

function supplierPayload(data) {
  return {
    name: data.name,
    rif: data.rif,
    email: strip(data.email),
    phone: strip(data.phone),
    address: strip(data.address),
    retentionProfile: strip(data.category) || 'ordinary',
    active: true
  };
}

function normalizeProduct(product) {
  return {
    id: product.id,
    sku: product.sku,
    barcode: product.barcode || '',
    qrCode: product.qrCode || '',
    name: product.name,
    category: product.description || 'Inventario',
    stock: number(product.stock),
    reserved: number(product.reserved),
    available: number(product.available, number(product.stock) - number(product.reserved)),
    min: number(product.minStock),
    costUsd: number(product.cost),
    priceUsd: number(product.price),
    taxRate: number(product.taxRate, 16),
    source: 'supabase'
  };
}

function productPayload(data) {
  return {
    sku: data.sku,
    name: data.name,
    description: strip(data.category) || 'Inventario',
    unit: strip(data.unit) || 'UND',
    minStock: number(data.min),
    cost: number(data.costUsd),
    price: number(data.priceUsd),
    taxRate: number(data.taxRate, 16),
    active: true
  };
}

function normalizeInventoryMovement(movement) {
  return {
    ...movement,
    qty: number(movement.quantity),
    quantity: number(movement.quantity),
    unitCost: movement.unitCost == null ? null : number(movement.unitCost),
    at: movement.createdAt,
    source: movement.source || 'inventory'
  };
}

function normalizeSale(sale) {
  return {
    id: sale.id,
    date: dateOnly(sale.issueDate),
    invoice: sale.number,
    client: sale.client?.name || sale.notes || 'Consumidor final',
    clientId: sale.clientId || '',
    amount: number(sale.total),
    subtotal: number(sale.subtotal),
    iva: number(sale.iva),
    method: sale.currency || 'VES',
    status: statusToUi(sale.status),
    lines: sale.lines || [],
    source: 'supabase'
  };
}

function salePayload(data) {
  const amount = number(data.amount);
  const date = data.date || new Date().toISOString();
  return {
    clientId: strip(data.clientId),
    number: data.invoice || data.number || `FAC-${Date.now()}`,
    controlNo: strip(data.controlNo),
    issueDate: new Date(date).toISOString(),
    fiscalPeriod: fiscalPeriod(date),
    currency: 'VES',
    exchangeRate: 1,
    status: statusFromUi(data.status),
    notes: strip(data.client) || 'Venta desde frontend',
    lines: [
      {
        productId: strip(data.productId),
        description: strip(data.description) || `Venta ${data.invoice || ''}`.trim() || 'Venta general',
        quantity: 1,
        unitPrice: amount,
        taxRate: 16
      }
    ]
  };
}

function normalizePurchase(purchase) {
  return {
    id: purchase.id,
    date: dateOnly(purchase.issueDate),
    supplierId: purchase.supplierId || '',
    reference: purchase.number,
    amount: number(purchase.subtotal),
    iva: number(purchase.iva),
    total: number(purchase.total),
    supplier: purchase.supplier || null,
    status: statusToUi(purchase.status),
    lines: purchase.lines || [],
    source: 'supabase'
  };
}

function purchasePayload(data) {
  const amount = number(data.amount);
  const iva = number(data.iva);
  const taxRate = amount > 0 ? Math.round((iva / amount) * 10000) / 100 : 16;
  const date = data.date || new Date().toISOString();
  return {
    supplierId: strip(data.supplierId),
    number: data.reference || data.number || `COMP-${Date.now()}`,
    controlNo: strip(data.controlNo),
    fiscalPeriod: fiscalPeriod(date),
    status: 'issued',
    ocrStatus: 'manual',
    lines: [
      {
        productId: strip(data.productId),
        description: strip(data.description) || `Compra ${data.reference || ''}`.trim() || 'Compra general',
        quantity: 1,
        unitCost: amount,
        taxRate
      }
    ]
  };
}

function normalizeLedgerEntry(entry) {
  const lines = entry.lines || [];
  const debit = lines.reduce((sum, line) => sum + number(line.debit), 0);
  const credit = lines.reduce((sum, line) => sum + number(line.credit), 0);
  const first = lines[0] || {};
  return {
    id: entry.id,
    date: dateOnly(entry.date),
    account: first.accountName || first.accountCode || entry.source || 'Asiento',
    description: entry.description,
    debit,
    credit,
    lines,
    source: 'supabase'
  };
}

function ledgerPayload(data) {
  const debit = number(data.debit);
  const credit = number(data.credit);
  const amount = debit > 0 ? debit : credit;
  const isDebit = debit > 0;
  const accountName = data.account || 'Cuenta manual';
  const contraName = isDebit ? 'Contrapartida crédito' : 'Contrapartida débito';
  return {
    fiscalPeriod: fiscalPeriod(data.date),
    description: data.description,
    source: 'manual',
    lines: [
      { accountCode: 'MANUAL-01', accountName, debit: isDebit ? amount : 0, credit: isDebit ? 0 : amount, currency: 'VES', exchangeRate: 1 },
      { accountCode: 'MANUAL-02', accountName: contraName, debit: isDebit ? 0 : amount, credit: isDebit ? amount : 0, currency: 'VES', exchangeRate: 1 }
    ]
  };
}

function normalizeFoodOrder(order) {
  return {
    ...order,
    id: order.id,
    number: order.number,
    items: order.items || [],
    source: 'supabase'
  };
}

function updateState(Store, partial) {
  Store.set(partial);
}

async function safePull(key, loader, apply, { Store, Toast, force = false, silent = true } = {}) {
  if (!BackendApi.isReady) return false;
  const now = Date.now();
  if (!force && loadedAt.has(key) && now - loadedAt.get(key) < TTL_MS) return false;
  if (!force && failedAt.has(key) && now - failedAt.get(key) < FAILURE_COOLDOWN_MS) return false;
  if (pulling.has(key)) return false;
  pulling.add(key);
  try {
    const data = await loader();
    apply(data);
    loadedAt.set(key, Date.now());
    if (!silent) Toast?.show?.(`Sincronizado: ${key}`, 'success');
    return true;
  } catch (error) {
    failedAt.set(key, Date.now());
    console.warn(`[ContaGest-VE Sync] ${key}`, error);
    if (!silent) Toast?.show?.(`Sync ${key}: ${error.message}`, 'warning');
    return false;
  } finally {
    pulling.delete(key);
  }
}

export const SupabaseSyncService = {
  fiscalPeriod,
  mappers: {
    normalizeClient, clientPayload,
    normalizeSupplier, supplierPayload,
    normalizeProduct, productPayload, normalizeInventoryMovement,
    normalizeSale, salePayload,
    normalizePurchase, purchasePayload,
    normalizeLedgerEntry, ledgerPayload,
    normalizeFoodOrder
  },

  async pullClients(ctx = {}) {
    return safePull('clients', () => BackendApi.list('clients'), (data) => updateState(ctx.Store, { clients: data.map(normalizeClient) }), ctx);
  },
  async pullSuppliers(ctx = {}) {
    return safePull('suppliers', () => BackendApi.list('suppliers'), (data) => updateState(ctx.Store, { suppliers: data.map(normalizeSupplier) }), ctx);
  },
  async pullProducts(ctx = {}) {
    return safePull('products', () => Promise.all([BackendApi.list('products'), BackendApi.get('/inventory/movements')]), ([products, movements]) => updateState(ctx.Store, { inventory: products.map(normalizeProduct), inventoryMovements: (movements || []).map(normalizeInventoryMovement) }), ctx);
  },
  async pullSales(ctx = {}) {
    return safePull('sales', () => BackendApi.list('sales'), (data) => updateState(ctx.Store, { sales: data.map(normalizeSale) }), ctx);
  },
  async pullPurchases(ctx = {}) {
    return safePull('purchases', () => BackendApi.list('purchases'), (data) => updateState(ctx.Store, { purchases: data.map(normalizePurchase) }), ctx);
  },
  async pullLedger(ctx = {}) {
    return safePull('ledger', () => BackendApi.request('/accounting/entries'), (data) => updateState(ctx.Store, { ledger: { ...ctx.Store.get().ledger, entries: data.map(normalizeLedgerEntry) } }), ctx);
  },
  async pullFoodOrders(ctx = {}) {
    return safePull('food-orders', () => BackendApi.request('/food/orders'), (data) => updateState(ctx.Store, { foodOrders: data.map(normalizeFoodOrder) }), ctx);
  },
  async pullChartAccounts(ctx = {}) {
    return safePull('chart-accounts', () => BackendApi.request('/chart-accounts'), (data) => updateState(ctx.Store, { customAccounts: data }), ctx);
  },

  async pullRoute(route, ctx = {}) {
    const map = {
      clientes: () => this.pullClients(ctx),
      inventario: () => this.pullProducts(ctx),
      ventas: () => Promise.all([this.pullClients(ctx), this.pullSales(ctx)]),
      'libro-ventas': () => this.pullSales(ctx),
      compras: () => Promise.all([this.pullSuppliers(ctx), this.pullPurchases(ctx)]),
      proveedores: () => this.pullSuppliers(ctx),
      contabilidad: () => this.pullLedger(ctx),
      kardex: () => this.pullProducts(ctx),
      'plan-cuentas': () => this.pullChartAccounts(ctx),
      pedidos: () => this.pullFoodOrders(ctx),
      'pos-sede': () => this.pullFoodOrders(ctx),
      'tracking-pedidos': () => this.pullFoodOrders(ctx),
      pretesting: () => BackendApi.request('/pretesting/summary')
    };
    return map[route]?.();
  },

  async syncCore(ctx = {}) {
    return Promise.allSettled([
      this.pullClients({ ...ctx, force: true }),
      this.pullSuppliers({ ...ctx, force: true }),
      this.pullProducts({ ...ctx, force: true }),
      this.pullSales({ ...ctx, force: true }),
      this.pullPurchases({ ...ctx, force: true }),
      this.pullLedger({ ...ctx, force: true }),
      this.pullFoodOrders({ ...ctx, force: true })
    ]);
  },

  async createClient(data) { return normalizeClient(await BackendApi.create('clients', clientPayload(data))); },
  async deleteClient(id) { return BackendApi.remove('clients', id); },

  async createSupplier(data) { return normalizeSupplier(await BackendApi.create('suppliers', supplierPayload(data))); },
  async deleteSupplier(id) { return BackendApi.remove('suppliers', id); },

  async createProduct(data) { return normalizeProduct(await BackendApi.create('products', productPayload(data))); },

  async createSale(data) { return normalizeSale(await BackendApi.create('sales', salePayload(data))); },

  async createPurchase(data) { return normalizePurchase(await BackendApi.create('purchases', purchasePayload(data))); },

  async createLedgerEntry(data) { return normalizeLedgerEntry(await BackendApi.request('/accounting/entries', { method: 'POST', body: ledgerPayload(data) })); },

  async createFoodOrder(order) { return normalizeFoodOrder(await BackendApi.request('/food/orders', { method: 'POST', body: order })); },
  async updateFoodOrderStatus(orderId, status) { return normalizeFoodOrder(await BackendApi.request(`/food/orders/${encodeURIComponent(orderId)}/status`, { method: 'POST', body: { status } })); }
};
