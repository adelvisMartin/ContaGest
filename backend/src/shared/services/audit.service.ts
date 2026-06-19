import { prisma } from '../../database/prisma.js';

export async function writeAudit(input: { tenantId?: string; userId?: string; action: string; entity: string; entityId?: string; before?: unknown; after?: unknown; ipAddress?: string; userAgent?: string }) {
  if (!input.tenantId) return null;
  return prisma.auditLog.create({
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
  }).catch(() => null);
}
