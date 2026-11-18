import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { ctx, one } from './verticals.shared.js';
import { veterinaryHospitalStatusTransitionAllowed, veterinaryHospitalCageLockKey } from './veterinary-hospitalization-policy.mjs';
import {
  hospitalizationSchema,
  hospitalizationStatusSchema
} from './veterinary.schemas.js';

const router = Router();

const referenceNumber = (prefix: string) => `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;

router.get('/hospitalizations', asyncHandler(async (req, res) => {
  const patientId = String(req.query.patientId || '');
  const status = String(req.query.status || '');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT h.*, p."displayName" AS "patientName", p."species", p."breed", pr."fullName" AS "professionalName",
      count(o."id")::int AS "observationCount"
    FROM public."CareHospitalization" h
    JOIN public."CarePatient" p ON p."id"=h."patientId" AND p."tenantId"=h."tenantId" AND p."kind"='animal'
    LEFT JOIN public."CareProfessional" pr ON pr."id"=h."professionalId" AND pr."tenantId"=h."tenantId"
    LEFT JOIN public."CareHospitalObservation" o ON o."hospitalizationId"=h."id" AND o."tenantId"=h."tenantId"
    WHERE h."tenantId"=$1 AND ($2='' OR h."patientId"=$2) AND ($3='' OR h."status"=$3)
    GROUP BY h."id",p."displayName",p."species",p."breed",pr."fullName"
    ORDER BY h."admittedAt" DESC LIMIT 1000
  `, ctx(req).tenantId, patientId, status);
  ok(res, rows);
}));

router.post('/hospitalizations', asyncHandler(async (req, res) => {
  const b = hospitalizationSchema.parse(req.body || {});
  const tenantId=ctx(req).tenantId;
  if(b.status!=='admitted')
    throw new HttpError(422,'Toda hospitalización nueva debe iniciar en estado admitido.');
  const ward=String(b.ward||'').trim(),cage=String(b.cage||'').trim();
  // Both identifiers are necessary to claim a specific physical cage.
  if(Boolean(ward)!==Boolean(cage))
    throw new HttpError(422,'Asigna zona y jaula juntas o deja ambas sin asignar.');
  const created=await prisma.$transaction(async tx=>{
    // Serialize admissions for the same patient and the same physical cage.
    // The lock lives inside the database transaction, never in application RAM.
    await tx.$queryRawUnsafe(
      'SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text AS locked',
      `vet:hospital:patient:${tenantId}:${b.patientId}`
    );
    if(ward&&cage){
      await tx.$queryRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text AS locked',
        veterinaryHospitalCageLockKey(tenantId,ward,cage)
      );
    }
    const patients=await tx.$queryRawUnsafe<Array<{id:string}>>(`
      SELECT "id" FROM public."CarePatient"
      WHERE "tenantId"=$1 AND "id"=$2 AND "kind"='animal' AND "active"=true
      FOR SHARE
    `,tenantId,b.patientId);
    if(patients.length!==1)throw new HttpError(404,'Mascota no encontrada.');

    const existing=await tx.$queryRawUnsafe<Array<{id:string}>>(`
      SELECT "id" FROM public."CareHospitalization"
      WHERE "tenantId"=$1 AND "patientId"=$2 AND "status" IN ('admitted','observed')
      LIMIT 1
    `,tenantId,b.patientId);
    if(existing.length)
      throw new HttpError(409,'La mascota ya tiene una hospitalización activa.');

    if(ward&&cage){
      const occupied=await tx.$queryRawUnsafe<Array<{id:string}>>(`
        SELECT "id" FROM public."CareHospitalization"
        WHERE "tenantId"=$1 AND lower(btrim("ward"))=lower($2)
          AND lower(btrim("cage"))=lower($3)
          AND "status" IN ('admitted','observed')
        LIMIT 1
      `,tenantId,ward,cage);
      if(occupied.length)throw new HttpError(409,'La jaula ya está ocupada.');
    }
    if(b.professionalId){
      const professional=await tx.$queryRawUnsafe<Array<{id:string}>>(`
        SELECT "id" FROM public."CareProfessional"
        WHERE "tenantId"=$1 AND "id"=$2
        FOR SHARE
      `,tenantId,b.professionalId);
      if(!professional.length)throw new HttpError(422,'El profesional no pertenece al tenant activo.');
    }
    if(b.encounterId){
      const encounter=await tx.$queryRawUnsafe<Array<{id:string}>>(`
        SELECT "id" FROM public."CareEncounter"
        WHERE "tenantId"=$1 AND "id"=$2 AND "patientId"=$3
        FOR SHARE
      `,tenantId,b.encounterId,b.patientId);
      if(!encounter.length)throw new HttpError(422,'El encuentro no pertenece a la mascota hospitalizada.');
    }
    const rows=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."CareHospitalization"
        ("id","tenantId","patientId","encounterId","professionalId","admissionNumber",
         "admittedAt","ward","cage","reason","diagnosis","status","carePlan","createdAt","updatedAt")
      VALUES
        (gen_random_uuid()::text,$1,$2,$3,$4,$5,COALESCE($6::timestamptz,now()),
         $7,$8,$9,$10,'admitted',$11::jsonb,now(),now())
      RETURNING *
    `,tenantId,b.patientId,b.encounterId||null,b.professionalId||null,
      referenceNumber('VET-HOSP'),b.admittedAt||null,ward||null,cage||null,
      b.reason,b.diagnosis||null,JSON.stringify(b.carePlan));
    return one(rows);
  });
  ok(res,created,201);
}));

router.patch('/hospitalizations/:id/status', asyncHandler(async (req, res) => {
  const b = hospitalizationStatusSchema.parse(req.body || {});
  const tenantId=ctx(req).tenantId;
  const result=await prisma.$transaction(async tx=>{
    const rows=await tx.$queryRawUnsafe<Array<{id:string;status:string;dischargedAt:Date|null}>>(`
      SELECT "id","status","dischargedAt" FROM public."CareHospitalization"
      WHERE "tenantId"=$1 AND "id"=$2 FOR UPDATE
    `,tenantId,String(req.params.id));
    const current=one(rows,'Hospitalización no encontrada.');
    if(b.dischargedAt&&b.status!=='discharged')
      throw new HttpError(422,'La fecha de alta solo se admite al dar de alta.');
    if(current.status===b.status){
      // Idempotent retry: do not rewrite discharge date or diagnosis.
      const unchanged=await tx.$queryRawUnsafe<any[]>(`
        SELECT * FROM public."CareHospitalization"
        WHERE "tenantId"=$1 AND "id"=$2
      `,tenantId,current.id);
      return one(unchanged);
    }
    if(!veterinaryHospitalStatusTransitionAllowed(current.status,b.status))
      throw new HttpError(409,'Transición de hospitalización no permitida.');
    const changed=await tx.$queryRawUnsafe<any[]>(`
      UPDATE public."CareHospitalization"
      SET "status"=$3,
          "dischargedAt"=CASE WHEN $3='discharged'
            THEN COALESCE($4::timestamptz,now()) ELSE "dischargedAt" END,
          "diagnosis"=COALESCE($5,"diagnosis"),"updatedAt"=now()
      WHERE "id"=$1 AND "tenantId"=$2 AND "status"=$6
      RETURNING *
    `,current.id,tenantId,b.status,b.dischargedAt||null,b.diagnosis||null,current.status);
    if(changed.length!==1)throw new HttpError(409,'Conflicto al actualizar la hospitalización.');
    return one(changed);
  });
  ok(res,result);
}));

export default router;
