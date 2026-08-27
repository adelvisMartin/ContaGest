import { prisma } from '../../database/prisma.js';

export const PLATFORM_PERMISSION_KEY = 'platform.manage';
export const PLATFORM_ROLE_SCOPE = 'platform';
export const PLATFORM_TENANT_RIF = '00000000';

export type PlatformIdentity = {
  userId?: string | null;
  tenantId?: string | null;
};

export function isPlatformPermission(permission: string): boolean {
  return String(permission || '').startsWith('platform.');
}

/**
 * Platform authority is intentionally stricter than a permission lookup.
 * A platform operator must be assigned through a platform-scoped role that
 * belongs to ContaGest's internal tenant and explicitly carries the requested
 * platform permission. Role.system is metadata only and is never an
 * authorization signal.
 *
 * The query is intentionally SQL until the historical Role.scope column is
 * represented by every generated Prisma client deployed in the fleet.
 */
export async function hasPlatformAccess(
  identity: PlatformIdentity,
  permission = PLATFORM_PERMISSION_KEY
): Promise<boolean> {
  if (!identity.userId || !identity.tenantId || !isPlatformPermission(permission)) return false;

  const rows = await prisma.$queryRaw<Array<{ allowed: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM public."UserRole" ur
      JOIN public."Role" r ON r."id" = ur."roleId"
      JOIN public."Tenant" t ON t."id" = r."tenantId"
      JOIN public."RolePermission" rp ON rp."roleId" = r."id"
      JOIN public."Permission" p ON p."id" = rp."permissionId"
      WHERE ur."userId" = ${identity.userId}
        AND r."tenantId" = ${identity.tenantId}
        AND r."scope" = ${PLATFORM_ROLE_SCOPE}
        AND t."rif" = ${PLATFORM_TENANT_RIF}
        AND p."key" = ${permission}
    ) AS "allowed"
  `;

  return rows[0]?.allowed === true;
}
