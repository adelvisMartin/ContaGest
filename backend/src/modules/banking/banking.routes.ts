import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { HttpError, asyncHandler, ok } from '../../shared/http.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { writeAudit } from '../../shared/services/audit.service.js';
import { runFinancialIdempotentMutation } from '../../shared/services/financial-idempotency.service.js';
import { add, compare, money, serializeDecimal, serializeLegacyNumber, subtract, ZERO } from '../../shared/financial/decimal.js';
import { decimalSchema } from '../../shared/financial/zod.js';

const router = Router();
router.use(requireTenant, requirePermission('banking.manage'));

const createAccountSchema = z.object({
  bankName: z.string().min(2).max(160),
  accountNo: z.string().min(4).max(120),
  currency: z.string().min(3).max(4).default('VES'),
  openingBalance: decimalSchema('money').optional()
}).strict();

const openingBalanceSchema = z.object({
  amount: decimalSchema('money').refine((value) => compare(value, ZERO) !== 0, 'El saldo de apertura debe ser distinto de cero.'),
  reason: z.string().trim().min(5).max(500)
}).strict();

const movementSchema = z.object({
  accountId: z.string().uuid(),
  date: z.string().optional(),
  description: z.string().min(2).max(240),
  reference: z.string().max(120).optional(),
  type: z.enum(['income', 'expense']),
  currency: z.string().min(3).max(4).optional(),
  amount: decimalSchema('money', { positive: true })
}).strict();

const reconcileSchema = z.object({
  matched: z.boolean().default(true),
  ledgerEntryId: z.string().uuid().nullable().optional()
}).strict();

const reversalSchema = z.object({
  reason: z.string().trim().min(5).max(500),
  date: z.string().optional()
}).strict();

const correctionSchema = z.object({
  reason: z.string().trim().min(5).max(500),
  date: z.string().optional(),
  description: z.string().min(2).max(240),
  reference: z.string().max(120).optional(),
  type: z.enum(['income', 'expense']),
  amount: decimalSchema('money', { positive: true })
}).strict();

type AuditLink = {
  id: string;
  accountId: string;
  originalMovementId: string | null;
  relatedMovementId: string;
  kind: 'opening' | 'reversal' | 'correction';
  reason: string;
  createdAt: Date;
};

type DbClient = typeof prisma | Prisma.TransactionClient;

const context = (req: any) => req.context as { tenantId: string; userId?: string; ip?: string; userAgent?: string };
const requestId = (req: any) => String(req.requestId || '') || null;
const idempotencyKey = (req: any) => req.header('Idempotency-Key') || null;

const serializeAccount = (account: any) => ({
  ...account,
  balance: serializeLegacyNumber(account.balance),
  balanceExact: serializeDecimal(account.balance, 2)
});

const serializeMovement = (movement: any) => {
  const credit = money(movement.credit ?? ZERO);
  const debit = money(movement.debit ?? ZERO);
  const isIncome = compare(credit, ZERO) > 0;
  const amount = isIncome ? credit : debit;
  return {
    ...movement,
    currency: movement.currency || movement.account?.currency,
    amount: serializeLegacyNumber(amount),
    amountExact: serializeDecimal(amount, 2),
    type: isIncome ? 'income' : 'expense',
    reconciled: Boolean(movement.matched)
  };
};

const movementDelta = (movement: any) => subtract(movement.credit ?? ZERO, movement.debit ?? ZERO);

async function lockAccount(tx: Prisma.TransactionClient, tenantId: string, accountId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "BankAccount"
    WHERE "tenantId" = ${tenantId} AND "id" = ${accountId} AND "active" = true
    FOR UPDATE
  `);
  if (!rows.length) throw new HttpError(404, 'Cuenta bancaria no encontrada para el tenant activo.');
  return tx.bankAccount.findFirst({ where: { id: accountId, tenantId, active: true } });
}

async function movementLinks(db: DbClient, tenantId: string, movementIds: string[]) {
  if (!movementIds.length) return [] as AuditLink[];
  return db.$queryRaw<AuditLink[]>(Prisma.sql`
    SELECT "id", "accountId", "originalMovementId", "relatedMovementId", "kind", "reason", "createdAt"
    FROM "BankMovementAuditLink"
    WHERE "tenantId" = ${tenantId}
      AND (
        "originalMovementId" IN (${Prisma.join(movementIds)})
        OR "relatedMovementId" IN (${Prisma.join(movementIds)})
      )
    ORDER BY "createdAt" ASC
  `);
}

async function decorateMovements(db: DbClient, tenantId: string, rows: any[]) {
  const links = await movementLinks(db, tenantId, rows.map((row) => row.id));
  const byOriginal = new Map<string, AuditLink[]>();
  const byRelated = new Map<string, AuditLink>();
  for (const link of links) {
    if (link.originalMovementId) byOriginal.set(link.originalMovementId, [...(byOriginal.get(link.originalMovementId) || []), link]);
    byRelated.set(link.relatedMovementId, link);
  }
  return rows.map((row) => {
    const serialized = serializeMovement(row);
    const sourceLink = byRelated.get(row.id);
    const children = byOriginal.get(row.id) || [];
    const reversal = children.find((link) => link.kind === 'reversal');
    const correction = children.find((link) => link.kind === 'correction');
    return {
      ...serialized,
      lifecycle: sourceLink?.kind || 'normal',
      reversalOfId: sourceLink?.kind === 'reversal' ? sourceLink.originalMovementId : null,
      correctionOfId: sourceLink?.kind === 'correction' ? sourceLink.originalMovementId : null,
      reversedById: reversal?.relatedMovementId || null,
      correctedById: correction?.relatedMovementId || null,
      correctionReason: sourceLink?.reason || reversal?.reason || correction?.reason || null
    };
  });
}

async function insertAuditLink(tx: Prisma.TransactionClient, input: {
  tenantId: string;
  accountId: string;
  originalMovementId?: string | null;
  relatedMovementId: string;
  kind: AuditLink['kind'];
  reason: string;
  createdBy?: string;
}) {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "BankMovementAuditLink"
      ("id", "tenantId", "accountId", "originalMovementId", "relatedMovementId", "kind", "reason", "createdBy")
    VALUES
      (${randomUUID()}, ${input.tenantId}, ${input.accountId}, ${input.originalMovementId || null}, ${input.relatedMovementId}, ${input.kind}, ${input.reason}, ${input.createdBy || null})
  `);
}

async function assertNotReversed(tx: Prisma.TransactionClient, tenantId: string, movementId: string) {
  const existing = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "BankMovementAuditLink"
    WHERE "tenantId" = ${tenantId} AND "originalMovementId" = ${movementId} AND "kind" = 'reversal'
    LIMIT 1
  `);
  if (existing.length) throw new HttpError(409, 'El movimiento ya fue reversado.', { code: 'BANK_MOVEMENT_ALREADY_REVERSED' });
}

async function createReversal(tx: Prisma.TransactionClient, movement: any, tenantId: string, userId: string | undefined, reason: string, date?: string) {
  const reversal = await tx.bankMovement.create({
    data: {
      tenantId,
      accountId: movement.accountId,
      date: date ? new Date(date) : new Date(),
      description: `Reverso: ${movement.description}`,
      reference: `REV-${movement.id}`,
      debit: movement.credit,
      credit: movement.debit,
      matched: false,
      ledgerEntryId: null
    },
    include: { account: true }
  });
  await insertAuditLink(tx, {
    tenantId,
    accountId: movement.accountId,
    originalMovementId: movement.id,
    relatedMovementId: reversal.id,
    kind: 'reversal',
    reason,
    createdBy: userId
  });
  return reversal;
}

router.get('/summary', asyncHandler(async (req, res) => {
  const ctx = context(req);
  const [accounts, movements, pending, aggregates, openingLinks] = await Promise.all([
    prisma.bankAccount.findMany({ where: { tenantId: ctx.tenantId, active: true }, orderBy: { bankName: 'asc' } }),
    prisma.bankMovement.findMany({ where: { tenantId: ctx.tenantId }, include: { account: true }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 250 }),
    prisma.bankMovement.count({ where: { tenantId: ctx.tenantId, matched: false } }),
    prisma.bankMovement.groupBy({ by: ['accountId'], where: { tenantId: ctx.tenantId }, _sum: { debit: true, credit: true } }),
    prisma.$queryRaw<Array<{ accountId: string }>>(Prisma.sql`
      SELECT DISTINCT "accountId" FROM "BankMovementAuditLink"
      WHERE "tenantId" = ${ctx.tenantId} AND "kind" = 'opening'
    `)
  ]);
  const aggregateByAccount = new Map(aggregates.map((row) => [row.accountId, subtract(row._sum.credit ?? ZERO, row._sum.debit ?? ZERO)]));
  const explicitOpening = new Set(openingLinks.map((row) => row.accountId));
  const serializedAccounts = accounts.map((account) => {
    const projected = aggregateByAccount.get(account.id) || ZERO;
    const difference = subtract(account.balance, projected);
    const exact = compare(difference, ZERO) === 0;
    const integrity = exact ? 'ok' : explicitOpening.has(account.id) ? 'mismatch' : 'legacy-baseline-required';
    if (integrity === 'mismatch') {
      console.warn('bank.balance.integrity_mismatch', { tenantId: ctx.tenantId, accountId: account.id });
    }
    return {
      ...serializeAccount(account),
      projectedBalanceExact: serializeDecimal(projected, 2),
      integrity,
      integrityDifferenceExact: serializeDecimal(difference, 2)
    };
  });
  ok(res, {
    accounts: serializedAccounts,
    movements: await decorateMovements(prisma, ctx.tenantId, movements),
    pending,
    reconciliationRate: movements.length ? Math.round(((movements.length - pending) / movements.length) * 100) : 100
  });
}));

router.post('/accounts', validateBody(createAccountSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const input = req.body as z.infer<typeof createAccountSchema>;
  const openingBalance = input.openingBalance ?? ZERO;
  const execution = await runFinancialIdempotentMutation({
    tenantId: ctx.tenantId,
    scope: 'banking.accounts.open',
    key: idempotencyKey(req),
    request: { ...input, openingBalance: serializeDecimal(openingBalance, 2) },
    requestId: requestId(req),
    replay: async (tx, record) => {
      if (!record.resourceId) throw new HttpError(409, 'El resultado original de apertura no tiene cuenta asociada.', { code: 'IDEMPOTENCY_RESULT_UNAVAILABLE', scope: 'banking.accounts.open' });
      const account = await tx.bankAccount.findFirst({ where: { id: record.resourceId, tenantId: ctx.tenantId } });
      if (!account) throw new HttpError(409, 'La cuenta original ya no puede reconstruirse.', { code: 'IDEMPOTENCY_RESULT_UNAVAILABLE', scope: 'banking.accounts.open' });
      const link = await tx.$queryRaw<Array<{ relatedMovementId: string }>>(Prisma.sql`
        SELECT "relatedMovementId" FROM "BankMovementAuditLink"
        WHERE "tenantId" = ${ctx.tenantId} AND "accountId" = ${account.id} AND "kind" = 'opening'
        LIMIT 1
      `);
      return { ...serializeAccount(account), openingMovementId: link[0]?.relatedMovementId || null };
    }
  }, async (tx) => {
    const account = await tx.bankAccount.create({
      data: { tenantId: ctx.tenantId, bankName: input.bankName, accountNo: input.accountNo, currency: input.currency, balance: ZERO, active: true }
    });
    let openingMovementId: string | null = null;
    if (compare(openingBalance, ZERO) !== 0) {
      const income = compare(openingBalance, ZERO) > 0;
      const magnitude = openingBalance.abs();
      const opening = await tx.bankMovement.create({
        data: {
          tenantId: ctx.tenantId,
          accountId: account.id,
          date: new Date(),
          description: 'Saldo de apertura',
          reference: 'OPENING',
          debit: income ? ZERO : magnitude,
          credit: income ? magnitude : ZERO,
          matched: false,
          ledgerEntryId: null
        }
      });
      openingMovementId = opening.id;
      await tx.bankAccount.update({ where: { id: account.id }, data: { balance: { increment: openingBalance } } });
      await insertAuditLink(tx, { tenantId: ctx.tenantId, accountId: account.id, relatedMovementId: opening.id, kind: 'opening', reason: 'Saldo inicial registrado al crear la cuenta.', createdBy: ctx.userId });
    }
    const stored = await tx.bankAccount.findUniqueOrThrow({ where: { id: account.id } });
    return { data: { ...serializeAccount(stored), openingMovementId }, resourceType: 'BankAccount', resourceId: account.id };
  });
  res.setHeader('Idempotency-Replayed', execution.replayed ? 'true' : 'false');
  if (!execution.replayed) {
    await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'banking.account-opened', entity: 'BankAccount', entityId: (execution.data as any).id, after: execution.data, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  }
  ok(res, execution.data, execution.responseCode);
}));

router.post('/accounts/:id/opening-balance', validateBody(openingBalanceSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const input = req.body as z.infer<typeof openingBalanceSchema>;
  const execution = await runFinancialIdempotentMutation({
    tenantId: ctx.tenantId,
    scope: 'banking.accounts.opening-balance',
    key: idempotencyKey(req),
    request: { accountId: req.params.id, amount: serializeDecimal(input.amount, 2), reason: input.reason },
    requestId: requestId(req),
    replay: async (tx, record) => {
      if (!record.resourceId) throw new HttpError(409, 'El saldo de apertura original no puede reconstruirse.', { code: 'IDEMPOTENCY_RESULT_UNAVAILABLE' });
      const movement = await tx.bankMovement.findFirst({ where: { id: record.resourceId, tenantId: ctx.tenantId }, include: { account: true } });
      if (!movement) throw new HttpError(409, 'El movimiento de apertura original no existe.', { code: 'IDEMPOTENCY_RESULT_UNAVAILABLE' });
      return serializeMovement(movement);
    }
  }, async (tx) => {
    const account = await lockAccount(tx, ctx.tenantId, req.params.id);
    if (!account) throw new HttpError(404, 'Cuenta bancaria no encontrada.');
    const movementCount = await tx.bankMovement.count({ where: { tenantId: ctx.tenantId, accountId: account.id } });
    const existingOpening = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "BankMovementAuditLink"
      WHERE "tenantId" = ${ctx.tenantId} AND "accountId" = ${account.id} AND "kind" = 'opening'
      LIMIT 1
    `);
    if (movementCount > 0 || existingOpening.length || compare(account.balance, ZERO) !== 0) {
      throw new HttpError(409, 'El saldo de apertura sólo puede registrarse una vez antes de cualquier movimiento.', { code: 'BANK_OPENING_ALREADY_ESTABLISHED' });
    }
    const income = compare(input.amount, ZERO) > 0;
    const magnitude = input.amount.abs();
    const movement = await tx.bankMovement.create({
      data: {
        tenantId: ctx.tenantId,
        accountId: account.id,
        date: new Date(),
        description: 'Saldo de apertura',
        reference: 'OPENING',
        debit: income ? ZERO : magnitude,
        credit: income ? magnitude : ZERO,
        matched: false,
        ledgerEntryId: null
      },
      include: { account: true }
    });
    await tx.bankAccount.update({ where: { id: account.id }, data: { balance: { increment: input.amount } } });
    await insertAuditLink(tx, { tenantId: ctx.tenantId, accountId: account.id, relatedMovementId: movement.id, kind: 'opening', reason: input.reason, createdBy: ctx.userId });
    return { data: serializeMovement(movement), resourceType: 'BankMovement', resourceId: movement.id };
  });
  res.setHeader('Idempotency-Replayed', execution.replayed ? 'true' : 'false');
  if (!execution.replayed) {
    await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'banking.opening-balance', entity: 'BankMovement', entityId: (execution.data as any).id, after: { ...execution.data as any, reason: input.reason }, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  }
  ok(res, execution.data, execution.responseCode);
}));

router.get('/movements', asyncHandler(async (req, res) => {
  const ctx = context(req);
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || 'all');
  const accountId = String(req.query.accountId || '');
  const take = Math.min(Math.max(Number(req.query.take || 100), 1), 500);
  const rows = await prisma.bankMovement.findMany({
    where: {
      tenantId: ctx.tenantId,
      ...(accountId ? { accountId } : {}),
      ...(status === 'pending' ? { matched: false } : status === 'reconciled' ? { matched: true } : {}),
      ...(q ? { OR: [{ description: { contains: q, mode: 'insensitive' } }, { reference: { contains: q, mode: 'insensitive' } }, { account: { bankName: { contains: q, mode: 'insensitive' } } }] } : {})
    },
    include: { account: true },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take
  });
  ok(res, await decorateMovements(prisma, ctx.tenantId, rows));
}));

router.post('/movements', validateBody(movementSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const input = req.body as z.infer<typeof movementSchema>;
  const execution = await runFinancialIdempotentMutation({
    tenantId: ctx.tenantId,
    scope: 'banking.movements.create',
    key: idempotencyKey(req),
    request: { ...input, amount: serializeDecimal(input.amount, 2) },
    requestId: requestId(req),
    replay: async (tx, record) => {
      if (!record.resourceId) throw new HttpError(409, 'El resultado original del movimiento no tiene recurso asociado.', { code: 'IDEMPOTENCY_RESULT_UNAVAILABLE', scope: 'banking.movements.create' });
      const movement = await tx.bankMovement.findFirst({ where: { id: record.resourceId, tenantId: ctx.tenantId }, include: { account: true } });
      if (!movement) throw new HttpError(409, 'El movimiento bancario original ya no puede reconstruirse.', { code: 'IDEMPOTENCY_RESULT_UNAVAILABLE', scope: 'banking.movements.create' });
      return serializeMovement(movement);
    }
  }, async (tx) => {
    const account = await lockAccount(tx, ctx.tenantId, input.accountId);
    if (!account) throw new HttpError(404, 'Cuenta bancaria no encontrada para el tenant activo.');
    if (input.currency && input.currency !== account.currency) throw new HttpError(409, 'La moneda del movimiento no coincide con la cuenta.');
    const delta = input.type === 'income' ? input.amount : subtract(ZERO, input.amount);
    const movement = await tx.bankMovement.create({
      data: {
        tenantId: ctx.tenantId,
        accountId: account.id,
        date: input.date ? new Date(input.date) : new Date(),
        description: input.description,
        reference: input.reference || null,
        debit: input.type === 'expense' ? input.amount : ZERO,
        credit: input.type === 'income' ? input.amount : ZERO,
        matched: false
      },
      include: { account: true }
    });
    await tx.bankAccount.update({ where: { id: account.id }, data: { balance: { increment: delta } } });
    return { data: serializeMovement(movement), resourceType: 'BankMovement', resourceId: movement.id };
  });

  res.setHeader('Idempotency-Replayed', execution.replayed ? 'true' : 'false');
  if (execution.replayed) {
    await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'idempotency.replay', entity: 'BankMovement', entityId: (execution.data as any).id, after: { scope: 'banking.movements.create', recordId: execution.recordId, originalRequestId: execution.originalRequestId, requestId: requestId(req) }, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  } else {
    await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'bank.movement.created', entity: 'BankMovement', entityId: (execution.data as any).id, after: execution.data, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  }
  ok(res, execution.data, execution.responseCode);
}));

router.patch('/movements/:id/reconcile', validateBody(reconcileSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const existing = await prisma.bankMovement.findFirst({ where: { id: req.params.id, tenantId: ctx.tenantId }, include: { account: true } });
  if (!existing) throw new HttpError(404, 'Movimiento bancario no encontrado.');
  const candidateLedgerId = req.body.matched ? (req.body.ledgerEntryId ?? existing.ledgerEntryId ?? null) : null;
  if (candidateLedgerId) {
    const ledger = await prisma.ledgerEntry.findFirst({ where: { id: candidateLedgerId, tenantId: ctx.tenantId } });
    if (!ledger) throw new HttpError(404, 'Asiento contable no encontrado para el tenant activo.', { code: 'BANK_LEDGER_ENTRY_NOT_FOUND' });
  }
  const updated = await prisma.bankMovement.update({
    where: { id: existing.id },
    data: { matched: req.body.matched, ledgerEntryId: candidateLedgerId },
    include: { account: true }
  });
  await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: req.body.matched ? 'bank.movement.reconciled' : 'bank.movement.unreconciled', entity: 'BankMovement', entityId: updated.id, before: serializeMovement(existing), after: serializeMovement(updated), ipAddress: ctx.ip, userAgent: ctx.userAgent });
  ok(res, serializeMovement(updated));
}));

router.post('/movements/:id/reverse', validateBody(reversalSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const input = req.body as z.infer<typeof reversalSchema>;
  const execution = await runFinancialIdempotentMutation({
    tenantId: ctx.tenantId,
    scope: 'banking.movements.reverse',
    key: idempotencyKey(req),
    request: { movementId: req.params.id, ...input },
    requestId: requestId(req),
    replay: async (tx, record) => {
      if (!record.resourceId) throw new HttpError(409, 'El reverso original no puede reconstruirse.', { code: 'IDEMPOTENCY_RESULT_UNAVAILABLE' });
      const movement = await tx.bankMovement.findFirst({ where: { id: record.resourceId, tenantId: ctx.tenantId }, include: { account: true } });
      if (!movement) throw new HttpError(409, 'El reverso original ya no existe.', { code: 'IDEMPOTENCY_RESULT_UNAVAILABLE' });
      return serializeMovement(movement);
    }
  }, async (tx) => {
    const original = await tx.bankMovement.findFirst({ where: { id: req.params.id, tenantId: ctx.tenantId }, include: { account: true } });
    if (!original) throw new HttpError(404, 'Movimiento bancario no encontrado.');
    await lockAccount(tx, ctx.tenantId, original.accountId);
    const refreshed = await tx.bankMovement.findFirst({ where: { id: original.id, tenantId: ctx.tenantId }, include: { account: true } });
    if (!refreshed) throw new HttpError(404, 'Movimiento bancario no encontrado.');
    if (refreshed.matched) throw new HttpError(409, 'Desconcilia el movimiento antes de reversarlo.', { code: 'BANK_MOVEMENT_RECONCILED' });
    await assertNotReversed(tx, ctx.tenantId, refreshed.id);
    const reversal = await createReversal(tx, refreshed, ctx.tenantId, ctx.userId, input.reason, input.date);
    await tx.bankAccount.update({ where: { id: refreshed.accountId }, data: { balance: { increment: subtract(ZERO, movementDelta(refreshed)) } } });
    return { data: { ...serializeMovement(reversal), reversalOfId: refreshed.id, correctionReason: input.reason }, resourceType: 'BankMovement', resourceId: reversal.id };
  });
  res.setHeader('Idempotency-Replayed', execution.replayed ? 'true' : 'false');
  if (!execution.replayed) {
    await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'bank.movement.reversed', entity: 'BankMovement', entityId: req.params.id, before: { id: req.params.id }, after: execution.data, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  }
  ok(res, execution.data, execution.responseCode);
}));

router.post('/movements/:id/correct', validateBody(correctionSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const input = req.body as z.infer<typeof correctionSchema>;
  const execution = await runFinancialIdempotentMutation({
    tenantId: ctx.tenantId,
    scope: 'banking.movements.correct',
    key: idempotencyKey(req),
    request: { movementId: req.params.id, ...input, amount: serializeDecimal(input.amount, 2) },
    requestId: requestId(req),
    replay: async (tx, record) => {
      if (!record.resourceId) throw new HttpError(409, 'La corrección original no puede reconstruirse.', { code: 'IDEMPOTENCY_RESULT_UNAVAILABLE' });
      const movement = await tx.bankMovement.findFirst({ where: { id: record.resourceId, tenantId: ctx.tenantId }, include: { account: true } });
      if (!movement) throw new HttpError(409, 'La corrección original ya no existe.', { code: 'IDEMPOTENCY_RESULT_UNAVAILABLE' });
      return serializeMovement(movement);
    }
  }, async (tx) => {
    const original = await tx.bankMovement.findFirst({ where: { id: req.params.id, tenantId: ctx.tenantId }, include: { account: true } });
    if (!original) throw new HttpError(404, 'Movimiento bancario no encontrado.');
    const account = await lockAccount(tx, ctx.tenantId, original.accountId);
    if (!account) throw new HttpError(404, 'Cuenta bancaria no encontrada.');
    const refreshed = await tx.bankMovement.findFirst({ where: { id: original.id, tenantId: ctx.tenantId }, include: { account: true } });
    if (!refreshed) throw new HttpError(404, 'Movimiento bancario no encontrado.');
    if (refreshed.matched) throw new HttpError(409, 'Desconcilia el movimiento antes de corregirlo.', { code: 'BANK_MOVEMENT_RECONCILED' });
    await assertNotReversed(tx, ctx.tenantId, refreshed.id);
    const reversal = await createReversal(tx, refreshed, ctx.tenantId, ctx.userId, input.reason, input.date);
    const replacementDelta = input.type === 'income' ? input.amount : subtract(ZERO, input.amount);
    const correction = await tx.bankMovement.create({
      data: {
        tenantId: ctx.tenantId,
        accountId: refreshed.accountId,
        date: input.date ? new Date(input.date) : new Date(),
        description: input.description,
        reference: input.reference || null,
        debit: input.type === 'expense' ? input.amount : ZERO,
        credit: input.type === 'income' ? input.amount : ZERO,
        matched: false,
        ledgerEntryId: null
      },
      include: { account: true }
    });
    await insertAuditLink(tx, { tenantId: ctx.tenantId, accountId: refreshed.accountId, originalMovementId: refreshed.id, relatedMovementId: correction.id, kind: 'correction', reason: input.reason, createdBy: ctx.userId });
    const netDelta = add(subtract(ZERO, movementDelta(refreshed)), replacementDelta);
    await tx.bankAccount.update({ where: { id: refreshed.accountId }, data: { balance: { increment: netDelta } } });
    return {
      data: {
        originalId: refreshed.id,
        reversal: { ...serializeMovement(reversal), reversalOfId: refreshed.id },
        correction: { ...serializeMovement(correction), correctionOfId: refreshed.id },
        reason: input.reason
      },
      resourceType: 'BankMovement',
      resourceId: correction.id
    };
  });
  res.setHeader('Idempotency-Replayed', execution.replayed ? 'true' : 'false');
  if (!execution.replayed) {
    await writeAudit({ tenantId: ctx.tenantId, userId: ctx.userId, action: 'bank.movement.corrected', entity: 'BankMovement', entityId: req.params.id, before: { id: req.params.id }, after: execution.data, ipAddress: ctx.ip, userAgent: ctx.userAgent });
  }
  ok(res, execution.data, execution.responseCode);
}));

router.delete('/movements/:id', asyncHandler(async (req, _res) => {
  const ctx = context(req);
  const existing = await prisma.bankMovement.findFirst({ where: { id: req.params.id, tenantId: ctx.tenantId } });
  if (!existing) throw new HttpError(404, 'Movimiento bancario no encontrado.');
  throw new HttpError(409, 'Los movimientos aplicados son inmutables. Usa reverso o corrección para conservar la trazabilidad.', { code: 'BANK_MOVEMENT_IMMUTABLE' });
}));

export default router;