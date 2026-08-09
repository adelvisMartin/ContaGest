import { prisma } from '../../database/prisma.js';
import { HttpError } from '../http.js';

export type MembershipIdentityInput = {
  tenantId:string;
  userProfileId:string;
  email:string;
  fullName?:string|null;
  roleLabel?:string|null;
};

type MembershipRow = {
  id:string;
  accountUserId:string;
  tenantId:string;
  userProfileId:string;
  roleLabel:string|null;
  status:string;
  isDefault:boolean;
};

export async function ensureAccountMembership(input: MembershipIdentityInput) {
  const email = input.email.trim().toLowerCase();
  if (!email) throw new HttpError(422, 'La membresía requiere un correo válido.');

  const accountRows = await prisma.$queryRaw<Array<{ id:string }>>`
    INSERT INTO public."AccountUser" ("id","email","fullName","status","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text, ${email}, ${input.fullName || null}, 'active', now(), now())
    ON CONFLICT ("email") DO UPDATE SET
      "fullName"=COALESCE(EXCLUDED."fullName", public."AccountUser"."fullName"),
      "status"=CASE WHEN public."AccountUser"."status"='disabled' THEN public."AccountUser"."status" ELSE 'active' END,
      "updatedAt"=now()
    RETURNING "id"
  `;
  const accountUserId = accountRows[0]?.id;
  if (!accountUserId) throw new HttpError(500, 'No se pudo resolver la identidad global del usuario.');

  const membershipRows = await prisma.$queryRaw<MembershipRow[]>`
    INSERT INTO public."TenantMembership"
      ("id","accountUserId","tenantId","userProfileId","roleLabel","status","isDefault","createdAt","updatedAt")
    VALUES
      (gen_random_uuid()::text, ${accountUserId}, ${input.tenantId}, ${input.userProfileId}, ${input.roleLabel || null}, 'active', false, now(), now())
    ON CONFLICT ("accountUserId","tenantId") DO UPDATE SET
      "userProfileId"=EXCLUDED."userProfileId",
      "roleLabel"=COALESCE(EXCLUDED."roleLabel", public."TenantMembership"."roleLabel"),
      "status"='active',
      "updatedAt"=now()
    RETURNING "id","accountUserId","tenantId","userProfileId","roleLabel","status","isDefault"
  `;
  return membershipRows[0];
}

export async function membershipForProfile(userProfileId:string) {
  const rows = await prisma.$queryRaw<MembershipRow[]>`
    SELECT "id","accountUserId","tenantId","userProfileId","roleLabel","status","isDefault"
    FROM public."TenantMembership"
    WHERE "userProfileId"=${userProfileId}
    LIMIT 1
  `;
  return rows[0] || null;
}

export async function listAccessibleTenants(userProfileId:string) {
  let membership = await membershipForProfile(userProfileId);
  if (!membership) {
    const profile = await prisma.userProfile.findUnique({
      where:{ id:userProfileId },
      select:{ id:true, tenantId:true, email:true, fullName:true }
    });
    if (!profile) return [];
    membership = await ensureAccountMembership({
      tenantId:profile.tenantId,
      userProfileId:profile.id,
      email:profile.email,
      fullName:profile.fullName
    });
  }

  const rows = await prisma.$queryRaw<Array<{
    membershipId:string;
    tenantId:string;
    userProfileId:string;
    roleLabel:string|null;
    status:string;
    rif:string;
    name:string;
    legalName:string|null;
    tenantStatus:string;
    hasSystemRole:boolean;
    licenseStatus:string|null;
    licenseExpiresAt:Date|null;
    subscriptionId:string|null;
  }>>`
    SELECT tm."id" AS "membershipId", tm."tenantId", tm."userProfileId", tm."roleLabel", tm."status",
           t."rif", t."name", t."legalName", t."status"::text AS "tenantStatus",
           EXISTS (
             SELECT 1 FROM public."UserRole" ur
             JOIN public."Role" r ON r."id"=ur."roleId"
             WHERE ur."userId"=tm."userProfileId" AND r."tenantId"=tm."tenantId" AND r."system"=true
           ) AS "hasSystemRole",
           lk."status" AS "licenseStatus", lk."expiresAt" AS "licenseExpiresAt", lk."subscriptionId"
    FROM public."TenantMembership" tm
    JOIN public."Tenant" t ON t."id"=tm."tenantId"
    LEFT JOIN LATERAL (
      SELECT "status","expiresAt","subscriptionId"
      FROM public."LicenseKey"
      WHERE "tenantId"=tm."tenantId" AND "userId"=tm."userProfileId"
      ORDER BY "createdAt" DESC
      LIMIT 1
    ) lk ON true
    WHERE tm."accountUserId"=${membership.accountUserId}
      AND tm."status"='active'
      AND t."status"::text IN ('active','trial')
    ORDER BY tm."isDefault" DESC, t."name" ASC
  `;

  const now = Date.now();
  return rows.filter((row) => {
    if (row.hasSystemRole) return true;
    return row.licenseStatus === 'active'
      && Boolean(row.licenseExpiresAt)
      && new Date(row.licenseExpiresAt as Date).getTime() > now;
  }).map((row) => ({
    membershipId:row.membershipId,
    tenantId:row.tenantId,
    userProfileId:row.userProfileId,
    rif:row.rif,
    name:row.name,
    legalName:row.legalName,
    roleLabel:row.roleLabel,
    subscriptionId:row.subscriptionId || null,
    access:row.hasSystemRole ? 'staff' : 'licensed-client'
  }));
}

export async function resolveTenantSwitch(currentUserProfileId:string, targetTenantId:string) {
  const source = await membershipForProfile(currentUserProfileId);
  if (!source) throw new HttpError(403, 'La cuenta actual no tiene identidad multiempresa habilitada.');

  const rows = await prisma.$queryRaw<Array<{
    membershipId:string;
    userProfileId:string;
    tenantId:string;
    email:string;
    fullName:string;
    profileStatus:string;
  }>>`
    SELECT tm."id" AS "membershipId", tm."userProfileId", tm."tenantId",
           up."email", up."fullName", up."status"::text AS "profileStatus"
    FROM public."TenantMembership" tm
    JOIN public."UserProfile" up ON up."id"=tm."userProfileId" AND up."tenantId"=tm."tenantId"
    WHERE tm."accountUserId"=${source.accountUserId}
      AND tm."tenantId"=${targetTenantId}
      AND tm."status"='active'
      AND up."status"::text='active'
    LIMIT 1
  `;
  const target = rows[0];
  if (!target) throw new HttpError(403, 'La cuenta no tiene membresía activa en la empresa solicitada.');

  const systemRole = await prisma.userRole.count({ where:{ userId:target.userProfileId, role:{ tenantId:target.tenantId, system:true } } });
  if (!systemRole) {
    const license = await prisma.licenseKey.findFirst({
      where:{ tenantId:target.tenantId, userId:target.userProfileId, status:'active', expiresAt:{ gt:new Date() } },
      select:{ id:true }
    });
    if (!license) throw new HttpError(403, 'La empresa solicitada no está cubierta por una licencia activa para esta cuenta.');
  }

  return target;
}
