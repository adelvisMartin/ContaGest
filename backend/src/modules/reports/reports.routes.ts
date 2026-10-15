import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import {
  buildInventoryStockHealth,
  summarizeInventoryStockHealth
} from '../../shared/services/inventory-stock-health.service.js';
import { SALES_KPI_STATUSES, SALES_KPI_VERSION, salesKpiDocumentRows, salesKpiRows } from './sales-kpi.js';
import { PURCHASE_KPI_VERSION, purchaseKpiDocumentRows, purchaseKpiRows } from './purchase-kpi.js';
import { deriveReorderCandidates } from './replenishment-candidates.js';
import { calculateStockAgeing, StockAgeingError, STOCK_AGEING_MAX_MOVEMENTS } from './stock-ageing-fifo.js';
import { LOT_EXPIRY_RISK_VERSION, expiryUtcBounds, projectLotExpiryRisk } from './lot-expiry-risk.js';

const router = Router();
router.use(requireTenant, requirePermission('reports.view'));

const context = (req: any) => req.context as { tenantId: string };

router.get('/', (_req, res) => {
  res.json({
    ok: true,
    module: 'reports',
    message: 'Módulo de reportes activo',
    availableReports: [
      'sales',
      'inventory',
      'inventory-reorder',
      'taxes',
      'accounting',
      'ledger',
      'trial-balance',
      'worksheet',
      'financial-statements'
    ]
  });
});

const salesKpiQuery = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  currency: z.string().trim().regex(/^[A-Z][A-Z0-9]{2,7}$/).optional(),
  take: z.coerce.number().int().min(1).max(100).default(25),
  skip: z.coerce.number().int().min(0).max(1_000_000).default(0)
}).strict();

// Dedicated versioned analytics read: no fabricated report totals, no
// cross-currency arithmetic and no separately persisted aggregates.
// Each summary and drill-down page shares one repeatable-read PG snapshot.
router.get('/operational/purchases', asyncHandler(async (req, res) => {
  const parsed = salesKpiQuery.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, 'Filtros de KPI de compras inválidos.', { code: 'PURCHASE_KPI_QUERY_INVALID' });
  const ctx = context(req);
  const { period, currency, take, skip } = parsed.data;
  const where: Prisma.PurchaseInvoiceWhereInput = {
    tenantId: ctx.tenantId,
    fiscalPeriod: period,
    status: { in: [...SALES_KPI_STATUSES] },
    ...(currency ? { currency } : {})
  };
  const [groups, documents] = await prisma.$transaction(async tx => Promise.all([
    tx.purchaseInvoice.groupBy({
      by: ['currency', 'status'],
      where,
      _sum: { subtotal: true, iva: true, igtf: true, retiva: true, total: true },
      _count: { _all: true },
      orderBy: [{ currency: 'asc' }, { status: 'asc' }]
    }),
    tx.purchaseInvoice.findMany({
      where,
      select: {
        id: true, number: true, issueDate: true, fiscalPeriod: true,
        currency: true, status: true, subtotal: true, iva: true,
        igtf: true, retiva: true, total: true
      },
      orderBy: [{ issueDate: 'desc' }, { id: 'desc' }],
      take: take + 1,
      skip
    })
  ]), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  const hasMore = documents.length > take;
  ok(res, {
    version: PURCHASE_KPI_VERSION,
    sourceAuthority: 'PurchaseInvoice',
    definition: {
      statuses: SALES_KPI_STATUSES,
      period: 'fiscalPeriod',
      monetaryUnit: 'original-currency',
      fxConversion: 'NONE',
      excludes: ['draft', 'cancelled'],
      liabilityOrCashPaymentKpi: false,
      isolation: 'repeatable-read'
    },
    filters: { period, currency: currency ?? null, take, skip },
    summary: purchaseKpiRows(groups),
    rows: purchaseKpiDocumentRows(documents.slice(0, take)),
    pagination: { hasMore, nextSkip: hasMore ? skip + take : null }
  });
}));

router.get('/operational/sales', asyncHandler(async (req, res) => {
  const query = salesKpiQuery.safeParse(req.query);
  if (!query.success) throw new HttpError(400, 'Filtros de KPI de ventas inválidos.', { code: 'SALES_KPI_QUERY_INVALID' });
  const ctx = context(req);
  const { period, currency, take, skip } = query.data;
  const where: Prisma.SalesInvoiceWhereInput = {
    tenantId: ctx.tenantId,
    fiscalPeriod: period,
    status: { in: [...SALES_KPI_STATUSES] },
    ...(currency ? { currency } : {})
  };
  const [groups, documents] = await prisma.$transaction(async (tx) => Promise.all([
    tx.salesInvoice.groupBy({
      by: ['currency', 'status'],
      where,
      _sum: { subtotal: true, iva: true, total: true },
      _count: { _all: true },
      orderBy: [{ currency: 'asc' }, { status: 'asc' }]
    }),
    tx.salesInvoice.findMany({
      where,
      select: { id:true, number:true, issueDate:true, fiscalPeriod:true, currency:true, status:true, subtotal:true, iva:true, total:true },
      orderBy: [{ issueDate:'desc' }, { id:'desc' }],
      take: take + 1,
      skip
    })
  ]), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  const hasMore = documents.length > take;
  ok(res, {
    version: SALES_KPI_VERSION,
    sourceAuthority: 'SalesInvoice',
    definition: {
      statuses: SALES_KPI_STATUSES,
      period: 'fiscalPeriod',
      monetaryUnit: 'original-currency',
      fxConversion: 'NONE',
      excludeDraftAndCancelled: true,
      isolation: 'repeatable-read'
    },
    filters: { period, currency: currency ?? null, take, skip },
    summary: salesKpiRows(groups),
    rows: salesKpiDocumentRows(documents.slice(0, take)),
    pagination: { hasMore, nextSkip: hasMore ? skip + take : null }
  });
}));

router.get('/sales', (_req, res) => {
  res.json({
    ok: true,
    report: 'sales',
    rows: [],
    totals: {
      usd: 0,
      ves: 0
    }
  });
});

router.get('/inventory', (_req, res) => {
  res.json({
    ok: true,
    report: 'inventory',
    rows: [],
    totals: {
      stockCostUsd: 0,
      stockCostVes: 0,
      stockValueUsd: 0,
      stockValueVes: 0
    }
  });
});

// Estimate only: FIFO cohorts are inferred from complete physical-movement
// history and cannot be used as physical lot provenance or inventory valuation.
const stockAgeingQuery = z.object({ productId: z.string().uuid() }).strict();
router.get('/inventory/ageing', asyncHandler(async (req, res) => {
  const query = stockAgeingQuery.safeParse(req.query);
  if (!query.success) throw new HttpError(400, 'productId UUID es obligatorio.', { code: 'AGEING_QUERY_INVALID' });
  const ctx = context(req);
  const asOf = new Date();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: query.data.productId, tenantId: ctx.tenantId },
        select: { id: true, sku: true, name: true, unit: true, stock: true }
      });
      if (!product) throw new HttpError(404, 'Producto no encontrado.', { code: 'AGEING_PRODUCT_NOT_FOUND' });
      const movements = await tx.inventoryMovement.findMany({
        where: { productId: product.id, tenantId: ctx.tenantId },
        select: { id: true, type: true, quantity: true, createdAt: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: STOCK_AGEING_MAX_MOVEMENTS + 1
      });
      if (movements.length > STOCK_AGEING_MAX_MOVEMENTS)
        throw new HttpError(409, 'Historial de movimientos supera el límite del cálculo.', { code: 'AGEING_HISTORY_LIMIT' });
      return {
        product: { id: product.id, sku: product.sku, name: product.name, unit: product.unit },
        stockAgeing: calculateStockAgeing({ movements, stockExact: product.stock, asOf })
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    ok(res, result);
  } catch (error) {
    if (error instanceof StockAgeingError)
      throw new HttpError(409, 'La antigüedad de stock no se puede reconciliar; se omitió la estimación.', { code: error.code });
    throw error;
  }
}));

// Catalog-only alert. No claim about actual lot balance or FEFO allocation:
// physical lot/location authority and reservation linkage are pending #755.
const lotExpiryQuery = z.object({
  daysAhead: z.coerce.number().int().min(0).max(365).default(30),
  includeExpired: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  take: z.coerce.number().int().min(1).max(100).default(25),
  skip: z.coerce.number().int().min(0).max(1_000_000).default(0)
}).strict();
router.get('/inventory/expiry', asyncHandler(async (req, res) => {
  const parsed = lotExpiryQuery.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, 'Filtros de vencimiento inválidos.', { code: 'EXPIRY_QUERY_INVALID' });
  const ctx = context(req);
  const { daysAhead, includeExpired, take, skip } = parsed.data;
  const asOf = new Date();
  const window = expiryUtcBounds(asOf, daysAhead, includeExpired);
  const lots = await prisma.inventoryLot.findMany({
    where: {
      tenantId: ctx.tenantId,
      active: true,
      product: { tenantId: ctx.tenantId, active: true },
      expiresAt: {
        not: null,
        lt: window.endExclusive,
        ...(window.start ? { gte: window.start } : {})
      }
    },
    select: {
      id: true, productId: true, lotNumber: true, receivedAt: true, expiresAt: true,
      product: { select: { sku: true, name: true, unit: true } }
    },
    orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
    take: take + 1,
    skip
  });
  const hasMore = lots.length > take;
  // expiresAt is guaranteed not null by the query predicate.
  const rows = projectLotExpiryRisk(
    lots.slice(0, take).map(lot => ({ ...lot, expiresAt: lot.expiresAt! })),
    asOf,
    daysAhead
  );
  res.setHeader('cache-control', 'no-store');
  ok(res, {
    version: LOT_EXPIRY_RISK_VERSION,
    authority: 'InventoryLot.expiresAt',
    mode: 'REVIEW_ONLY',
    stockEvidence: 'NOT_AVAILABLE_WITHOUT_LOT_ALLOCATION_AUTHORITY',
    datePolicy: 'UTC_CALENDAR_DATE',
    asOfUtcDay: window.today.toISOString().slice(0, 10),
    filters: { daysAhead, includeExpired, take, skip },
    rows,
    pagination: { hasMore, nextSkip: hasMore ? skip + take : null }
  });
}));

router.get('/inventory/reorder', asyncHandler(async (req, res) => {
  const ctx = context(req);
  const requestedTake = Number(req.query.take || 500);
  const take = Number.isFinite(requestedTake)
    ? Math.min(Math.max(Math.trunc(requestedTake), 1), 1000)
    : 500;
  const onlyNeedsReorder = String(req.query.onlyNeedsReorder || 'false').trim().toLowerCase() === 'true';

  const [activeProducts, products] = await Promise.all([
    prisma.product.count({ where: { tenantId: ctx.tenantId, active: true } }),
    prisma.product.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      select: {
        id: true,
        sku: true,
        name: true,
        unit: true,
        stock: true,
        reserved: true,
        minStock: true
      },
      orderBy: [{ sku: 'asc' }, { id: 'asc' }],
      take
    })
  ]);

  const rows = products.map(buildInventoryStockHealth);
  const filteredRows = onlyNeedsReorder ? rows.filter((row) => row.needsReorder) : rows;
  const reorderCandidates = deriveReorderCandidates(rows);

  ok(res, {
    report: 'inventory-reorder',
    rows: filteredRows,
    summary: summarizeInventoryStockHealth(filteredRows),
    planning: {
      authority: 'Product.stock-reserved-minStock',
      mode: 'REVIEW_ONLY',
      scope: 'SCANNED_PAGE_ONLY',
      autoPurchaseEnabled: false,
      noLocationForecastUntil: '#755',
      reorderCandidates
    },
    meta: {
      onlyNeedsReorder,
      activeProducts,
      scannedProducts: products.length,
      scanLimit: take,
      truncated: activeProducts > products.length
    }
  });
}));

router.get('/taxes', (_req, res) => {
  res.json({
    ok: true,
    report: 'taxes',
    rows: [],
    totals: {
      baseUsd: 0,
      baseVes: 0,
      taxUsd: 0,
      taxVes: 0
    }
  });
});

router.get('/accounting', (_req, res) => {
  res.json({
    ok: true,
    report: 'accounting',
    rows: [],
    totals: {
      debitUsd: 0,
      creditUsd: 0,
      debitVes: 0,
      creditVes: 0
    }
  });
});

router.get('/ledger', (_req, res) => {
  res.json({
    ok: true,
    report: 'ledger',
    rows: [],
    message: 'Libro mayor disponible'
  });
});

router.get('/trial-balance', (_req, res) => {
  res.json({
    ok: true,
    report: 'trial-balance',
    rows: [],
    totals: {
      debit: 0,
      credit: 0,
      debitBalance: 0,
      creditBalance: 0
    }
  });
});

router.get('/worksheet', (_req, res) => {
  res.json({
    ok: true,
    report: 'worksheet',
    rows: [],
    message: 'Hoja de trabajo disponible'
  });
});

router.get('/financial-statements', (_req, res) => {
  res.json({
    ok: true,
    report: 'financial-statements',
    incomeStatement: [],
    balanceSheet: [],
    control: {
      difference: 0
    }
  });
});

export default router;
