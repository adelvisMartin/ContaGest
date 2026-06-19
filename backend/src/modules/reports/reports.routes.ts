import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    ok: true,
    module: 'reports',
    message: 'Módulo de reportes activo',
    availableReports: [
      'sales',
      'inventory',
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
