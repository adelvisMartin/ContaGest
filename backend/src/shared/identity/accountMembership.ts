import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { runWithRuntimeTenant } from '../../database/runtime-tenant-context.js';
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

type AccessibleTenantIdentityRow = {
  membershipId:string;
  tenantId:string;
  userProfileId:string;
  roleLabel:string|null;
  rif:string;
  name:string;
  legalName:string|null;
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
  const accountRows = await db.$queryRaw<Array<{ id:string }>>`
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

  const rows=await prisma.$queryRaw<AccessibleTenantIdentityRow[]>`
    SELECT * FROM private.contagest_runtime_list_accessible_tenants(${userProfileId})
  `;

  const allowed=[];
  for(const row of rows){
    const access=await runWithRuntimeTenant(row.tenantId,async()=>{
      if(await hasPlatformAccess({userId:row.userProfileId,tenantId:row.tenantId})){
        return{kind:'platform' as const,subscriptionId:null};
      }
      const license=await activeLicenseForProfile(row.userProfileId,row.tenantId);
      if(!license)return null;
      try{await assertSubscriptionAccess(license.subscriptionId||null,row.tenantId);}catch{return null;}
      return{kind:'licensed-client' as const,subscriptionId:license.subscriptionId||null};
    });
    if(!access)continue;
    allowed.push({
      membershipId:row.membershipId,
      tenantId:row.tenantId,
      userProfileId:row.userProfileId,
      rif:row.rif,
      name:row.name,
      legalName:row.legalName,
      roleLabel:row.roleLabel,
      subscriptionId:access.subscriptionId,
      access:access.kind
    });
  }
  return allowed;
}

export async function resolveTenantSwitch(currentUserProfileId:string, targetTenantId:string) {
  const rows=await prisma.$queryRaw<Array<{membershipId:string;userProfileId:string;tenantId:string;email:string;fullName:string}>>`
    SELECT * FROM private.contagest_runtime_resolve_tenant_switch(${currentUserProfileId},${targetTenantId})
  `;
  const target=rows[0];
  if(!target)throw new HttpError(403,'La cuenta no tiene membresía activa en la empresa solicitada.');

  await runWithRuntimeTenant(target.tenantId,async()=>{
    if(await hasPlatformAccess({userId:target.userProfileId,tenantId:target.tenantId}))return;
    const license=await activeLicenseForProfile(target.userProfileId,target.tenantId);
    if(!license)throw new HttpError(403,'La empresa solicitada no está cubierta por una licencia activa para esta cuenta.');
    await assertSubscriptionAccess(license.subscriptionId||null,target.tenantId);
  });
  return target;
}
