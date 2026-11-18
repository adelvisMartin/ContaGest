import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { ctx, one } from './verticals.shared.js';
import { observationSchema, procedureSchema } from './veterinary.schemas.js';

const router = Router();

const referenceNumber = (prefix: string) => `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;

router.get('/observations', asyncHandler(async (req, res) => {
  const hospitalizationId = String(req.query.hospitalizationId || '');
  if (!hospitalizationId) throw new HttpError(422, 'hospitalizationId es obligatorio.');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT o.*,pr."fullName" AS "professionalName" FROM public."CareHospitalObservation" o
    JOIN public."CareHospitalization" h ON h."id"=o."hospitalizationId" AND h."tenantId"=o."tenantId"
    LEFT JOIN public."CareProfessional" pr ON pr."id"=o."professionalId" AND pr."tenantId"=o."tenantId"
    WHERE o."tenantId"=$1 AND o."hospitalizationId"=$2 ORDER BY o."observedAt" DESC LIMIT 2000
  `, ctx(req).tenantId, hospitalizationId);
  ok(res, rows);
}));

router.post('/observations', asyncHandler(async (req, res) => {
  const b = observationSchema.parse(req.body || {});
  const tenantId=ctx(req).tenantId;
  if(b.professionalId){
    const professionals=await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM public."CareProfessional" WHERE "tenantId"=$1 AND "id"=$2 LIMIT 1`,tenantId,b.professionalId);
    if(!professionals.length)throw new HttpError(422,'El profesional no pertenece al tenant activo.');
  }
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareHospitalObservation" ("id","tenantId","hospitalizationId","professionalId","observedAt","type","values","note","createdAt")
    SELECT gen_random_uuid()::text,$1,h."id",$3,COALESCE($4::timestamptz,now()),$5,$6::jsonb,$7,now()
    FROM public."CareHospitalization" h WHERE h."id"=$2 AND h."tenantId"=$1 AND h."status" IN ('admitted','observed') RETURNING *
  `, ctx(req).tenantId, b.hospitalizationId, b.professionalId || null, b.observedAt || null, b.type, JSON.stringify(b.values), b.note || null);
  ok(res, one(rows, 'Hospitalización activa no encontrada.'), 201);
}));

router.get('/procedures', asyncHandler(async (req, res) => {
  const patientId = String(req.query.patientId || '');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT c.*,p."displayName" AS "patientName",pr."fullName" AS "professionalName"
    FROM public."CareProcedure" c
    JOIN public."CarePatient" p ON p."id"=c."patientId" AND p."tenantId"=c."tenantId" AND p."kind"='animal'
    LEFT JOIN public."CareProfessional" pr ON pr."id"=c."professionalId" AND pr."tenantId"=c."tenantId"
    WHERE c."tenantId"=$1 AND ($2='' OR c."patientId"=$2) ORDER BY COALESCE(c."performedAt",c."scheduledAt",c."createdAt") DESC LIMIT 1000
  `, ctx(req).tenantId, patientId);
  ok(res, rows);
}));

router.post('/procedures', asyncHandler(async (req, res) => {
  const b = procedureSchema.parse(req.body || {});
  const tenantId = ctx(req).tenantId;
  const created = await prisma.$transaction(async(tx)=>{
    const patients=await tx.$queryRawUnsafe<Array<{id:string}>>(`
      SELECT "id" FROM public."CarePatient"
      WHERE "tenantId"=$1 AND "id"=$2 AND "kind"='animal' AND "active"=true
      FOR SHARE
    `,tenantId,b.patientId);
    if(patients.length!==1)throw new HttpError(404,'Mascota activa no encontrada.');
    if(b.encounterId){
      const encounters=await tx.$queryRawUnsafe<Array<{id:string}>>(`
        SELECT "id" FROM public."CareEncounter"
        WHERE "tenantId"=$1 AND "patientId"=$2 AND "id"=$3 FOR SHARE
      `,tenantId,b.patientId,b.encounterId);
      if(encounters.length!==1)
        throw new HttpError(422,'El encuentro clínico no corresponde a esta mascota.');
    }
    if(b.professionalId){
      const professionals=await tx.$queryRawUnsafe<Array<{id:string}>>(`
        SELECT "id" FROM public."CareProfessional"
        WHERE "tenantId"=$1 AND "id"=$2 FOR SHARE
      `,tenantId,b.professionalId);
      if(professionals.length!==1)
        throw new HttpError(422,'Profesional ajeno a la empresa activa.');
    }
    const rows=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."CareProcedure"
        ("id","tenantId","patientId","encounterId","professionalId",
         "name","kind","status","scheduledAt","performedAt","anesthesia",
         "notes","outcome","createdAt","updatedAt")
      VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,
              $8::timestamptz,$9::timestamptz,$10,$11,$12,now(),now())
      RETURNING *
    `,tenantId,b.patientId,b.encounterId||null,b.professionalId||null,b.name,
      b.kind,b.status,b.scheduledAt||null,b.performedAt||null,b.anesthesia||null,
      b.notes||null,b.outcome||null);
    return one(rows);
  });
  ok(res,created,201);
}));
export default router;
