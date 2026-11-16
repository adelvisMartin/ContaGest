import type { Prisma } from '@prisma/client';

/** Additive seed only: persisted tenant chart accounts are never template-owned. */
export type StarterChartAccount = Readonly<{
  code: string; name: string; type: string; nature: 'debit' | 'credit';
  level: number; parentCode?: string | null; allowPosting: boolean;
  description?: string | null;
}>;

/** Called inside the caller's transaction so audit and insert succeed together. */
export async function syncStarterChartAccounts(
  tx: Pick<Prisma.TransactionClient, 'chartAccount' | 'auditLog'>,
  template: readonly StarterChartAccount[],
  context: Readonly<{ tenantId: string; userId: string; ip?: string; userAgent?: string }>,
) {
  if (!context?.tenantId || !context.userId ||
      typeof context.tenantId !== 'string' || typeof context.userId !== 'string' ||
      !Array.isArray(template)) {
    throw new Error('CHART_TEMPLATE_ACTOR_REQUIRED');
  }

  // PostgreSQL ON CONFLICT DO NOTHING protects custom names, nature, hierarchy,
  // posting status and account-to-role bindings on re-sync or concurrent retry.
  const inserted = await tx.chartAccount.createMany({
    data: template.map(account => ({ ...account, tenantId: context.tenantId })),
    skipDuplicates: true,
  });
  if (!Number.isSafeInteger(inserted.count) || inserted.count < 0 || inserted.count > template.length) {
    throw new Error('CHART_TEMPLATE_INSERT_COUNT_INVALID');
  }
  const outcome = Object.freeze({
    ok: true, synced: template.length,
    created: inserted.count, unchanged: template.length - inserted.count,
  });
  await tx.auditLog.create({
    data: {
      tenantId: context.tenantId, userId: context.userId,
      entity: 'ChartAccount', entityId: 'starter-template',
      action: 'accounting.chart_template.synced',
      after: { templateCount: outcome.synced, created: outcome.created, unchanged: outcome.unchanged },
      ipAddress: context.ip || null, userAgent: context.userAgent || null,
    },
  });
  return outcome;
}
