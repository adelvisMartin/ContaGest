import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { HttpError, asyncHandler, ok } from '../../shared/http.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { writeAudit } from '../../shared/services/audit.service.js';

const router = Router();
router.use(requireTenant, requirePermission('banking.manage'));

const movementSchema = z.object({
  accountId: z.string().uuid(),
  date: z.string().optional(),
  description: z.string().min(2).max(240),
  reference: z.string().max(120).optional(),
  type: z.enum(['income', 'expense']),
  currency: z.string().min(3).max(4).optional(),
  amount: z.coerce.number().positive().max(999999999999)
});

const reconcileSchema = z.object({
  matched: z.boolean().default(true),
  ledgerEntryId: z.string().uuid().nullable().optional()
});

const context = (req: any) => req.context as { tenantId: string; userId?: string; ip?: string; userAgent?: string };
const serializeMovement = (movement: any) => ({
  ...movement,
  amount: Number(movement.credit || 0) > 0 ? Number(movement.credit) : Number(movement.debit || 0),
  type: Number(movement.credit || 0) > 0 ? 'income' : 'expense',
  reconciled: Boolean(movement.matched)
});

router.get('/summary', asyncHandler(async (req, res) => {
  const ctx = context(req);
  const [accounts, movements, pending] = await Promise.all([
    prisma.bankAccount.findMany({ where:{ tenantId:ctx.tenantId, active:true }, orderBy:{ bankName:'asc' } }),
    prisma.bankMovement.findMany({ where:{ tenantId:ctx.tenantId }, orderBy:[{ date:'desc' },{ createdAt:'desc' }], take:250 }),
    prisma.bankMovement.count({ where:{ tenantId:ctx.tenantId, matched:false } })
  ]);
  ok(res, {
    accounts: accounts.map((account) => ({ ...account, balance:Number(account.balance) })),
    movements: movements.map(serializeMovement),
    pending,
    reconciliationRate: movements.length ? Math.round(((movements.length - pending) / movements.length) * 100) : 100
  });
}));

router.get('/movements', asyncHandler(async (req, res) => {
  const ctx = context(req);
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || 'all');
  const accountId = String(req.query.accountId || '');
  const take = Math.min(Math.max(Number(req.query.take || 100), 1), 500);
  const rows = await prisma.bankMovement.findMany({
    where: {
      tenantId:ctx.tenantId,
      ...(accountId ? { accountId } : {}),
      ...(status === 'pending' ? { matched:false } : status === 'reconciled' ? { matched:true } : {}),
      ...(q ? { OR:[{ description:{ contains:q, mode:'insensitive' } },{ reference:{ contains:q, mode:'insensitive' } },{ account:{ bankName:{ contains:q, mode:'insensitive' } } }] } : {})
    },
    include:{ account:true },
    orderBy:[{ date:'desc' },{ createdAt:'desc' }],
    take
  });
  ok(res, rows.map(serializeMovement));
}));

router.post('/movements', validateBody(movementSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const input = req.body as z.infer<typeof movementSchema>;
  const account = await prisma.bankAccount.findFirst({ where:{ id:input.accountId, tenantId:ctx.tenantId, active:true } });
  if (!account) throw new HttpError(404, 'Cuenta bancaria no encontrada para el tenant activo.');
  if (input.currency && input.currency !== account.currency) throw new HttpError(409, 'La moneda del movimiento no coincide con la cuenta.');
  const delta = input.type === 'income' ? input.amount : -input.amount;
  const created = await prisma.$transaction(async (tx) => {
    const movement = await tx.bankMovement.create({
      data: {
        tenantId:ctx.tenantId,
        accountId:account.id,
        date:input.date ? new Date(input.date) : new Date(),
        description:input.description,
        reference:input.reference || null,
        debit:input.type === 'expense' ? input.amount : 0,
        credit:input.type === 'income' ? input.amount : 0,
        matched:false
      },
      include:{ account:true }
    });
    await tx.bankAccount.update({ where:{ id:account.id }, data:{ balance:{ increment:delta } } });
    return movement;
  });
  await writeAudit({ tenantId:ctx.tenantId, userId:ctx.userId, action:'banking.create-movement', entity:'BankMovement', entityId:created.id, after:serializeMovement(created), ipAddress:ctx.ip, userAgent:ctx.userAgent });
  ok(res, serializeMovement(created));
}));

router.patch('/movements/:id/reconcile', validateBody(reconcileSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const existing = await prisma.bankMovement.findFirst({ where:{ id:req.params.id, tenantId:ctx.tenantId } });
  if (!existing) throw new HttpError(404, 'Movimiento bancario no encontrado.');
  const updated = await prisma.bankMovement.update({
    where:{ id:existing.id },
    data:{ matched:req.body.matched, ledgerEntryId:req.body.ledgerEntryId ?? existing.ledgerEntryId },
    include:{ account:true }
  });
  await writeAudit({ tenantId:ctx.tenantId, userId:ctx.userId, action:req.body.matched ? 'banking.reconcile' : 'banking.unreconcile', entity:'BankMovement', entityId:updated.id, before:serializeMovement(existing), after:serializeMovement(updated), ipAddress:ctx.ip, userAgent:ctx.userAgent });
  ok(res, serializeMovement(updated));
}));

router.delete('/movements/:id', asyncHandler(async (req, res) => {
  const ctx = context(req);
  const existing = await prisma.bankMovement.findFirst({ where:{ id:req.params.id, tenantId:ctx.tenantId } });
  if (!existing) throw new HttpError(404, 'Movimiento bancario no encontrado.');
  if (existing.matched) throw new HttpError(409, 'Desconcilia el movimiento antes de eliminarlo.');
  const delta = Number(existing.credit || 0) - Number(existing.debit || 0);
  await prisma.$transaction([
    prisma.bankMovement.delete({ where:{ id:existing.id } }),
    prisma.bankAccount.update({ where:{ id:existing.accountId }, data:{ balance:{ decrement:delta } } })
  ]);
  await writeAudit({ tenantId:ctx.tenantId, userId:ctx.userId, action:'banking.delete-movement', entity:'BankMovement', entityId:existing.id, before:serializeMovement(existing), ipAddress:ctx.ip, userAgent:ctx.userAgent });
  ok(res, { deleted:true, id:existing.id });
}));

export default router;
