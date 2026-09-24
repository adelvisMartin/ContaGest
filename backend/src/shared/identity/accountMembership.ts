import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { HttpError } from '../http.js';
import { assertSubscriptionAccess } from '../commercial/subscriptionGuard.js';
import { hasPlatformAccess, PLATFORM_TENANT_RIF } from './platformAccess.js';

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
  linkSource?:string|null;
  accountStatus?:string|null;
};

type LicenseExtensionRow = {
  businessCategory:string|null;
  maxUsers:number|null;
  maxDevices:number|null;
  activationCount:number|null;
  subscriptionId:string|null;
};

function normalizeLicenseModules(value:unknown){
  if(Array.isArray(value))return{enabled:value.map(String),businessSector:'general',commercialUse:'operacion'};
  const data=value&&typeof value==='object'?value as Record<string,unknown>:{};
  return{
    enabled:Array.isArray(data.enabled)?data.enabled.map(String):[],
    businessSector:String(data.businessSector||'general'),
    commercialUse:String(data.commercialUse||'operacion')
  };
}

type IdentityDb = typeof prisma | Prisma.TransactionClient;

export async function membershipForProfile(userProfileId:string,db:IdentityDb=prisma) {
  const rows = await db.$queryRaw<MembershipRow[]>`
    SELECT tm."id",tm."accountUserId",tm."tenantId",tm."userProfileId",tm."roleLabel",tm."status",tm."isDefault",
           tm."linkSource",au."status" AS "accountStatus"
    FROM public."TenantMembership" tm
    JOIN public."AccountUser" au ON au."id"=tm."accountUserId"
    WHERE tm."userProfileId"=${userProfileId}
    LIMIT 1
  `;
  return rows[0] || null;
}

export async function ensureAccountMembership(input: MembershipIdentityInput,db:IdentityDb=prisma) {
  const email = input.email.trim().toLowerCase();
  if (!email) throw new HttpError(422, 'La membresía requiere un correo válido.');

  const existing=await membershipForProfile(input.userProfileId,db);
  if(existing){
    if(existing.accountStatus==='disabled')throw new HttpError(403,'La identidad global de esta cuenta está deshabilitada.');
    const rows=await db.$queryRaw<MembershipRow[]>`
      UPDATE public."TenantMembership"
      SET "roleLabel"=COALESCE(${input.roleLabel||null},"roleLabel"),"status"='active',"updatedAt"=now()
      WHERE "id"=${existing.id} AND "tenantId"=${input.tenantId}
      RETURNING "id","accountUserId","tenantId","userProfileId","roleLabel","status","isDefault","linkSource"
    `;
    await db.$executeRaw`
      UPDATE public."AccountUser" SET "fullName"=COALESCE(${input.fullName||null},"fullName"),"updatedAt"=now()
      WHERE "id"=${existing.accountUserId} AND "status"<>'disabled'
    `;
    return rows[0]||existing;
  }

  // Deliberately create a distinct AccountUser. Equal email text across tenants is NOT
  // sufficient proof that the profiles belong to the same human identity.
  const accountRows = await prisma.$queryRaw<Array<{ id:string }>>`
    INSERT INTO public."AccountUser" ("id","email","fullName","status","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text, ${email}, ${input.fullName || null}, 'active', now(), now())
    RETURNING "id"
  `;
  const accountUserId = accountRows[0]?.id;
  if (!accountUserId) throw new HttpError(500, 'No se pudo crear la identidad global del usuario.');

  const membershipRows = await db.$queryRaw<MembershipRow[]>`
    INSERT INTO public."TenantMembership"
      ("id","accountUserId","tenantId","userProfileId","roleLabel","status","isDefault","linkSource","linkedAt","createdAt","updatedAt")
    VALUES
      (gen_random_uuid()::text, ${accountUserId}, ${input.tenantId}, ${input.userProfileId}, ${input.roleLabel || null}, 'active', false, 'self', now(), now(), now())
    RETURNING "id","accountUserId","tenantId","userProfileId","roleLabel","status","isDefault","linkSource"
  `;
  return membershipRows[0];
}

export async function linkMembershipToAccount(input:{userProfileId:string;accountUserId:string;linkSource:'platform-subscription'|'platform-verified'}){
  const membership=await membershipForProfile(input.userProfileId);
  if(!membership)throw new HttpError(404,'La membresía que se desea vincular no existe.');
  const target=await prisma.$queryRaw<Array<{id:string;email:string;status:string}>>`
    SELECT "id","email","status" FROM public."AccountUser" WHERE "id"=${input.accountUserId} LIMIT 1
  `;
  const account=target[0];
  if(!account||account.status!=='active')throw new HttpError(409,'La identidad destino no está activa.');
  const profile=await prisma.userProfile.findUnique({where:{id:input.userProfileId},select:{email:true}});
  if(!profile||profile.email.trim().toLowerCase()!==account.email.trim().toLowerCase())throw new HttpError(409,'La vinculación explícita exige que el correo verificado coincida en ambas identidades.');
  const conflict=await prisma.$queryRaw<Array<{id:string}>>`
    SELECT "id" FROM public."TenantMembership"
    WHERE "accountUserId"=${account.id} AND "tenantId"=${membership.tenantId} AND "id"<>${membership.id}
    LIMIT 1
  `;
  if(conflict[0])throw new HttpError(409,'La identidad destino ya tiene otra membresía en esta empresa.');
  const rows=await prisma.$queryRaw<MembershipRow[]>`
    UPDATE public."TenantMembership"
    SET "accountUserId"=${account.id},"linkSource"=${input.linkSource},"linkedAt"=now(),"updatedAt"=now()
    WHERE "id"=${membership.id}
    RETURNING "id","accountUserId","tenantId","userProfileId","roleLabel","status","isDefault","linkSource"
  `;
  return rows[0];
}

export async function activeLicenseForProfile(userProfileId:string,tenantId:string){
  const record=await prisma.licenseKey.findFirst({
    where:{userId:userProfileId,tenantId,status:'active',expiresAt:{gt:new Date()}},
    orderBy:{createdAt:'desc'}
  });
  if(!record)return null;
  const config=normalizeLicenseModules(record.modules);
  const extension=await prisma.$queryRaw<LicenseExtensionRow[]>`
    SELECT "businessCategory","maxUsers","maxDevices","activationCount","subscriptionId"
    FROM public."LicenseKey" WHERE "id"=${record.id} LIMIT 1
  `;
  const extra:Partial<LicenseExtensionRow>=extension[0]||{};
  return{
    id:record.id,tenantId:record.tenantId,userId:record.userId,userEmail:record.userEmail,plan:record.plan,modules:config.enabled,
    businessSector:String(extra.businessCategory||config.businessSector||'general'),commercialUse:config.commercialUse,
    maxUsers:Number(extra.maxUsers||1),maxDevices:Number(extra.maxDevices||1),devicesUsed:Number(extra.activationCount||0),
    subscriptionId:extra.subscriptionId||null,status:record.status,expiresAt:record.expiresAt.toISOString(),
    lastSeenAt:record.lastSeenAt?.toISOString()||null,lastRoute:record.lastRoute||null
  };
}

export async function listAccessibleTenants(userProfileId:string) {
  let membership = await membershipForProfile(userProfileId);
  if (!membership) {
    const profile = await prisma.userProfile.findUnique({where:{ id:userProfileId },select:{ id:true, tenantId:true, email:true, fullName:true }});
    if (!profile) return [];
    membership = await ensureAccountMembership({tenantId:profile.tenantId,userProfileId:profile.id,email:profile.email,fullName:profile.fullName});
  }
  if(membership.accountStatus==='disabled')return [];

  const rows = await prisma.$queryRaw<Array<{
    membershipId:string;tenantId:string;userProfileId:string;roleLabel:string|null;status:string;rif:string;name:string;legalName:string|null;
    tenantStatus:string;hasPlatformPermission:boolean;licenseStatus:string|null;licenseExpiresAt:Date|null;subscriptionId:string|null;
  }>>`
    SELECT tm."id" AS "membershipId", tm."tenantId", tm."userProfileId", tm."roleLabel", tm."status",
           t."rif", t."name", t."legalName", t."status"::text AS "tenantStatus",
           EXISTS (
             SELECT 1 FROM public."UserRole" ur
             JOIN public."Role" r ON r."id"=ur."roleId" AND r."tenantId"=tm."tenantId" AND r."scope"='platform'
             JOIN public."RolePermission" rp ON rp."roleId"=r."id"
             JOIN public."Permission" p ON p."id"=rp."permissionId" AND p."key"='platform.manage'
             WHERE ur."userId"=tm."userProfileId" AND t."rif"=${PLATFORM_TENANT_RIF}
           ) AS "hasPlatformPermission",
           lk."status" AS "licenseStatus", lk."expiresAt" AS "licenseExpiresAt", lk."subscriptionId"
    FROM public."TenantMembership" tm
    JOIN public."Tenant" t ON t."id"=tm."tenantId"
    LEFT JOIN LATERAL (
      SELECT "status","expiresAt","subscriptionId" FROM public."LicenseKey"
      WHERE "tenantId"=tm."tenantId" AND "userId"=tm."userProfileId"
      ORDER BY "createdAt" DESC LIMIT 1
    ) lk ON true
    WHERE tm."accountUserId"=${membership.accountUserId} AND tm."status"='active' AND t."status"::text IN ('active','trial')
    ORDER BY tm."isDefault" DESC, t."name" ASC
  `;

  const now=Date.now();const allowed=[];
  for(const row of rows){
    if(!row.hasPlatformPermission){
      if(row.licenseStatus!=='active'||!row.licenseExpiresAt||new Date(row.licenseExpiresAt).getTime()<=now)continue;
      try{await assertSubscriptionAccess(row.subscriptionId||null,row.tenantId);}catch{continue;}
    }
    allowed.push({membershipId:row.membershipId,tenantId:row.tenantId,userProfileId:row.userProfileId,rif:row.rif,name:row.name,legalName:row.legalName,roleLabel:row.roleLabel,subscriptionId:row.subscriptionId||null,access:row.hasPlatformPermission?'platform':'licensed-client'});
  }
  return allowed;
}

export async function resolveTenantSwitch(currentUserProfileId:string, targetTenantId:string) {
  const source=await membershipForProfile(currentUserProfileId);
  if(!source||source.accountStatus==='disabled')throw new HttpError(403,'La cuenta actual no tiene una identidad multiempresa activa.');
  const rows=await prisma.$queryRaw<Array<{membershipId:string;userProfileId:string;tenantId:string;email:string;fullName:string;profileStatus:string}>>`
    SELECT tm."id" AS "membershipId",tm."userProfileId",tm."tenantId",up."email",up."fullName",up."status"::text AS "profileStatus"
    FROM public."TenantMembership" tm
    JOIN public."UserProfile" up ON up."id"=tm."userProfileId" AND up."tenantId"=tm."tenantId"
    WHERE tm."accountUserId"=${source.accountUserId} AND tm."tenantId"=${targetTenantId} AND tm."status"='active' AND up."status"::text='active'
    LIMIT 1
  `;
  const target=rows[0];
  if(!target)throw new HttpError(403,'La cuenta no tiene membresía activa en la empresa solicitada.');
  if(!await hasPlatformAccess({userId:target.userProfileId,tenantId:target.tenantId})){
    const license=await activeLicenseForProfile(target.userProfileId,target.tenantId);
    if(!license)throw new HttpError(403,'La empresa solicitada no está cubierta por una licencia activa para esta cuenta.');
    await assertSubscriptionAccess(license.subscriptionId||null,target.tenantId);
  }
  return target;
}
