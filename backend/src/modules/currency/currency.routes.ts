import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, ok, HttpError } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { exchangeRate, money, serializeDecimal, serializeLegacyNumber, add, subtract, ZERO, ONE, type DecimalValue } from '../../shared/financial/decimal.js';
import { decimalSchema } from '../../shared/financial/zod.js';
import { assertBalanced, assertPeriodOpen, inverseLedgerLines } from '../accounting/accounting.service.js';
import { runFinancialIdempotentMutation } from '../../shared/services/financial-idempotency.service.js';
import { writeAudit } from '../../shared/services/audit.service.js';
import {
  convertToFunctional,
  fxDifferenceForAsset,
  fxDifferenceForLiability,
  normalizeCurrency,
  resolveFxContext,
  type FxDocumentType
} from '../../shared/financial/fx.js';
import {
  countDocumentSnapshots,
  createFxEvent,
  getBankAccountMap,
  getDocumentSnapshot,
  getFxEvent,
  getFxPolicy,
  latestUnreversedRevaluation,
  listDocumentSnapshots,
  listFxEvents,
  markFxEventReversed,
  realizedOriginalAmount,
  upsertBankAccountMap,
  upsertFxPolicy
} from './fx.repository.js';

const router = Router();
const TTL_MS = Number(process.env.BCV_CACHE_TTL_MS || 60 * 60 * 1000);
type CachedRate = { rate: DecimalValue; source: string; updatedAt: string; provider: string; stale: boolean; errors?: string[]; cache?: boolean };
let cache: CachedRate | null = null;

const GAIN_ACCOUNT = { accountCode: '4.2.02', accountName: 'Diferencial cambiario ganado' };
const LOSS_ACCOUNT = { accountCode: '6.4.04', accountName: 'Diferencial cambiario perdido' };
const AR_ACCOUNT = { accountCode: '1.1.03.001', accountName: 'Clientes nacionales' };
const AP_ACCOUNT = { accountCode: '2.1.01.001', accountName: 'Proveedores nacionales' };

const policySchema = z.object({ functionalCurrency: z.string().trim().length(3) });
const bankMapSchema = z.object({ ledgerAccountCode: z.string().trim().min(1).max(40) });
const sourceTypeSchema = z.enum(['sales', 'purchase']);
const periodSchema = z.string().regex(/^\d{4}-\d{2}$/, 'Usa formato AAAA-MM.');
const rateSourceSchema = z.string().trim().min(2).max(120);
const settlementSchema = z.object({
  sourceType: sourceTypeSchema,
  sourceId: z.string().uuid(),
  bankMovementId: z.string().uuid(),
  appliedOriginalAmount: decimalSchema('money', { positive: true }),
  settlementAmount: decimalSchema('money', { positive: true }),
  currentRate: decimalSchema('exchangeRate', { positive: true }),
  rateDate: z.coerce.date(),
  rateSource: rateSourceSchema,
  fiscalPeriod: periodSchema
});
const revaluationSchema = z.object({
  sourceType: sourceTypeSchema,
  sourceId: z.string().uuid(),
  currentRate: decimalSchema('exchangeRate', { positive: true }),
  rateDate: z.coerce.date(),
  rateSource: rateSourceSchema,
  fiscalPeriod: periodSchema
});
const reverseEventSchema = z.object({
  fiscalPeriod: periodSchema,
  reversalDate: z.coerce.date().optional(),
  reason: z.string().trim().min(3).max(500).optional()
});

const context = (req: any) => req.context as { tenantId: string; userId?: string; ip?: string; userAgent?: string };
const idempotencyKey = (req: any) => req.header('Idempotency-Key') || null;
const requestId = (req: any) => String(req.requestId || '') || null;
const requireActor = (ctx: ReturnType<typeof context>) => {
  const actorId = String(ctx.userId || '').trim();
  if (!actorId) throw new HttpError(401, 'La operación cambiaria requiere un actor autenticado.');
  return actorId;
};

function normalizeRate(value: unknown): DecimalValue | null {
  try {
    const raw = String(value ?? '').trim().replace(',', '.');
    const rate = exchangeRate(raw);
    return rate.isPositive() ? rate : null;
  } catch {
    return null;
  }
}

function serializeRate(result: CachedRate) {
  return { ...result, rate: serializeLegacyNumber(result.rate), rateExact: serializeDecimal(result.rate, 4) };
}

async function fetchWithTimeout(url: string, timeoutMs = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

const providers = [
  {
    source: 'DolarAPI · Oficial',
    url: 'https://ve.dolarapi.com/v1/dolares/oficial',
    parse: (data: any) => ({ rate: normalizeRate(data?.promedio ?? data?.venta ?? data?.compra), updatedAt: data?.fechaActualizacion })
  },
  {
    source: 'Rafnixg BCV API',
    url: 'https://bcv-api.rafnixg.dev/rates/',
    parse: (data: any) => ({ rate: normalizeRate(data?.usd ?? data?.rate ?? data?.value ?? data?.rates?.USD ?? data?.rates?.usd), updatedAt: data?.date || data?.updated_at || data?.updatedAt })
  },
  {
    source: 'PyDolarVE · BCV',
    url: 'https://pydolarve.org/api/v1/dollar?page=bcv',
    parse: (data: any) => ({ rate: normalizeRate(data?.monitors?.usd?.price ?? data?.monitors?.bcv?.price ?? data?.usd?.price ?? data?.price), updatedAt: data?.datetime?.date || data?.updated_at || data?.last_update })
  }
];

async function getBcvRate(): Promise<CachedRate> {
  if (cache?.rate && Date.now() - new Date(cache.updatedAt).getTime() < TTL_MS) return { ...cache, cache: true };
  const errors: string[] = [];
  for (const provider of providers) {
    try {
      const data = await fetchWithTimeout(provider.url);
      const parsed = provider.parse(data);
      if (!parsed.rate) throw new Error('rate inválida o fuera de escala Decimal(18,4)');
      cache = { rate: parsed.rate, source: provider.source, updatedAt: parsed.updatedAt || new Date().toISOString(), provider: provider.source, stale: false };
      return cache;
    } catch (error: any) {
      errors.push(`${provider.source}: ${error.message}`);
    }
  }
  if (cache?.rate) return { ...cache, stale: true, errors };
  throw new HttpError(503, 'No hay proveedor BCV disponible', errors);
}

async function loadDocument(tx: any, tenantId: string, sourceType: FxDocumentType, sourceId: string) {
  if (sourceType === 'sales') {
    const document = await tx.salesInvoice.findFirst({ where: { id: sourceId, tenantId } });
    if (!document) throw new HttpError(404, 'Venta no encontrada.');
    return document;
  }
  const document = await tx.purchaseInvoice.findFirst({ where: { id: sourceId, tenantId } });
  if (!document) throw new HttpError(404, 'Compra no encontrada.');
  return document;
}

function settlementLines(input: {
  sourceType: FxDocumentType;
  bankAccountCode: string;
  bankAccountName: string;
  historicalFunctionalAmount: DecimalValue;
  currentFunctionalAmount: DecimalValue;
  difference: DecimalValue;
}) {
  const diff = money(input.difference);
  const abs = money(diff.abs());
  const gain = diff.isPositive();
  const loss = diff.isNegative();
  if (input.sourceType === 'sales') {
    return [
      { accountCode: input.bankAccountCode, accountName: input.bankAccountName, debit: input.currentFunctionalAmount, credit: ZERO },
      { ...AR_ACCOUNT, debit: ZERO, credit: input.historicalFunctionalAmount },
      ...(gain ? [{ ...GAIN_ACCOUNT, debit: ZERO, credit: abs }] : []),
      ...(loss ? [{ ...LOSS_ACCOUNT, debit: abs, credit: ZERO }] : [])
    ];
  }
  return [
    { ...AP_ACCOUNT, debit: input.historicalFunctionalAmount, credit: ZERO },
    { accountCode: input.bankAccountCode, accountName: input.bankAccountName, debit: ZERO, credit: input.currentFunctionalAmount },
    ...(gain ? [{ ...GAIN_ACCOUNT, debit: ZERO, credit: abs }] : []),
    ...(loss ? [{ ...LOSS_ACCOUNT, debit: abs, credit: ZERO }] : [])
  ];
}

function revaluationLines(input: { sourceType: FxDocumentType; difference: DecimalValue }) {
  const diff = money(input.difference);
  const abs = money(diff.abs());
  if (diff.isZero()) throw new HttpError(409, 'La revaluación no produce diferencia cambiaria; no se crea un asiento vacío.');
  if (input.sourceType === 'sales') {
    return diff.isPositive()
      ? [{ ...AR_ACCOUNT, debit: abs, credit: ZERO }, { ...GAIN_ACCOUNT, debit: ZERO, credit: abs }]
      : [{ ...LOSS_ACCOUNT, debit: abs, credit: ZERO }, { ...AR_ACCOUNT, debit: ZERO, credit: abs }];
  }
  return diff.isPositive()
    ? [{ ...AP_ACCOUNT, debit: abs, credit: ZERO }, { ...GAIN_ACCOUNT, debit: ZERO, credit: abs }]
    : [{ ...LOSS_ACCOUNT, debit: abs, credit: ZERO }, { ...AP_ACCOUNT, debit: ZERO, credit: abs }];
}

router.get('/bcv', asyncHandler(async (_req, res) => ok(res, serializeRate(await getBcvRate()))));
router.get('/bcv/providers', (_req, res) => ok(res, providers.map(({ source, url }) => ({ source, url }))));

router.get('/fx/policy', requireTenant, requirePermission('accounting.view'), asyncHandler(async (req, res) => {
  ok(res, await getFxPolicy(context(req).tenantId));
}));

router.put('/fx/policy', requireTenant, requirePermission('accounting.post'), validateBody(policySchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const actorId = requireActor(ctx);
  const current = await getFxPolicy(ctx.tenantId);
  const requested = normalizeCurrency(req.body.functionalCurrency);
  if (current.functionalCurrency !== requested && await countDocumentSnapshots(ctx.tenantId) > 0) {
    throw new HttpError(409, 'No se puede cambiar la moneda funcional después de registrar documentos FX. Crea una política de migración contable explícita.');
  }
  const policy = await upsertFxPolicy({ tenantId: ctx.tenantId, functionalCurrency: requested, updatedBy: actorId });
  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'fx.policy.updated', entity: 'FinancialFxPolicy', entityId: ctx.tenantId, before: current, after: policy, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  ok(res, policy);
}));

router.put('/fx/bank-accounts/:id/ledger-account', requireTenant, requirePermission('accounting.post'), validateBody(bankMapSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  requireActor(ctx);
  const mapping = await upsertBankAccountMap({ tenantId: ctx.tenantId, bankAccountId: req.params.id, ledgerAccountCode: req.body.ledgerAccountCode });
  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'fx.bank-account.mapped', entity: 'BankAccount', entityId: req.params.id, after: mapping, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  ok(res, mapping);
}));

router.post('/fx/settlements', requireTenant, requirePermission('accounting.post'), validateBody(settlementSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const actorId = requireActor(ctx);
  const scope = 'currency.fx.settlement';
  const execution = await runFinancialIdempotentMutation({
    tenantId: ctx.tenantId,
    scope,
    key: idempotencyKey(req),
    request: req.body,
    requestId: requestId(req),
    replay: async (tx, record) => {
      if (!record.resourceId) throw new HttpError(409, 'El resultado FX original no tiene recurso asociado.');
      const event = await getFxEvent({ tenantId: ctx.tenantId, eventId: record.resourceId }, tx);
      if (!event) throw new HttpError(409, 'El evento FX original ya no puede reconstruirse.');
      return event;
    }
  }, async (tx) => {
    await assertPeriodOpen(ctx.tenantId, req.body.fiscalPeriod, tx);
    const sourceType = req.body.sourceType as FxDocumentType;
    const snapshot = await getDocumentSnapshot({ tenantId: ctx.tenantId, documentType: sourceType, documentId: req.body.sourceId }, tx);
    if (!snapshot) throw new HttpError(409, 'El documento no posee snapshot FX autoritativo.');
    const document = await loadDocument(tx, ctx.tenantId, sourceType, req.body.sourceId);
    if (document.status === 'draft' || document.status === 'cancelled') throw new HttpError(409, 'Solo documentos emitidos y vigentes pueden liquidarse.');

    const appliedOriginalAmount = money(req.body.appliedOriginalAmount);
    const realizedBefore = await realizedOriginalAmount({ tenantId: ctx.tenantId, sourceType, sourceId: req.body.sourceId }, tx);
    const realizedAfter = money(add(realizedBefore, appliedOriginalAmount));
    if (realizedAfter.gt(snapshot.originalTotal)) throw new HttpError(409, 'La liquidación excede el saldo original pendiente del documento.');

    const bankMovement = await tx.bankMovement.findFirst({
      where: { id: req.body.bankMovementId, tenantId: ctx.tenantId },
      include: { account: true }
    });
    if (!bankMovement) throw new HttpError(404, 'Movimiento bancario no encontrado.');
    if (bankMovement.matched || bankMovement.ledgerEntryId) throw new HttpError(409, 'El movimiento bancario ya está conciliado o contabilizado.');
    const settlementAmount = money(req.body.settlementAmount);
    const bankAmount = sourceType === 'sales' ? money(bankMovement.credit) : money(bankMovement.debit);
    const oppositeAmount = sourceType === 'sales' ? money(bankMovement.debit) : money(bankMovement.credit);
    if (!oppositeAmount.isZero() || !bankAmount.eq(settlementAmount)) throw new HttpError(409, 'El importe/dirección del movimiento bancario no coincide con la liquidación declarada.');

    const bankMap = await getBankAccountMap({ tenantId: ctx.tenantId, bankAccountId: bankMovement.accountId }, tx);
    if (!bankMap) throw new HttpError(409, 'La cuenta bancaria no posee mapeo contable FX.');
    const bankChart = await tx.chartAccount.findFirst({ where: { tenantId: ctx.tenantId, code: bankMap.ledgerAccountCode, allowPosting: true } });
    if (!bankChart) throw new HttpError(409, 'El mapeo contable de la cuenta bancaria dejó de ser válido.');

    const settlementFx = resolveFxContext({
      originalCurrency: bankMovement.account.currency,
      functionalCurrency: snapshot.functionalCurrency,
      exchangeRate: req.body.currentRate,
      rateDate: req.body.rateDate,
      rateSource: req.body.rateSource,
      documentDate: bankMovement.date
    });
    const currentFunctionalAmount = convertToFunctional(settlementAmount, settlementFx.exchangeRate);
    const historicalFunctionalAmount = convertToFunctional(appliedOriginalAmount, snapshot.exchangeRate);
    const difference = sourceType === 'sales'
      ? money(currentFunctionalAmount.minus(historicalFunctionalAmount))
      : money(historicalFunctionalAmount.minus(currentFunctionalAmount));
    const lines = settlementLines({ sourceType, bankAccountCode: bankChart.code, bankAccountName: bankChart.name, historicalFunctionalAmount, currentFunctionalAmount, difference });
    assertBalanced(lines);

    const draft = await tx.ledgerEntry.create({
      data: {
        tenantId: ctx.tenantId,
        fiscalPeriod: req.body.fiscalPeriod,
        description: `Liquidación FX ${sourceType}:${req.body.sourceId}`,
        source: 'banking',
        sourceId: `fx-settlement:${bankMovement.id}`,
        posted: false,
        lines: { create: lines.map((line) => ({ ...line, currency: snapshot.functionalCurrency, exchangeRate: ONE })) }
      }
    });
    const postedAt = new Date();
    const ledger = await tx.ledgerEntry.update({ where: { id: draft.id }, data: { posted: true, postedAt, postedBy: actorId }, include: { lines: true } });
    await tx.bankMovement.update({ where: { id: bankMovement.id }, data: { matched: true, ledgerEntryId: ledger.id } });
    const event = await createFxEvent({
      tenantId: ctx.tenantId,
      kind: 'realized',
      sourceType,
      sourceId: req.body.sourceId,
      bankMovementId: bankMovement.id,
      documentCurrency: snapshot.originalCurrency,
      settlementCurrency: bankMovement.account.currency,
      functionalCurrency: snapshot.functionalCurrency,
      originalAmount: appliedOriginalAmount,
      settlementAmount,
      historicalRate: snapshot.exchangeRate,
      currentRate: settlementFx.exchangeRate,
      historicalFunctionalAmount,
      currentFunctionalAmount,
      difference,
      fiscalPeriod: req.body.fiscalPeriod,
      rateDate: settlementFx.rateDate,
      rateSource: settlementFx.rateSource,
      ledgerEntryId: ledger.id
    }, tx);

    if (realizedAfter.eq(snapshot.originalTotal)) {
      if (sourceType === 'sales') await tx.salesInvoice.update({ where: { id: req.body.sourceId }, data: { status: 'paid' } });
      else await tx.purchaseInvoice.update({ where: { id: req.body.sourceId }, data: { status: 'paid' } });
    }
    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: actorId,
        action: 'fx.settlement.posted',
        entity: 'FinancialFxEvent',
        entityId: event.id,
        after: { eventId: event.id, sourceType, sourceId: req.body.sourceId, bankMovementId: bankMovement.id, ledgerEntryId: ledger.id, originalAmount: serializeDecimal(appliedOriginalAmount, 2), settlementAmount: serializeDecimal(settlementAmount, 2), difference: serializeDecimal(difference, 2), requestId: requestId(req) },
        ipAddress: ctx.ip || null,
        userAgent: ctx.userAgent || null
      }
    });
    return { data: event, resourceType: 'FinancialFxEvent', resourceId: event.id };
  });

  res.setHeader('Idempotency-Replayed', execution.replayed ? 'true' : 'false');
  ok(res, execution.data, execution.responseCode);
}));

router.post('/fx/revaluations', requireTenant, requirePermission('accounting.post'), validateBody(revaluationSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const actorId = requireActor(ctx);
  const scope = 'currency.fx.revaluation';
  const execution = await runFinancialIdempotentMutation({
    tenantId: ctx.tenantId,
    scope,
    key: idempotencyKey(req),
    request: req.body,
    requestId: requestId(req),
    replay: async (tx, record) => {
      if (!record.resourceId) throw new HttpError(409, 'El resultado de revaluación original no tiene recurso asociado.');
      const event = await getFxEvent({ tenantId: ctx.tenantId, eventId: record.resourceId }, tx);
      if (!event) throw new HttpError(409, 'La revaluación original ya no puede reconstruirse.');
      return event;
    }
  }, async (tx) => {
    await assertPeriodOpen(ctx.tenantId, req.body.fiscalPeriod, tx);
    const sourceType = req.body.sourceType as FxDocumentType;
    const snapshot = await getDocumentSnapshot({ tenantId: ctx.tenantId, documentType: sourceType, documentId: req.body.sourceId }, tx);
    if (!snapshot) throw new HttpError(409, 'El documento no posee snapshot FX autoritativo.');
    const document = await loadDocument(tx, ctx.tenantId, sourceType, req.body.sourceId);
    if (document.status === 'draft' || document.status === 'cancelled') throw new HttpError(409, 'Solo documentos emitidos y vigentes pueden revaluarse.');
    if (await latestUnreversedRevaluation({ tenantId: ctx.tenantId, sourceType, sourceId: req.body.sourceId }, tx)) {
      throw new HttpError(409, 'Existe una revaluación no realizada vigente. Reviértela antes de registrar otra.');
    }

    const realized = await realizedOriginalAmount({ tenantId: ctx.tenantId, sourceType, sourceId: req.body.sourceId }, tx);
    const outstanding = money(subtract(snapshot.originalTotal, realized));
    if (!outstanding.isPositive()) throw new HttpError(409, 'El documento no posee saldo original pendiente para revaluar.');
    const currentFx = resolveFxContext({
      originalCurrency: snapshot.originalCurrency,
      functionalCurrency: snapshot.functionalCurrency,
      exchangeRate: req.body.currentRate,
      rateDate: req.body.rateDate,
      rateSource: req.body.rateSource
    });
    const valuation = sourceType === 'sales'
      ? fxDifferenceForAsset({ originalAmount: outstanding, historicalRate: snapshot.exchangeRate, currentRate: currentFx.exchangeRate })
      : fxDifferenceForLiability({ originalAmount: outstanding, historicalRate: snapshot.exchangeRate, currentRate: currentFx.exchangeRate });
    const lines = revaluationLines({ sourceType, difference: valuation.difference });
    assertBalanced(lines);

    const draft = await tx.ledgerEntry.create({
      data: {
        tenantId: ctx.tenantId,
        fiscalPeriod: req.body.fiscalPeriod,
        description: `Revaluación FX ${sourceType}:${req.body.sourceId}`,
        source: 'manual',
        sourceId: `fx-revaluation:${sourceType}:${req.body.sourceId}:${currentFx.rateDate.toISOString()}`,
        posted: false,
        lines: { create: lines.map((line) => ({ ...line, currency: snapshot.functionalCurrency, exchangeRate: ONE })) }
      }
    });
    const postedAt = new Date();
    const ledger = await tx.ledgerEntry.update({ where: { id: draft.id }, data: { posted: true, postedAt, postedBy: actorId }, include: { lines: true } });
    const event = await createFxEvent({
      tenantId: ctx.tenantId,
      kind: 'unrealized',
      sourceType,
      sourceId: req.body.sourceId,
      documentCurrency: snapshot.originalCurrency,
      functionalCurrency: snapshot.functionalCurrency,
      originalAmount: outstanding,
      historicalRate: snapshot.exchangeRate,
      currentRate: currentFx.exchangeRate,
      historicalFunctionalAmount: valuation.historicalFunctionalAmount,
      currentFunctionalAmount: valuation.currentFunctionalAmount,
      difference: valuation.difference,
      fiscalPeriod: req.body.fiscalPeriod,
      rateDate: currentFx.rateDate,
      rateSource: currentFx.rateSource,
      ledgerEntryId: ledger.id
    }, tx);
    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: actorId,
        action: 'fx.revaluation.posted',
        entity: 'FinancialFxEvent',
        entityId: event.id,
        after: { eventId: event.id, sourceType, sourceId: req.body.sourceId, ledgerEntryId: ledger.id, outstandingOriginal: serializeDecimal(outstanding, 2), difference: serializeDecimal(valuation.difference, 2), requestId: requestId(req) },
        ipAddress: ctx.ip || null,
        userAgent: ctx.userAgent || null
      }
    });
    return { data: event, resourceType: 'FinancialFxEvent', resourceId: event.id };
  });

  res.setHeader('Idempotency-Replayed', execution.replayed ? 'true' : 'false');
  ok(res, execution.data, execution.responseCode);
}));

router.post('/fx/events/:id/reverse', requireTenant, requirePermission('accounting.post'), validateBody(reverseEventSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const actorId = requireActor(ctx);
  const scope = 'currency.fx.revaluation.reverse';
  const execution = await runFinancialIdempotentMutation({
    tenantId: ctx.tenantId,
    scope,
    key: idempotencyKey(req),
    request: { eventId: req.params.id, ...req.body },
    requestId: requestId(req)
  }, async (tx) => {
    await assertPeriodOpen(ctx.tenantId, req.body.fiscalPeriod, tx);
    const event = await getFxEvent({ tenantId: ctx.tenantId, eventId: req.params.id }, tx);
    if (!event) throw new HttpError(404, 'Evento cambiario no encontrado.');
    if (event.kind !== 'unrealized') throw new HttpError(409, 'Las liquidaciones realizadas no se revierten por esta ruta; corrige el movimiento bancario mediante su flujo auditable.');
    if (event.reversedAt || event.reversalLedgerEntryId) throw new HttpError(409, 'La revaluación ya fue reversada.');
    const original = await tx.ledgerEntry.findFirst({ where: { id: event.ledgerEntryId, tenantId: ctx.tenantId }, include: { lines: true, reversedBy: true } });
    if (!original || !original.posted) throw new HttpError(409, 'El asiento original de revaluación no está disponible o no está contabilizado.');
    if (original.reversedBy) throw new HttpError(409, 'El asiento de revaluación ya tiene reverso.');
    const lines = inverseLedgerLines(original.lines);
    const draft = await tx.ledgerEntry.create({
      data: {
        tenantId: ctx.tenantId,
        date: req.body.reversalDate || new Date(),
        fiscalPeriod: req.body.fiscalPeriod,
        description: `Reverso de revaluación FX ${event.id}`,
        source: 'manual',
        sourceId: `fx-revaluation-reversal:${event.id}`,
        posted: false,
        lines: { create: lines.map((line) => ({ ...line })) }
      }
    });
    const postedAt = new Date();
    const reversal = await tx.ledgerEntry.update({ where: { id: draft.id }, data: { posted: true, postedAt, postedBy: actorId, reversalOfId: original.id }, include: { lines: true } });
    const updated = await markFxEventReversed({ tenantId: ctx.tenantId, eventId: event.id, reversalLedgerEntryId: reversal.id }, tx);
    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: actorId,
        action: 'fx.revaluation.reversed',
        entity: 'FinancialFxEvent',
        entityId: event.id,
        before: { ledgerEntryId: original.id, reversedAt: null },
        after: { reversalLedgerEntryId: reversal.id, reason: req.body.reason || 'Reverso de revaluación', requestId: requestId(req) },
        ipAddress: ctx.ip || null,
        userAgent: ctx.userAgent || null
      }
    });
    return { data: updated, resourceType: 'FinancialFxEvent', resourceId: event.id };
  });

  res.setHeader('Idempotency-Replayed', execution.replayed ? 'true' : 'false');
  ok(res, execution.data, execution.responseCode);
}));

router.get('/fx/exposure', requireTenant, requirePermission('accounting.view'), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const sourceType = req.query.sourceType ? sourceTypeSchema.parse(req.query.sourceType) : undefined;
  const sourceId = req.query.sourceId ? z.string().uuid().parse(req.query.sourceId) : undefined;
  if ((sourceType && !sourceId) || (!sourceType && sourceId)) throw new HttpError(422, 'sourceType y sourceId deben enviarse juntos.');
  const snapshots = await listDocumentSnapshots({ tenantId: ctx.tenantId, sourceType, sourceId });
  const rows = [];
  for (const snapshot of snapshots) {
    const events = await listFxEvents({ tenantId: ctx.tenantId, sourceType: snapshot.documentType, sourceId: snapshot.documentId });
    const realized = events.filter((event) => event.kind === 'realized' && !event.reversedAt).reduce((sum, event) => add(sum, event.originalAmount), ZERO);
    const outstandingOriginal = money(subtract(snapshot.originalTotal, realized));
    const activeRevaluation = [...events].reverse().find((event) => event.kind === 'unrealized' && !event.reversedAt) || null;
    rows.push({
      documentType: snapshot.documentType,
      documentId: snapshot.documentId,
      original: { currency: snapshot.originalCurrency, subtotal: snapshot.originalSubtotal, tax: snapshot.originalTax, total: snapshot.originalTotal, exchangeRate: snapshot.exchangeRate, rateDate: snapshot.rateDate, rateSource: snapshot.rateSource },
      functional: { currency: snapshot.functionalCurrency, subtotal: snapshot.functionalSubtotal, tax: snapshot.functionalTax, total: snapshot.functionalTotal },
      realizedOriginalAmount: realized,
      outstandingOriginalAmount,
      carryingFunctionalAmount: activeRevaluation?.currentFunctionalAmount ?? convertToFunctional(outstandingOriginal, snapshot.exchangeRate),
      activeRevaluation,
      events
    });
  }
  ok(res, { policy: await getFxPolicy(ctx.tenantId), exposures: rows });
}));

export default router;
