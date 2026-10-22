import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { HttpError } from '../../shared/http.js';
import { prepareTaxpayerProfileDraft, type TaxpayerProfileDraftInput } from './taxpayer-profile-policy.js';
import { assertProfileReview, assertProfileActivation, resolveActiveTaxpayerProfile } from './taxpayer-profile-activation-policy.js';

type TaxpayerProfileRow = {
  id:string; tenantId:string; version:number; rifSnapshot:string; effectiveFrom:Date;
  effectiveTo:Date|null; jurisdiction:string; taxpayerCategory:string;
  activityCodes:unknown; sourceReference:string; sourceContentSha256:string;
  capturedAt:Date; status:'DRAFT'|'REVIEWED'|'ACTIVE'; createdBy:string; createdAt:Date;
  legalSourceId:string|null; reviewedBy:string|null; activatedBy:string|null;
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

/** Resolve only the one reviewed effective profile for the authenticated tenant. */
export async function getEffectiveTaxpayerProfile(
  tx: Pick<Prisma.TransactionClient, '$queryRaw' | 'tenant'>,
  tenantId: string,
  at: Date,
) {
  const tenant = await tx.tenant.findUnique({where:{id:tenantId},select:{rif:true}});
  if (!tenant) throw new HttpError(404, 'Empresa no encontrada.', {code:'TAXPAYER_TENANT_NOT_FOUND'});
  const profiles = await tx.$queryRaw<TaxpayerProfileRow[]>(Prisma.sql`
    SELECT * FROM public."TaxpayerProfileVersion"
    WHERE "tenantId"=${tenantId} AND "status"='ACTIVE'
      AND "effectiveFrom"<=${at}
      AND ("effectiveTo" IS NULL OR "effectiveTo">${at})
  `);
  try {return resolveActiveTaxpayerProfile(profiles,{tenantId,rif:tenant.rif,at});}
  catch {throw new HttpError(422,'No existe un único perfil tributario ACTIVE y verificable para esta empresa y fecha.',{code:'TAXPAYER_PROFILE_NOT_ACTIVE'});}
}

/** Atomic, logged, per-tenant human review and distinct third-party activation. */
export async function transitionTaxpayerProfile(input:{
  tenantId:string; profileId:string; actorId:string; action:'REVIEW'|'ACTIVATE'; reason:string;
}) {
  return prisma.$transaction(async tx=>{
    const rows=await tx.$queryRaw<TaxpayerProfileRow[]>(Prisma.sql`
      SELECT * FROM public."TaxpayerProfileVersion"
      WHERE "tenantId"=${input.tenantId} AND "id"=${input.profileId}::uuid FOR UPDATE
    `);
    const profile=rows[0];
    if(!profile)throw new HttpError(404,'Perfil tributario no encontrado.',{code:'TAXPAYER_PROFILE_NOT_FOUND'});
    const tenant=await tx.tenant.findUnique({where:{id:input.tenantId},select:{rif:true}});
    if(!tenant||tenant.rif!==profile.rifSnapshot)throw new HttpError(409,'El RIF de la empresa cambió desde la captura.',{code:'TAXPAYER_PROFILE_RIF_MISMATCH'});
    try {
      if(input.action==='REVIEW') assertProfileReview(profile,input.actorId);
      else assertProfileActivation(profile,input.actorId);
    } catch {
      throw new HttpError(409,'La revisión requiere actores independientes y estado permitido.',{code:'TAXPAYER_PROFILE_REVIEW_DENIED'});
    }
    const source=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`
      SELECT "id" FROM public."FiscalLegalSource"
      WHERE "tenantId"=${input.tenantId} AND "status"='REVIEWED'
        AND "reference"=${profile.sourceReference}
        AND "contentSha256"=${profile.sourceContentSha256}
      ORDER BY "reviewedAt" DESC LIMIT 2 FOR SHARE
    `);
    if(source.length!==1 || (profile.legalSourceId && profile.legalSourceId!==source[0].id)) {
      throw new HttpError(422,'Perfil sin fuente legal revisada única con hash coincidente.',{code:'TAXPAYER_PROFILE_SOURCE_MISSING'});
    }
    const updated=input.action==='REVIEW'
    ?await tx.$queryRaw<TaxpayerProfileRow[]>(Prisma.sql`
       UPDATE public."TaxpayerProfileVersion"
       SET "status"='REVIEWED',"legalSourceId"=${source[0].id}::uuid,
           "reviewedBy"=${input.actorId},"reviewedAt"=now()
       WHERE "tenantId"=${input.tenantId} AND "id"=${profile.id}::uuid AND "status"='DRAFT'
       RETURNING *
     `)
    :await tx.$queryRaw<TaxpayerProfileRow[]>(Prisma.sql`
       UPDATE public."TaxpayerProfileVersion"
       SET "status"='ACTIVE',"activatedBy"=${input.actorId},"activatedAt"=now()
       WHERE "tenantId"=${input.tenantId} AND "id"=${profile.id}::uuid AND "status"='REVIEWED'
       RETURNING *
     `);
    if(!updated[0])throw new HttpError(409,'El estado fue modificado concurrentemente.',{code:'TAXPAYER_PROFILE_TRANSITION_CONFLICT'});
    await tx.auditLog.create({data:{
      tenantId:input.tenantId,userId:input.actorId,entity:'TaxpayerProfileVersion',entityId:profile.id,
      action:input.action==='REVIEW'?'taxpayer.profile.reviewed':'taxpayer.profile.activated',
      before:{status:profile.status,version:profile.version},
      after:{status:updated[0].status,sourceId:source[0].id,sourceContentSha256:profile.sourceContentSha256,reason:input.reason}
    }});
    return updated[0];
  });
}
