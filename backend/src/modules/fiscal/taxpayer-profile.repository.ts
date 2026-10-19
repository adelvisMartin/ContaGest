import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { HttpError } from '../../shared/http.js';
import { prepareTaxpayerProfileDraft, type TaxpayerProfileDraftInput } from './taxpayer-profile-policy.js';

type TaxpayerProfileRow = {
  id:string; tenantId:string; version:number; rifSnapshot:string; effectiveFrom:Date;
  effectiveTo:Date|null; jurisdiction:string; taxpayerCategory:string;
  activityCodes:unknown; sourceReference:string; sourceContentSha256:string;
  capturedAt:Date; status:'DRAFT'; createdBy:string; createdAt:Date;
};

export async function listTaxpayerProfileDrafts(tenantId:string){
  return prisma.$queryRaw<TaxpayerProfileRow[]>(Prisma.sql`
    SELECT * FROM public."TaxpayerProfileVersion"
    WHERE "tenantId"=${tenantId} ORDER BY "version" DESC LIMIT 100
  `);
}
export async function captureTaxpayerProfileDraft(
  input:TaxpayerProfileDraftInput,context:{tenantId:string;userId:string;ip?:string;userAgent?:string}
){
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${'tax-profile:'+context.tenantId},774)) AS "locked"
    `);
    const tenant=await tx.tenant.findUnique({where:{id:context.tenantId},select:{id:true,rif:true}});
    if(!tenant)throw new HttpError(404,'Empresa no encontrada.',{code:'TAXPAYER_TENANT_NOT_FOUND'});
    const draft=prepareTaxpayerProfileDraft(input,{tenantId:tenant.id,userId:context.userId,tenantRif:tenant.rif});
    const rows=await tx.$queryRaw<Array<{nextVersion:number}>>(Prisma.sql`
      SELECT (COALESCE(MAX("version"),0)+1)::int AS "nextVersion"
      FROM public."TaxpayerProfileVersion" WHERE "tenantId"=${tenant.id}
    `);
    const v=rows[0]?.nextVersion;
    if(!v||v<1)throw new HttpError(409,'No es posible versionar el perfil tributario.');
    const records=await tx.$queryRaw<TaxpayerProfileRow[]>(Prisma.sql`
      INSERT INTO public."TaxpayerProfileVersion" (
        "tenantId","version","rifSnapshot","effectiveFrom","effectiveTo","jurisdiction",
        "taxpayerCategory","activityCodes","sourceReference","sourceContentSha256",
        "capturedAt","status","createdBy"
      ) VALUES (
        ${draft.tenantId},${v},${draft.rifSnapshot},${new Date(draft.effectiveFrom)},
        ${draft.effectiveTo?new Date(draft.effectiveTo):null},${draft.jurisdiction},
        ${draft.taxpayerCategory},${JSON.stringify(draft.activityCodes)}::jsonb,
        ${draft.sourceReference},${draft.sourceContentSha256},${new Date(draft.capturedAt)},
        ${draft.status},${draft.createdBy}
      ) RETURNING *
    `);
    const record=records[0];
    await tx.auditLog.create({data:{
      tenantId:tenant.id,userId:context.userId,entity:'TaxpayerProfileVersion',
      entityId:record.id,action:'taxpayer.profile.draft_captured',
      after:{version:record.version,rifSnapshot:record.rifSnapshot,status:record.status,sourceContentSha256:record.sourceContentSha256},
      ipAddress:context.ip||null,userAgent:context.userAgent||null
    }});
    return record;
  });
}
