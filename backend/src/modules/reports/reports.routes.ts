import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, ok } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import {
  buildInventoryStockHealth,
  summarizeInventoryStockHealth
} from '../../shared/services/inventory-stock-health.service.js';

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

  ok(res, {
    report: 'inventory-reorder',
    rows: filteredRows,
    summary: summarizeInventoryStockHealth(filteredRows),
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
