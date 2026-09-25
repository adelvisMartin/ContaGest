import { createHash } from 'node:crypto';
import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission } from '../../shared/middleware/context.js';
import { ctx as context, one } from './verticals.shared.js';
import { careConsentSchema, carePrescriptionSchema, consentRevocationSchema, dentalTreatmentConsentSchema } from './health.schemas.js';

const router = Router();

const DENTAL_CONSENT_KIND = 'dental-treatment-consent';
const DENTAL_CONSENT_TEMPLATE_VERSION='dental-treatment-plan-consent-v1';
const stableJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') { const encoded=JSON.stringify(value); return encoded===undefined?'null':encoded; }
  if (Array.isArray(value)) return `[${value.map((item)=>stableJson(item)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key)=>`${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
};
const treatmentPlanFingerprint = (value: unknown) =>
  createHash('sha256').update(stableJson(value)).digest('hex');

router.get('/health/prescriptions', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const patientId = String(req.query.patientId || '');
  if (!patientId) throw new HttpError(422, 'patientId es obligatorio.');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT p.*, pr."fullName" AS "professionalName", prod."name" AS "productName", prod."sku" AS "productSku"
    FROM public."CarePrescription" p
    LEFT JOIN public."CareProfessional" pr ON pr."id" = p."professionalId" AND pr."tenantId"=p."tenantId"
    LEFT JOIN public."Product" prod ON prod."id"=p."productId" AND prod."tenantId"=p."tenantId"
    WHERE p."tenantId" = $1 AND p."patientId" = $2
    ORDER BY p."createdAt" DESC
    LIMIT 500
  `, context(req).tenantId, patientId);
  ok(res, rows);
}));

router.post('/health/prescriptions', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const body = carePrescriptionSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CarePrescription"
      ("id", "tenantId", "patientId", "encounterId", "professionalId", "medication", "dose", "frequency", "duration", "instructions", "status", "createdAt")
    VALUES
      (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
    RETURNING *
  `,
    context(req).tenantId,
    body.patientId,
    body.encounterId || null,
    body.professionalId || null,
    body.medication,
    body.dose || null,
    body.frequency || null,
    body.duration || null,
    body.instructions || null,
    body.status
  );
  ok(res, one(rows), 201);
}));

router.get('/health/consents', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const patientId = String(req.query.patientId || '');
  if (!patientId) throw new HttpError(422, 'patientId es obligatorio.');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT * FROM public."CareConsent"
    WHERE "tenantId" = $1 AND "patientId" = $2
    ORDER BY "createdAt" DESC
    LIMIT 500
  `, context(req).tenantId, patientId);
  ok(res, rows);
}));

router.post('/health/consents', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const body = careConsentSchema.parse(req.body || {});
  if (body.kind===DENTAL_CONSENT_KIND) throw new HttpError(422, 'El consentimiento odontológico usa el flujo especializado.');
  const signedAt = body.status === 'signed' ? new Date().toISOString() : null;
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareConsent"
      ("id", "tenantId", "patientId", "kind", "status", "signerName", "signedAt", "documentUrl", "metadata", "createdAt")
    VALUES
      (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6::timestamptz, $7, $8::jsonb, now())
    RETURNING *
  `,
    context(req).tenantId,
    body.patientId,
    body.kind,
    body.status,
    body.signerName || null,
    signedAt,
    body.documentUrl || null,
    JSON.stringify(body.metadata)
  );
  ok(res, one(rows), 201);
}));


router.post('/health/consents/dental-treatment', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const tenantId=context(req).tenantId;
  const actorUserId=context(req).userId||null;
  const actorEmail=context(req).email||null;
  const body=dentalTreatmentConsentSchema.parse(req.body||{});

  const consent=await prisma.$transaction(async (tx)=>{
    await tx.$queryRawUnsafe<any[]>(`
      SELECT pg_advisory_xact_lock(hashtextextended($1,0))
    `,`${tenantId}:${body.treatmentPlanEncounterId}:${DENTAL_CONSENT_KIND}`);
    const patientRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id" FROM public."CarePatient"
      WHERE "tenantId"=$1 AND "id"=$2 AND "kind"='human' AND "active"=true
      LIMIT 1
    `,tenantId,body.patientId);
    if(!patientRows.length)throw new HttpError(422,'El paciente no pertenece al tenant activo.');

    const planRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT * FROM public."CareEncounter"
      WHERE "tenantId"=$1 AND "id"=$2 AND "patientId"=$3
      LIMIT 1
      FOR SHARE
    `,tenantId,body.treatmentPlanEncounterId,body.patientId);
    const plan=one(planRows,'Plan de tratamiento no encontrado.');
    if(plan.type!=='dental-treatment-plan')throw new HttpError(422,'El encuentro no es un plan de tratamiento dental.');
    if(plan.status!=='signed')throw new HttpError(409,'El plan debe estar aceptado antes del consentimiento.');
    const treatmentPlan=plan.clinicalData?.treatmentPlan;
    const acceptance=treatmentPlan?.acceptance;
    if(treatmentPlan?.status!=='accepted'||acceptance?.status!=='accepted')throw new HttpError(409,'El plan debe tener aceptación operativa antes del consentimiento.');

    const latestRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT * FROM public."CareConsent"
      WHERE "tenantId"=$1
        AND "patientId"=$2
        AND "kind"=$3
        AND "metadata"->>'treatmentPlanEncounterId'=$4
      ORDER BY "createdAt" DESC
      LIMIT 1
      FOR UPDATE
    `,tenantId,body.patientId,DENTAL_CONSENT_KIND,body.treatmentPlanEncounterId);
    const latest=latestRows[0]||null;
    if(latest?.status==='signed')throw new HttpError(409,'Ya existe un consentimiento firmado activo para este plan.');
    const latestMetadata=latest?.metadata&&typeof latest.metadata==='object'?latest.metadata:{};
    const revision=Number(latestMetadata.revision||0)+1;
    const previousConsentId=latest?.id||null;
    const signedAt=new Date().toISOString();
    const planSnapshot={
      encounterId:plan.id,
      patientId:plan.patientId,
      professionalId:plan.professionalId||null,
      createdAt:plan.createdAt instanceof Date?plan.createdAt.toISOString():String(plan.createdAt||''),
      treatmentPlan
    };
    const planSha256=treatmentPlanFingerprint(planSnapshot);
    const evidence={
      kind:DENTAL_CONSENT_KIND,
      patientId:body.patientId,
      treatmentPlanEncounterId:body.treatmentPlanEncounterId,
      signerName:body.signerName,
      signerRole:body.signerRole,
      consentText:body.consentText,
      attestation:body.attestation,
      method:'typed-attestation',
      documentVersion:DENTAL_CONSENT_TEMPLATE_VERSION,
      planSha256,
      revision,
      previousConsentId,
      signedAt,
      actorUserId,
      actorEmail
    };
    const consentSha256=createHash('sha256').update(stableJson(evidence)).digest('hex');
    const metadata={
      schemaVersion:1,
      treatmentPlanEncounterId:body.treatmentPlanEncounterId,
      treatmentPlanFingerprint:planSha256,
      planSnapshot,
      consentSha256,
      previousConsentId,
      revision,
      attestation:{
        method:'typed-attestation',
        accepted:true,
        text:body.consentText,
        signerRole:body.signerRole
      },
      documentVersion:DENTAL_CONSENT_TEMPLATE_VERSION,
      actorUserId,
      actorEmail,
      signedAt
    };

    const inserted=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."CareConsent"
        ("id","tenantId","patientId","kind","status","signerName","signedAt","documentUrl","metadata","createdAt")
      VALUES
        (gen_random_uuid()::text,$1,$2,$3,'signed',$4,$5::timestamptz,$6,$7::jsonb,now())
      RETURNING *
    `,tenantId,body.patientId,DENTAL_CONSENT_KIND,body.signerName,signedAt,body.documentUrl||null,JSON.stringify(metadata));
    return one(inserted);
  });

  ok(res,consent,201);
}));

router.post('/health/consents/:id/revoke', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const tenantId=context(req).tenantId;
  const actorUserId=context(req).userId||null;
  const actorEmail=context(req).email||null;
  const consentId=String(req.params.id||'');
  const body=consentRevocationSchema.parse(req.body||{});

  const revoked=await prisma.$transaction(async (tx)=>{
    const rows=await tx.$queryRawUnsafe<any[]>(`
      SELECT * FROM public."CareConsent"
      WHERE "tenantId"=$1 AND "id"=$2
      FOR UPDATE
    `,tenantId,consentId);
    const previous=one(rows,'Consentimiento no encontrado.');
    if(previous.kind!==DENTAL_CONSENT_KIND)throw new HttpError(422,'Este flujo de revocación aplica al consentimiento dental estructurado.');
    if(previous.status!=='signed')throw new HttpError(409,'Sólo un consentimiento firmado puede revocarse.');
    const revokedAt=new Date().toISOString();
    const previousMetadata=previous.metadata&&typeof previous.metadata==='object'?previous.metadata:{};
    const revocationSha256=createHash('sha256').update(stableJson({
      consentSha256:previousMetadata.consentSha256||null,
      reason:body.reason,
      revokedAt,
      actorUserId,
      actorEmail
    })).digest('hex');
    const nextMetadata={
      ...previousMetadata,
      revokedAt,
      revokeReason:body.reason,
      revocation:{reason:body.reason,revokedAt,actorUserId,actorEmail,revocationSha256}
    };
    const updated=await tx.$queryRawUnsafe<any[]>(`
      UPDATE public."CareConsent"
      SET "status"='revoked',"metadata"=$3::jsonb
      WHERE "tenantId"=$1 AND "id"=$2 AND "status"='signed'
      RETURNING *
    `,tenantId,previous.id,JSON.stringify(nextMetadata));
    return one(updated);
  });

  ok(res,revoked);
}));

export default router;
