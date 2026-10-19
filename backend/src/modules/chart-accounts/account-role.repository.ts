import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { HttpError } from '../../shared/http.js';
import { assertSemanticAccountBinding, type SemanticAccountRole } from './account-role-policy.js';
import { assertSemanticPostingRoles, type SemanticPostingAccount } from './semantic-posting-policy.js';

type AccountRoleRow = { tenantId: string; role: string; accountCode: string; nature: string; createdBy: string; createdAt: Date };

/** Resolve a complete posting template from the *same transaction* as the
 * originating document. No fallback to hardcoded chart-account codes. */
export async function resolveSemanticPostingAccounts(
  tx: Pick<Prisma.TransactionClient, '$queryRaw'>,
  tenantId: string,
  roles: readonly SemanticAccountRole[],
) {
  const rows = await tx.$queryRaw<SemanticPostingAccount[]>(Prisma.sql`
    SELECT m."tenantId", m."role", m."accountCode", a."name", a."nature",
           a."active", a."allowPosting", a."parentCode"
    FROM public."SemanticAccountRoleMapping" m
    JOIN public."ChartAccount" a
      ON a."tenantId"=m."tenantId" AND a."code"=m."accountCode"
    WHERE m."tenantId"=${tenantId} AND m."role" IN (${Prisma.join(roles)})
  `);
  try { return assertSemanticPostingRoles(tenantId, roles, rows); }
  catch {
    const available = new Set(rows.map(row => row.role));
    throw new HttpError(422, 'Configura cuentas activas, postables y de naturaleza correcta para cada rol del asiento.', {
      code: 'ACCOUNT_ROLE_POSTING_NOT_READY',
      missingRoles: roles.filter(role => !available.has(role)),
      requestedRoles: roles
    });
  }
}

export async function listSemanticAccountRoles(tenantId: string) {
  return prisma.$queryRaw<AccountRoleRow[]>(Prisma.sql`
    SELECT m."tenantId", m."role", m."accountCode", a."nature", m."createdBy", m."createdAt"
    FROM public."SemanticAccountRoleMapping" m
    JOIN public."ChartAccount" a ON a."tenantId"=m."tenantId" AND a."code"=m."accountCode"
    WHERE m."tenantId"=${tenantId}
    ORDER BY m."role" ASC
  `);
}

export async function bindSemanticAccountRole(input: {
  tenantId: string; userId: string; role: SemanticAccountRole; accountCode: string;
  expectedNature?: 'debit' | 'credit'; ip?: string; userAgent?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const account = await tx.chartAccount.findFirst({
      where: { tenantId: input.tenantId, code: input.accountCode },
      select: { tenantId: true, code: true, active: true, allowPosting: true, nature: true, parentCode: true }
    });
    const binding = assertSemanticAccountBinding(account, { tenantId: input.tenantId, role: input.role, expectedNature: input.expectedNature });
    const rows = await tx.$queryRaw<AccountRoleRow[]>(Prisma.sql`
      INSERT INTO public."SemanticAccountRoleMapping" ("tenantId","role","accountCode","createdBy")
      VALUES (${binding.tenantId},${binding.role},${binding.accountCode},${input.userId})
      ON CONFLICT DO NOTHING RETURNING "tenantId","role","accountCode","createdBy","createdAt"
    `);
    if (!rows[0]) throw new HttpError(409, 'El rol semántico ya tiene una cuenta asociada.', { code: 'ACCOUNT_ROLE_ALREADY_MAPPED' });
    await tx.auditLog.create({
      data: { tenantId: input.tenantId, userId: input.userId, action: 'accounting.semantic_role.bound',
        entity: 'SemanticAccountRoleMapping', entityId: String(input.role),
        after: { role: binding.role, accountCode: binding.accountCode, nature: binding.nature },
        ipAddress: input.ip || null, userAgent: input.userAgent || null }
    });
    return { ...rows[0], nature: binding.nature };
  });
}
