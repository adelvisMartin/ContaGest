import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';

// Passing a transaction makes the audit write part of the same commit as the
// owning CRUD mutation. Legacy callers retain their existing best-effort policy.
export async function writeAudit(input: { tenantId?: string; userId?: string; action: string; entity: string; entityId?: string; before?: unknown; after?: unknown; ipAddress?: string; userAgent?: string }, tx?: Prisma.TransactionClient) {
  if (!input.tenantId) return null;
  const operation = (tx ?? prisma).auditLog.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      before: input.before as any,
      after: input.after as any,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    }
  });
  // A transactional write must fail closed so the enclosing mutation rolls back
  // rather than committing unlogged state; retain compatibility for other callers.
  return tx ? operation : operation.catch(() => null);
}
