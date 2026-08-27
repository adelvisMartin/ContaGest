import { prisma } from '../../database/prisma.js';

export const PLATFORM_PERMISSION_KEY = 'platform.manage';
export const PLATFORM_ROLE_SCOPE = 'platform';
export const PLATFORM_TENANT_RIF = '00000000';

export type PlatformIdentity = {
  userId?: string | null;
  tenantId?: string | null;
};

/**
 * Platform authority is intentionally stricter than a permission lookup.
 * A platform operator must be assigned through a platform-scoped role that
 * belongs to ContaGest's internal tenant and explicitly carries platform.manage.
 * Role.system is metadata only and is never an authorization signal.
 */
export async function hasPlatformAccess(identity: PlatformIdentity): Promise<boolean> {
  if (!identity.userId || !identity.tenantId) return false;

  const assignment = await prisma.userRole.findFirst({
    where: {
      userId: identity.userId,
      role: {
        tenantId: identity.tenantId,
        scope: PLATFORM_ROLE_SCOPE,
        tenant: { rif: PLATFORM_TENANT_RIF },
        permissions: { some: { permission: { key: PLATFORM_PERMISSION_KEY } } }
      }
    },
    select: { userId: true }
  });

  return Boolean(assignment);
}

export function isPlatformUserSnapshot(user: any, tenantRif?: string | null): boolean {
  if (String(tenantRif || '').trim().toUpperCase() !== PLATFORM_TENANT_RIF) return false;
  const assignments = Array.isArray(user?.userRoles) ? user.userRoles : [];
  return assignments.some((assignment: any) => {
    const role = assignment?.role;
    if (role?.scope !== PLATFORM_ROLE_SCOPE) return false;
    const permissions = Array.isArray(role?.permissions) ? role.permissions : [];
    return permissions.some((item: any) => item?.permission?.key === PLATFORM_PERMISSION_KEY);
  });
}

export function isPlatformPermission(permission: string): boolean {
  return String(permission || '').startsWith('platform.');
}
