import { prisma } from './prisma.js';

export type LoginBootstrapIdentity = {
  tenantId: string;
  userProfileId: string;
  passwordHash: string | null;
  userStatus: string;
  accessExpiresAt: Date | null;
};

export type SupabaseBootstrapIdentity = {
  tenantId: string;
  userProfileId: string;
};

export type RegistrationBootstrapInput = {
  tenantRif: string;
  tenantName: string;
  legalName?: string | null;
  plan: string;
  email: string;
  fullName: string;
  passwordHash: string;
};

export type RegistrationBootstrapResult = {
  tenantId: string;
  userProfileId: string;
};

type LoginBootstrapRow = {
  tenant_id: string;
  user_profile_id: string;
  password_hash: string | null;
  user_status: string;
  access_expires_at: Date | null;
};

type IdentityBootstrapRow = {
  tenant_id: string;
  user_profile_id: string;
};

type BootstrapDb = Pick<typeof prisma, '$queryRaw'>;

export async function resolveLoginBootstrapIdentity(
  tenantRif: string,
  email: string,
  db: BootstrapDb = prisma
): Promise<LoginBootstrapIdentity | null> {
  const rows = await db.$queryRaw<LoginBootstrapRow[]>`
    SELECT "tenant_id", "user_profile_id", "password_hash", "user_status", "access_expires_at"
    FROM private.contagest_bootstrap_login_identity(${tenantRif}, ${email})
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    tenantId: row.tenant_id,
    userProfileId: row.user_profile_id,
    passwordHash: row.password_hash,
    userStatus: row.user_status,
    accessExpiresAt: row.access_expires_at
  };
}

export async function resolveSupabaseBootstrapIdentity(
  authUserId: string,
  db: BootstrapDb = prisma
): Promise<SupabaseBootstrapIdentity | null> {
  const rows = await db.$queryRaw<IdentityBootstrapRow[]>`
    SELECT "tenant_id", "user_profile_id"
    FROM private.contagest_bootstrap_supabase_identity(${authUserId})
  `;
  const row = rows[0];
  return row ? { tenantId: row.tenant_id, userProfileId: row.user_profile_id } : null;
}

export async function registerTenantBootstrap(
  input: RegistrationBootstrapInput,
  db: BootstrapDb = prisma
): Promise<RegistrationBootstrapResult> {
  const rows = await db.$queryRaw<IdentityBootstrapRow[]>`
    SELECT "tenant_id", "user_profile_id"
    FROM private.contagest_bootstrap_register_tenant(
      ${input.tenantRif},
      ${input.tenantName},
      ${input.legalName || input.tenantName},
      ${input.plan},
      ${input.email},
      ${input.fullName},
      ${input.passwordHash}
    )
  `;
  const row = rows[0];
  if (!row) throw new Error('CONTAGEST_BOOTSTRAP_REGISTRATION_EMPTY');
  return { tenantId: row.tenant_id, userProfileId: row.user_profile_id };
}

export function isBootstrapRegistrationConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { message?: unknown; meta?: { message?: unknown; code?: unknown } };
  return [candidate.message, candidate.meta?.message, candidate.meta?.code]
    .filter((value) => value !== undefined && value !== null)
    .map(String)
    .some((value) => value.includes('CONTAGEST_BOOTSTRAP_REGISTRATION_CONFLICT'));
}
