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
import { summarizeInvoicedUnitActivity } from './invoiced-unit-activity.js';
import { PURCHASE_KPI_VERSION, purchaseKpiDocumentRows, purchaseKpiRows } from './purchase-kpi.js';
import { reconcileKpiPage } from './kpi-page-reconciliation.mjs';
import { prepareReorderStockPage } from './replenishment-candidates.js';
import { previewReorderPolicy } from './reorder-policy-preview.js';
import { parseReorderScanQuery, reorderScanPageMeta } from './reorder-scan-page.js';
import { parseReorderSalesOptions, projectReorderSalesEvidence } from './reorder-sales-evidence.js';
import { parseGrossInvoiceLeadTime, projectGrossInvoiceLeadTimeReview } from './gross-invoice-leadtime-review.js';
import { calculateStockAgeing, StockAgeingError, STOCK_AGEING_MAX_MOVEMENTS } from './stock-ageing-fifo.js';
import { parseAgeingCutoffs } from './configurable-ageing.js';
import { FifoCohortError, parseFifoCohortOptions } from './fifo-cohort-drilldown.js';
import { LOT_EXPIRY_RISK_VERSION, expiryUtcBounds, projectLotExpiryRisk } from './lot-expiry-risk.js';
import { summarizePhysicalOutbound } from './stock-movement-activity.js';
import { calculateObservedStockCoverage } from './stock-coverage.js';

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
  const summary = purchaseKpiRows(groups);
  const rows = purchaseKpiDocumentRows(documents.slice(0, take));
  const drillDownReconciliation = reconcileKpiPage({summary, rows, skip, hasMore});
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
    summary,
    rows,
    drillDownReconciliation,
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
  const summary = salesKpiRows(groups);
  const rows = salesKpiDocumentRows(documents.slice(0, take));
  const drillDownReconciliation = reconcileKpiPage({summary, rows, skip, hasMore});
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
    summary,
    rows,
    drillDownReconciliation,
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
const stockAgeingQuery = z.object({
  productId: z.string().uuid(),
  bucketDays: z.string().optional(),
  includeCohorts: z.enum(['true', 'false']).optional(),
  cohortTake: z.string().optional(),
  cohortSkip: z.string().optional(),
  cohortBucket: z.string().optional(),
  cohortRange: z.string().optional()
}).strict();
// Commercial activity is sourced from actual issued/paid/overdue invoice lines.
// It is not physical stock movement, estimated demand or approval to purchase.
const invoiceActivityInteger = z.string()
  .regex(/^(0|[1-9]\d*)$/)
  .refine(value => Number.isSafeInteger(Number(value)))
  .transform(value => Number(value));
const invoiceActivityQuery = z.object({
  productId: z.string().uuid(),
  windowDays: invoiceActivityInteger.refine(value => value >= 1 && value <= 365).default(90),
  take: invoiceActivityInteger.refine(value => value >= 1 && value <= 100).default(25),
  skip: invoiceActivityInteger.refine(value => value >= 0 && value <= 1_000_000).default(0)
}).strict();

router.get('/inventory/invoiced-activity', asyncHandler(async (req, res) => {
  const parsed = invoiceActivityQuery.safeParse(req.query);
  if (!parsed.success)
    throw new HttpError(400, 'Filtros de actividad facturada inválidos.', { code: 'INVOICED_UNIT_QUERY_INVALID' });
  const ctx = context(req);
  const asOf = new Date();
  const { productId, windowDays, take, skip } = parsed.data;
  const since = new Date(asOf.getTime() - windowDays * 86_400_000);
  const output = await prisma.$transaction(async tx => {
    const product = await tx.product.findFirst({
      where: { id: productId, tenantId: ctx.tenantId, active: true },
      select: { id: true, sku: true, name: true, unit: true }
    });
    if (!product)
      throw new HttpError(404, 'Producto no encontrado.', { code: 'INVOICED_PRODUCT_NOT_FOUND' });
    const where: Prisma.SalesInvoiceLineWhereInput = {
      productId: product.id,
      invoice: {
        is: {
          tenantId: ctx.tenantId,
          status: { in: [...SALES_KPI_STATUSES] },
          issueDate: { gte: since, lte: asOf }
        }
      }
    };
    const [aggregate, invoiceLines] = await Promise.all([
      tx.salesInvoiceLine.aggregate({
        where,
        _sum: { quantity: true },
        _count: { _all: true }
      }),
      tx.salesInvoiceLine.findMany({
        where,
        select: {
          id: true, quantity: true,
          invoice: { select: { id: true, number: true, issueDate: true, status: true, currency: true } }
        },
        orderBy: [{ invoice: { issueDate: 'desc' } }, { id: 'desc' }],
        take,
        skip
      })
    ]);
    return {
      product,
      observedSales: summarizeInvoicedUnitActivity({
        totalQuantity: aggregate._sum.quantity,
        lineCount: aggregate._count._all,
        rows: invoiceLines,
        take, skip, windowDays, asOf
      })
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  res.setHeader('cache-control', 'no-store');
  ok(res, output);
}));

router.get('/inventory/ageing', asyncHandler(async (req, res) => {
  const query = stockAgeingQuery.safeParse(req.query);
  if (!query.success) throw new HttpError(400, 'productId UUID es obligatorio.', { code: 'AGEING_QUERY_INVALID' });
  let bucketCutoffs;
  try {
    bucketCutoffs = parseAgeingCutoffs(query.data.bucketDays);
  } catch {
    throw new HttpError(400, 'Intervalos de antigüedad inválidos: use tres días crecientes.', { code: 'AGEING_BUCKET_QUERY_INVALID' });
  }
  let cohortOptions;
  try {
    cohortOptions = parseFifoCohortOptions(
      query.data.includeCohorts, query.data.cohortTake, query.data.cohortSkip,
      query.data.cohortBucket, query.data.cohortRange, bucketCutoffs
    );
  } catch {
    throw new HttpError(400, 'Parámetros de detalle FIFO inválidos.', { code: 'AGEING_COHORT_QUERY_INVALID' });
  }
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
        stockAgeing: calculateStockAgeing({ movements, stockExact: product.stock, asOf, bucketCutoffs, cohortOptions })
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    ok(res, result);
  } catch (error) {
    if (error instanceof StockAgeingError)
      throw new HttpError(409, 'La antigüedad de stock no se puede reconciliar; se omitió la estimación.', { code: error.code });
    if (error instanceof FifoCohortError)
      throw new HttpError(409, 'El detalle FIFO no puede reconciliarse con el stock canónico.', {
        code: 'AGEING_COHORT_RECONCILIATION_INVALID'
      });
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

// Advisory outbound inactivity only: a verified physical ledger does not
// establish customer demand or inventory location. No auto purchasing.
const physicalOutboundQuery = z.object({
  productId: z.string().uuid(),
  inactivityDays: z.coerce.number().int().min(1).max(3650).default(90)
}).strict();
router.get('/inventory/slow-moving', asyncHandler(async (req, res) => {
  const parsed = physicalOutboundQuery.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, 'Filtros de actividad física inválidos.', { code: 'OUTBOUND_ACTIVITY_QUERY_INVALID' });
  const ctx = context(req);
  const asOf = new Date();
  try {
    const result = await prisma.$transaction(async tx => {
      const product = await tx.product.findFirst({
        where: { id: parsed.data.productId, tenantId: ctx.tenantId, active: true },
        select: { id: true, sku: true, name: true, unit: true, stock: true, reserved: true }
      });
      if (!product) throw new HttpError(404, 'Producto no encontrado.', { code: 'OUTBOUND_PRODUCT_NOT_FOUND' });
      const movements = await tx.inventoryMovement.findMany({
        where: { tenantId: ctx.tenantId, productId: product.id },
        select: { id: true, type: true, quantity: true, createdAt: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: STOCK_AGEING_MAX_MOVEMENTS + 1
      });
      if (movements.length > STOCK_AGEING_MAX_MOVEMENTS)
        throw new HttpError(409, 'Historial demasiado extenso para verificar el indicador.', { code: 'OUTBOUND_HISTORY_LIMIT' });
      const reconciliation = calculateStockAgeing({ movements, stockExact: product.stock, asOf });
      const activity = summarizePhysicalOutbound({
          movements,
          stockExact: reconciliation.stockExact,
          asOf,
          inactivityDays: parsed.data.inactivityDays,
          reconciled: true
        });
      return {
        product: { id: product.id, sku: product.sku, name: product.name, unit: product.unit },
        activity,
        coverage: calculateObservedStockCoverage({
          stockExact: reconciliation.stockExact,
          reservedExact: product.reserved,
          outboundQuantityWindowExact: activity.outboundQuantityWindowExact,
          windowDays: parsed.data.inactivityDays,
          reconciled: true
        }),
        provenance: {
          reconciliation: reconciliation.version,
          movementCount: reconciliation.movementCount,
          lotAllocation: 'NOT_VERIFIED'
        }
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    res.setHeader('cache-control', 'no-store');
    ok(res, result);
  } catch (error) {
    if (error instanceof StockAgeingError || error instanceof TypeError)
      throw new HttpError(409, 'No se puede confirmar el indicador: historial físico inválido o no conciliado.', { code: 'OUTBOUND_ACTIVITY_UNRECONCILED' });
    throw error;
  }
}));

// Stateless simulation only. The operator-supplied assumptions are NOT
// persisted reorder policies, lot/location availability or purchase authority.
const reorderPolicyPreviewQuery = z.object({
  productId: z.string().uuid(),
  reorderPointExact: z.string(),
  targetStockExact: z.string(),
  safetyStockExact: z.string().optional(),
  orderMultipleExact: z.string().optional(),
  leadTimeDays: z.string().optional()
}).strict();

router.get('/inventory/reorder/preview', asyncHandler(async (req, res) => {
  const parsed = reorderPolicyPreviewQuery.safeParse(req.query);
  if (!parsed.success)
    throw new HttpError(400, 'Parámetros de simulación de reposición inválidos.', { code: 'REORDER_POLICY_QUERY_INVALID' });
  const ctx = context(req);
  const product = await prisma.product.findFirst({
    where: { id: parsed.data.productId, tenantId: ctx.tenantId, active: true },
    select: { id: true, sku: true, name: true, unit: true, stock: true, reserved: true, minStock: true }
  });
  if (!product) throw new HttpError(404, 'Producto no encontrado.', { code: 'REORDER_POLICY_PRODUCT_NOT_FOUND' });
  let policyPreview;
  try {
    policyPreview = previewReorderPolicy({
      stockExact: product.stock,
      reservedExact: product.reserved,
      canonicalMinStockExact: product.minStock,
      reorderPointExact: parsed.data.reorderPointExact,
      targetStockExact: parsed.data.targetStockExact,
      safetyStockExact: parsed.data.safetyStockExact,
      orderMultipleExact: parsed.data.orderMultipleExact,
      leadTimeDays: parsed.data.leadTimeDays
    });
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    const inconsistentStock = error.message === 'REORDER_POLICY_UNRECONCILED_RESERVATIONS';
    throw new HttpError(inconsistentStock ? 409 : 422,
      'La política simulada no es consistente con sus límites o con las existencias.',
      { code: inconsistentStock ? 'REORDER_POLICY_STOCK_CONFLICT' : 'REORDER_POLICY_ASSUMPTION_INVALID' });
  }
  res.setHeader('cache-control', 'no-store');
  ok(res, {
    product: { id: product.id, sku: product.sku, name: product.name, unit: product.unit },
    policyPreview
  });
}));

router.get('/inventory/reorder', asyncHandler(async (req, res) => {
  let query;
  let salesOptions;
  let reviewLeadTimeDays: number | null = null;
  try {
    // Sales evidence is opt-in; the existing scan parser stays strict.
    const { includeSalesEvidence, salesWindowDays, leadTimeDays, ...scanParams } = req.query;
    query = parseReorderScanQuery(scanParams);
    salesOptions = parseReorderSalesOptions(includeSalesEvidence, salesWindowDays);
    reviewLeadTimeDays = parseGrossInvoiceLeadTime(leadTimeDays, salesOptions.includeSalesEvidence);
  } catch {
    throw new HttpError(400, 'Filtros de reporte de reposición inválidos.', { code: 'REORDER_SCAN_QUERY_INVALID' });
  }
  const ctx = context(req);
  const { take, skip, onlyNeedsReorder } = query;
  const asOf = new Date();
  const since = new Date(asOf.getTime() - salesOptions.salesWindowDays * 86_400_000);

  // Product catalog and optional observed sales share one PG snapshot.
  // Across separate offset pages there is NO durable snapshot.
  const { activeProducts, scan, salesGroups } = await prisma.$transaction(async tx => {
    const [activeProducts, products] = await Promise.all([
      tx.product.count({ where: { tenantId: ctx.tenantId, active: true } }),
      tx.product.findMany({
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
        skip,
        take
      })
    ]);
    // Validate and segregate ALL canonical page balances first, while still
    // inside the same snapshot and BEFORE even an optional sales aggregation.
    // A malformed page must fail as 409, never escape as an unhandled TypeError.
    const scan = (() => {
      try {
        return prepareReorderStockPage(products.map(buildInventoryStockHealth));
      } catch (error) {
        if (!(error instanceof TypeError)) throw error;
        throw new HttpError(409, 'El cálculo de disponibilidad no concuerda con los datos canónicos.', {
          code: 'REORDER_STOCK_PROJECTION_CONFLICT'
        });
      }
    })();
    // Only safe reorder candidates may participate in the optional invoice
    // aggregate; exceptions stay visible in the report but are not queried.
    const candidateIds = salesOptions.includeSalesEvidence
      ? scan.salesCandidateIds
      : [];
    const salesGroups = candidateIds.length
      ? await tx.salesInvoiceLine.groupBy({
          by: ['productId'],
          where: {
            productId: { in: candidateIds },
            invoice: {
              is: {
                tenantId: ctx.tenantId,
                status: { in: [...SALES_KPI_STATUSES] },
                issueDate: { gte: since, lte: asOf }
              }
            }
          },
          _sum: { quantity: true },
          _count: { _all: true },
          orderBy: { productId: 'asc' }
        })
      : [];
    return { activeProducts, scan, salesGroups };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

  // The validated page and commercial aggregate came from ONE snapshot.
  // Invalid balances remain in the original rows/summary, not candidates.
  const { rows, stockReview, reorderCandidates } = scan;
  const filteredRows = onlyNeedsReorder ? rows.filter(row => row.needsReorder) : rows;
  const pagination = (() => {
    try {
      return reorderScanPageMeta({
        skip, take, scannedProducts: rows.length, activeProducts,
        matchesInPage: rows.filter(row => row.needsReorder).length
      });
    } catch (error) {
      if (error instanceof TypeError && error.message === 'REORDER_SCAN_OFFSET_WINDOW_EXCEEDED') {
        throw new HttpError(422, 'El catálogo supera la ventana de paginación; reduce el tamaño del lote o usa otra estrategia de exportación.', {
          code: 'REORDER_SCAN_OFFSET_WINDOW_EXCEEDED'
        });
      }
      throw error;
    }
  })();

  const salesEvidence = salesOptions.includeSalesEvidence
    ? projectReorderSalesEvidence({
        candidates: reorderCandidates,
        groups: salesGroups,
        asOf,
        salesWindowDays: salesOptions.salesWindowDays
      })
    : null;
  let leadTimeReview = null;
  if (salesEvidence && reviewLeadTimeDays !== null) {
    try {
      leadTimeReview = projectGrossInvoiceLeadTimeReview({
        candidates: reorderCandidates,
        salesItems: salesEvidence.items,
        salesWindowDays: salesOptions.salesWindowDays,
        leadTimeDays: reviewLeadTimeDays
      });
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      throw new HttpError(409, 'Los saldos o la actividad facturada no permiten una comparación confiable.', {
        code: 'INVOICE_LEADTIME_EVIDENCE_CONFLICT'
      });
    }
  }

  res.setHeader('cache-control', 'no-store');
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
      reorderCandidates,
      stockExceptions: stockReview.stockExceptions,
      stockExceptionCount: stockReview.stockExceptions.length,
      exceptionsScope: 'SCANNED_CATALOG_PAGE_ONLY',
      ...(salesEvidence ? {
        salesEvidence: {
          ...salesEvidence,
          ...(leadTimeReview ? { leadTimeReview } : {})
        }
      } : {})
    },
    pagination,
    meta: {
      onlyNeedsReorder,
      activeProducts,
      scannedProducts: rows.length,
      scanLimit: take,
      skip,
      pageScoped: true,
      truncated: pagination.truncated
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
