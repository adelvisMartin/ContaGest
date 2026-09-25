import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission } from '../../shared/middleware/context.js';
import { writeAudit } from '../../shared/services/audit.service.js';
import { ctx, one } from './verticals.shared.js';
import {
  veterinaryGuardianPortalGrantSchema
} from './veterinary.schemas.js';

const router = Router();
const sha256=(value:string)=>createHash('sha256').update(value).digest('hex');

router.get('/guardian-portal/grants', requirePermission('communications.manage'), asyncHandler(async (req,res)=>{
  const tenantId=ctx(req).tenantId;
  const patientId=String(req.query.patientId||'').trim();
  if(!patientId)throw new HttpError(422,'patientId es obligatorio.');
  const patientRows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id"
    FROM public."CarePatient"
    WHERE "tenantId"=$1 AND "id"=$2 AND "kind"='animal' AND "active"=true
    LIMIT 1
  `,tenantId,patientId);
  one(patientRows,'Mascota activa no encontrada.');
  const rows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id","patientId","scopes","expiresAt","revokedAt","createdBy","lastUsedAt","createdAt"
    FROM public."VeterinaryGuardianPortalGrant"
    WHERE "tenantId"=$1 AND "patientId"=$2
    ORDER BY "createdAt" DESC
    LIMIT 50
  `,tenantId,patientId);
  ok(res,rows);
}));

router.post('/guardian-portal/grants', requirePermission('communications.manage'), asyncHandler(async (req,res)=>{
  const tenantId=ctx(req).tenantId;
  const actorUserId=String(ctx(req).userId||'').trim();
  if(!actorUserId)throw new HttpError(401,'Crear acceso del tutor requiere un actor autenticado.');
  const body=veterinaryGuardianPortalGrantSchema.parse(req.body||{});
  const portalToken=randomBytes(32).toString('base64url');
  const tokenSha256=sha256(portalToken);
  const expiresAt=new Date(Date.now()+body.expiresInHours*60*60*1000).toISOString();

  const grant=await prisma.$transaction(async (tx)=>{
    const patientRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id","displayName","guardianName","guardianPhone","guardianEmail"
      FROM public."CarePatient"
      WHERE "tenantId"=$1 AND "id"=$2 AND "kind"='animal' AND "active"=true
      LIMIT 1
      FOR SHARE
    `,tenantId,body.patientId);
    const patient=one(patientRows,'Mascota activa no encontrada.');

    await tx.$executeRawUnsafe(`
      UPDATE public."VeterinaryGuardianPortalGrant"
      SET "revokedAt"=COALESCE("revokedAt",now())
      WHERE "tenantId"=$1 AND "patientId"=$2 AND "revokedAt" IS NULL
    `,tenantId,body.patientId);

    const rows=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."VeterinaryGuardianPortalGrant"
        ("id","tenantId","patientId","tokenSha256","scopes","expiresAt","createdBy","createdAt")
      VALUES
        (gen_random_uuid()::text,$1,$2,$3,$4::jsonb,$5::timestamptz,$6,now())
      RETURNING "id","patientId","scopes","expiresAt","revokedAt","createdBy","lastUsedAt","createdAt"
    `,tenantId,body.patientId,tokenSha256,JSON.stringify([...new Set(body.scopes)]),expiresAt,actorUserId);
    return {...one(rows),patient};
  });

  await writeAudit({
    tenantId,userId:actorUserId,
    action:'veterinary.guardian_portal.grant.created',
    entity:'VeterinaryGuardianPortalGrant',entityId:grant.id,
    after:{patientId:body.patientId,expiresAt,scopes:[...new Set(body.scopes)]}
  });
  res.setHeader('Cache-Control','no-store');
  ok(res,{
    id:grant.id,
    patientId:grant.patientId,
    patientName:grant.patient.displayName,
    guardianName:grant.patient.guardianName||null,
    guardianPhone:grant.patient.guardianPhone||null,
    guardianEmail:grant.patient.guardianEmail||null,
    scopes:grant.scopes,
    expiresAt:grant.expiresAt,
    createdAt:grant.createdAt,
    portalToken,
    portalPath:`/portal/veterinaria/#access=${encodeURIComponent(portalToken)}`,
    portalEndpoint:'/api/v1/public/veterinary-portal/session'
  },201);
}));

router.post('/guardian-portal/grants/:id/revoke', requirePermission('communications.manage'), asyncHandler(async (req,res)=>{
  const tenantId=ctx(req).tenantId;
  const actorUserId=String(ctx(req).userId||'').trim();
  if(!actorUserId)throw new HttpError(401,'Revocar acceso del tutor requiere un actor autenticado.');
  const rows=await prisma.$queryRawUnsafe<any[]>(`
    UPDATE public."VeterinaryGuardianPortalGrant"
    SET "revokedAt"=COALESCE("revokedAt",now())
    WHERE "tenantId"=$1 AND "id"=$2
    RETURNING "id","patientId","scopes","expiresAt","revokedAt","createdBy","lastUsedAt","createdAt"
  `,tenantId,req.params.id);
  const grant=one(rows,'Acceso del tutor no encontrado.');
  await writeAudit({
    tenantId,userId:actorUserId,
    action:'veterinary.guardian_portal.grant.revoked',
    entity:'VeterinaryGuardianPortalGrant',entityId:grant.id,
    after:{patientId:grant.patientId,revokedAt:grant.revokedAt}
  });
  ok(res,grant);
}));

export default router;
