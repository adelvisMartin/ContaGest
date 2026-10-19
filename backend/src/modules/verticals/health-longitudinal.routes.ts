import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission } from '../../shared/middleware/context.js';
import { ctx, one } from './verticals.shared.js';
import {
  careClinicalFactSchema,
  careClinicalFactAmendmentSchema,
  assertCareFactReviewable,
  assertCareFactAmendable,
  fingerprintCareFact,
  encodeCareTimelineCursor,
  decodeCareTimelineCursor
} from './care-longitudinal-policy.js';

const router = Router();

async function requirePatient(tx: any, tenantId: string, patientId: string): Promise<void> {
  const rows = await tx.$queryRawUnsafe(`
    SELECT "id" FROM public."CarePatient"
    WHERE "tenantId"=$1 AND "id"=$2 LIMIT 1
  `, tenantId, patientId);
  if (!rows.length) throw new HttpError(404, 'Paciente no encontrado.');
}

async function requireEncounter(tx: any, tenantId: string, patientId: string, encounterId: string | null): Promise<void> {
  if (!encounterId) return;
  const rows = await tx.$queryRawUnsafe(`
    SELECT "id" FROM public."CareEncounter"
    WHERE "tenantId"=$1 AND "id"=$2 AND "patientId"=$3 LIMIT 1
  `, tenantId, encounterId, patientId);
  if (!rows.length) throw new HttpError(422, 'El encuentro no pertenece al paciente y tenant activos.');
}

async function requireLicensedReviewer(tx: any, tenantId: string, userId: string): Promise<void> {
  const reviewers = await tx.$queryRawUnsafe(`
    SELECT "id" FROM public."CareProfessional"
    WHERE "tenantId"=$1 AND "userId"=$2 AND "status"='active'
      AND NULLIF(trim("licenseNumber"),'') IS NOT NULL
    LIMIT 1
  `, tenantId, userId);
  if (!reviewers.length) throw new HttpError(403, 'La revisión exige un profesional clínico activo, asociado al usuario y con matrícula.');
}

function currentActorId(req: any): string {
  const userId = ctx(req).userId;
  if (!userId) throw new HttpError(403, 'La operación clínica requiere un actor autenticado.');
  return userId;
}

router.get('/health/patients/:id/facts', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const tenantId = ctx(req).tenantId;
  const patientId = String(req.params.id);
  const cursor = decodeCareTimelineCursor(req.query.cursor);
  if(cursor && cursor.sourceType !== 'fact')throw new HttpError(422,'Cursor de hechos clínicos inválido.');
  await requirePatient(prisma, tenantId, patientId);
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT f."id", f."patientId", f."encounterId", f."kind", f."detail", f."effectiveAt", f."provenance",
           f."status", f."supersedesId", f."amendmentReason", f."createdByUserId", f."reviewedByUserId",
           f."reviewedAt", f."fingerprint", f."createdAt",
           EXISTS(SELECT 1 FROM public."CareClinicalFact" s WHERE s."tenantId"=f."tenantId"
             AND s."patientId"=f."patientId" AND s."supersedesId"=f."id" AND s."status"='reviewed') AS "isSuperseded",
           EXISTS(SELECT 1 FROM public."CareClinicalFact" s WHERE s."tenantId"=f."tenantId"
             AND s."patientId"=f."patientId" AND s."supersedesId"=f."id") AS "hasAmendment"
    FROM public."CareClinicalFact" f
    WHERE f."tenantId"=$1 AND f."patientId"=$2
      AND ($3::timestamptz IS NULL OR (f."effectiveAt",f."id") < ($3::timestamptz,$4::text))
    ORDER BY f."effectiveAt" DESC, f."id" DESC LIMIT $5
  `, tenantId, patientId, cursor?.effectiveAt || null, cursor?.sourceId || null, 101);
  const items=rows.slice(0,100);
  const last=items.at(-1);
  const nextCursor=rows.length>100&&last ? encodeCareTimelineCursor({
    effectiveAt:new Date(last.effectiveAt).toISOString(),sourceType:'fact',sourceId:last.id
  }) : null;
  res.setHeader('Cache-Control', 'no-store');
  ok(res, {items,nextCursor});
}));

router.post('/health/facts', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const tenantId = ctx(req).tenantId;
  const actorUserId = currentActorId(req);
  const fact = careClinicalFactSchema.parse(req.body || {});
  const requestFingerprint = fingerprintCareFact({ tenantId, ...fact });
  const outcome = await prisma.$transaction(async (tx) => {
    // Lock retries for the same tenant/actor/key before querying, so a lost HTTP
    // response cannot create a duplicate and a conflicting replay fails closed.
    await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1::text), hashtext($2::text))::text`,
      `${tenantId}:${actorUserId}`, fact.idempotencyKey);
    const existing = await tx.$queryRawUnsafe<any[]>(`
      SELECT * FROM public."CareClinicalFact"
      WHERE "tenantId"=$1 AND "createdByUserId"=$2 AND "requestKey"=$3 LIMIT 1
    `, tenantId, actorUserId, fact.idempotencyKey);
    if (existing.length) {
      if (existing[0].requestFingerprint !== requestFingerprint)
        throw new HttpError(409, 'La clave de reintento ya pertenece a un registro clínico diferente.');
      return { row: existing[0], replay: true };
    }
    await requirePatient(tx, tenantId, fact.patientId);
    await requireEncounter(tx, tenantId, fact.patientId, fact.encounterId || null);
    const rows = await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."CareClinicalFact"
        ("tenantId", "patientId", "encounterId", "kind", "detail", "effectiveAt", "provenance", "createdByUserId", "requestKey", "requestFingerprint")
      VALUES ($1,$2,$3,$4,$5::jsonb,$6::timestamptz,$7,$8,$9,$10)
      RETURNING *
    `, tenantId, fact.patientId, fact.encounterId || null, fact.kind, JSON.stringify(fact.detail), fact.effectiveAt, fact.provenance, actorUserId, fact.idempotencyKey, requestFingerprint);
    return { row: one(rows), replay: false };
  });
  res.setHeader('Cache-Control', 'no-store');
  ok(res, outcome.row, outcome.replay ? 200 : 201);
}));

router.post('/health/facts/:id/review', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const tenantId = ctx(req).tenantId;
  const actorUserId = currentActorId(req);
  const reviewed = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<any[]>(`
      SELECT * FROM public."CareClinicalFact"
      WHERE "tenantId"=$1 AND "id"=$2 FOR UPDATE
    `, tenantId, String(req.params.id));
    const prior = one(rows, 'Hecho clínico no encontrado.');
    assertCareFactReviewable(prior.status);
    await requireLicensedReviewer(tx, tenantId, actorUserId);
    const fingerprint = fingerprintCareFact({
      tenantId, patientId: prior.patientId, kind: prior.kind,
      detail: prior.detail, effectiveAt: new Date(prior.effectiveAt).toISOString(),
      encounterId: prior.encounterId, provenance: prior.provenance,
      supersedesId: prior.supersedesId, amendmentReason: prior.amendmentReason
    });
    const result = await tx.$queryRawUnsafe<any[]>(`
      UPDATE public."CareClinicalFact"
      SET "status"='reviewed', "reviewedByUserId"=$3, "reviewedAt"=now(),
          "fingerprint"=$4, "updatedAt"=now()
      WHERE "tenantId"=$1 AND "id"=$2 AND "status"='draft'
      RETURNING *
    `, tenantId, prior.id, actorUserId, fingerprint);
    return one(result);
  });
  res.setHeader('Cache-Control', 'no-store');
  ok(res, reviewed);
}));

router.post('/health/facts/:id/amend', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const tenantId = ctx(req).tenantId;
  const actorUserId = currentActorId(req);
  const correction = careClinicalFactAmendmentSchema.parse(req.body || {});
  const created = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<any[]>(`
      SELECT * FROM public."CareClinicalFact"
      WHERE "tenantId"=$1 AND "id"=$2 FOR UPDATE
    `, tenantId, String(req.params.id));
    const prior = one(rows, 'Hecho clínico no encontrado.');
    assertCareFactAmendable(prior.status);
    await requireEncounter(tx, tenantId, prior.patientId, correction.encounterId || null);
    const previousAmendments = await tx.$queryRawUnsafe<any[]>(`
      SELECT "id" FROM public."CareClinicalFact"
      WHERE "tenantId"=$1 AND "patientId"=$2 AND "supersedesId"=$3 LIMIT 1
    `, tenantId, prior.patientId, prior.id);
    if (previousAmendments.length) throw new HttpError(409, 'Esta versión ya tiene una enmienda registrada.');
    const next = await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."CareClinicalFact"
        ("tenantId", "patientId", "encounterId", "kind", "detail", "effectiveAt", "provenance",
         "supersedesId", "amendmentReason", "createdByUserId")
      VALUES ($1,$2,$3,$4,$5::jsonb,$6::timestamptz,$7,$8,$9,$10)
      RETURNING *
    `, tenantId, prior.patientId, correction.encounterId || null, correction.kind,
       JSON.stringify(correction.detail), correction.effectiveAt, correction.provenance,
       prior.id, correction.reason, actorUserId);
    return one(next);
  });
  res.setHeader('Cache-Control', 'no-store');
  ok(res, created, 201);
}));

router.get('/health/patients/:id/timeline', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const tenantId = ctx(req).tenantId;
  const patientId = String(req.params.id);
  const cursor = decodeCareTimelineCursor(req.query.cursor);
  await requirePatient(prisma, tenantId, patientId);
  // A projection only: the clinical payload stays in the source resource, behind its own permissions.
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    WITH events AS (
      SELECT 'fact'::text AS "sourceType", "id" AS "sourceId", "effectiveAt", "createdAt" AS "recordedAt", "status"
        FROM public."CareClinicalFact" WHERE "tenantId"=$1 AND "patientId"=$2
      UNION ALL
      SELECT 'encounter', "id", "createdAt", "createdAt", "status"
        FROM public."CareEncounter" WHERE "tenantId"=$1 AND "patientId"=$2
      UNION ALL
      SELECT 'measurement', "id", "measuredAt", "measuredAt", 'recorded'
        FROM public."CareMeasurement" WHERE "tenantId"=$1 AND "patientId"=$2
      UNION ALL
      SELECT 'prescription', "id", "createdAt", "createdAt", "status"
        FROM public."CarePrescription" WHERE "tenantId"=$1 AND "patientId"=$2
      UNION ALL
      SELECT 'lab_order', "id", "orderedAt", "createdAt", "status"
        FROM public."CareLabOrder" WHERE "tenantId"=$1 AND "patientId"=$2
      UNION ALL
      SELECT 'lab_result', r."id", r."observedAt", r."createdAt", 'recorded'
        FROM public."CareLabResult" r
        JOIN public."CareLabOrder" o ON o."tenantId"=r."tenantId" AND o."id"=r."labOrderId"
        WHERE r."tenantId"=$1 AND o."patientId"=$2
      UNION ALL
      SELECT 'study', "id", COALESCE("performedAt", "scheduledAt", "createdAt"), "createdAt", "status"
        FROM public."CareDiagnosticStudy" WHERE "tenantId"=$1 AND "patientId"=$2
      UNION ALL
      SELECT 'procedure', "id", COALESCE("performedAt", "scheduledAt", "createdAt"), "createdAt", "status"
        FROM public."CareProcedure" WHERE "tenantId"=$1 AND "patientId"=$2
      UNION ALL
      SELECT 'immunization', "id", "administeredAt", "createdAt", 'recorded'
        FROM public."CareImmunization" WHERE "tenantId"=$1 AND "patientId"=$2
      UNION ALL
      SELECT 'hospitalization', "id", "admittedAt", "createdAt", "status"
        FROM public."CareHospitalization" WHERE "tenantId"=$1 AND "patientId"=$2
    )
    SELECT "sourceType", "sourceId", "effectiveAt", "recordedAt", "status"
    FROM events
    WHERE ($3::timestamptz IS NULL OR ("effectiveAt", "sourceType", "sourceId") < ($3::timestamptz,$4::text,$5::text))
    ORDER BY "effectiveAt" DESC, "sourceType" DESC, "sourceId" DESC
    LIMIT $6
  `, tenantId, patientId, cursor?.effectiveAt || null, cursor?.sourceType || null, cursor?.sourceId || null, 51);
  const items = rows.slice(0, 50).map((row) => ({
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    effectiveAt: new Date(row.effectiveAt).toISOString(),
    recordedAt: new Date(row.recordedAt).toISOString(),
    status: row.status
  }));
  const last = items.at(-1);
  const nextCursor = rows.length > 50 && last ? encodeCareTimelineCursor({
    effectiveAt: last.effectiveAt, sourceType: last.sourceType, sourceId: last.sourceId
  }) : null;
  res.setHeader('Cache-Control', 'no-store');
  ok(res, { items, nextCursor });
}));

export default router;
