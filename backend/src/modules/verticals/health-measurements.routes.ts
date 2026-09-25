import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission } from '../../shared/middleware/context.js';
import { ctx, one } from './verticals.shared.js';
import {
  measurementSchema,
  veterinaryVitalBatchSchema,
  immunizationSchema
} from './health.schemas.js';

const router = Router();

router.get('/health/measurements', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const patientId=String(req.query.patientId||'');
  if(!patientId)throw new HttpError(422,'patientId es obligatorio.');
  const rows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT *
    FROM public."CareMeasurement"
    WHERE "tenantId"=$1 AND "patientId"=$2
    ORDER BY "measuredAt" DESC, "id" DESC
    LIMIT 1000
  `,ctx(req).tenantId,patientId);
  ok(res,rows);
}));

router.post('/health/measurements', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const tenantId=ctx(req).tenantId;
  const b = measurementSchema.parse(req.body || {});
  const patientRows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id" FROM public."CarePatient"
    WHERE "tenantId"=$1 AND "id"=$2
    LIMIT 1
  `,tenantId,b.patientId);
  if(!patientRows.length)throw new HttpError(422,'El paciente no pertenece al tenant activo.');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareMeasurement" ("id","tenantId","patientId","encounterId","kind","value","unit","measuredAt","metadata")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz,now()),$8::jsonb) RETURNING *
  `, tenantId,b.patientId,b.encounterId||null,b.kind,b.value,b.unit,b.measuredAt||null,JSON.stringify(b.metadata));
  ok(res, one(rows), 201);
}));

router.post('/health/measurements/veterinary-vitals', requirePermission('health.manage'), asyncHandler(async (req,res)=>{
  const tenantId=ctx(req).tenantId;
  const body=veterinaryVitalBatchSchema.parse(req.body||{});
  const result=await prisma.$transaction(async(tx)=>{
    await tx.$queryRawUnsafe<any[]>(`
      SELECT pg_advisory_xact_lock(hashtextextended($1,0))
    `,`${tenantId}:veterinary-vitals:${body.patientId}:${body.batchId}`);

    const patientRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id" FROM public."CarePatient"
      WHERE "tenantId"=$1 AND "id"=$2 AND "kind"='animal' AND "active"=true
      LIMIT 1
      FOR SHARE
    `,tenantId,body.patientId);
    if(!patientRows.length)throw new HttpError(422,'La mascota no pertenece al tenant activo.');

    if(body.encounterId){
      const encounterRows=await tx.$queryRawUnsafe<any[]>(`
        SELECT "id" FROM public."CareEncounter"
        WHERE "tenantId"=$1 AND "id"=$2 AND "patientId"=$3
        LIMIT 1
        FOR SHARE
      `,tenantId,body.encounterId,body.patientId);
      if(!encounterRows.length)throw new HttpError(422,'El encuentro no pertenece a la mascota activa.');
    }

    const existing=await tx.$queryRawUnsafe<any[]>(`
      SELECT * FROM public."CareMeasurement"
      WHERE "tenantId"=$1
        AND "patientId"=$2
        AND "metadata"->>'source'='veterinary-longitudinal-record'
        AND "metadata"->>'batchId'=$3
      ORDER BY "kind" ASC
    `,tenantId,body.patientId,body.batchId);
    if(existing.length){
      const byKind=new Map(existing.map((item)=>[String(item.kind),item]));
      const sameRequest=existing.length===body.measurements.length&&body.measurements.every((item)=>{
        const previous=byKind.get(item.kind);
        return previous&&Number(previous.value)===item.value&&String(previous.unit)===item.unit;
      });
      if(!sameRequest)throw new HttpError(409,'El batchId ya fue usado para una toma de signos vitales diferente.');
      return {measurements:existing,replayed:true};
    }

    const measuredAt=body.measuredAt||new Date().toISOString();
    const created:any[]=[];
    for(const item of body.measurements){
      const metadata={source:'veterinary-longitudinal-record',batchId:body.batchId};
      const rows=await tx.$queryRawUnsafe<any[]>(`
        INSERT INTO public."CareMeasurement"
          ("id","tenantId","patientId","encounterId","kind","value","unit","measuredAt","metadata")
        VALUES
          (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7::timestamptz,$8::jsonb)
        RETURNING *
      `,tenantId,body.patientId,body.encounterId||null,item.kind,item.value,item.unit,measuredAt,JSON.stringify(metadata));
      created.push(one(rows));
    }
    return {measurements:created,replayed:false};
  });

  res.setHeader('Idempotency-Replayed',result.replayed?'true':'false');
  ok(res,result,result.replayed?200:201);
}));

router.get('/health/immunizations', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const patientId=String(req.query.patientId||'');
  if(!patientId)throw new HttpError(422,'patientId es obligatorio.');
  const rows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT i.*,pr."fullName" AS "professionalName"
    FROM public."CareImmunization" i
    LEFT JOIN public."CareProfessional" pr ON pr."tenantId"=i."tenantId" AND pr."id"=i."professionalId"
    WHERE i."tenantId"=$1 AND i."patientId"=$2
    ORDER BY i."administeredAt" DESC,i."createdAt" DESC
    LIMIT 500
  `,ctx(req).tenantId,patientId);
  ok(res,rows);
}));

router.post('/health/immunizations', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const tenantId=ctx(req).tenantId;
  const b = immunizationSchema.parse(req.body || {});
  const patientRows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id" FROM public."CarePatient"
    WHERE "tenantId"=$1 AND "id"=$2 AND "kind"='animal'
    LIMIT 1
  `,tenantId,b.patientId);
  if(!patientRows.length)throw new HttpError(422,'El paciente no pertenece al tenant activo.');
  if(b.professionalId){
    const professionalRows=await prisma.$queryRawUnsafe<any[]>(`
      SELECT "id" FROM public."CareProfessional"
      WHERE "tenantId"=$1 AND "id"=$2
      LIMIT 1
    `,tenantId,b.professionalId);
    if(!professionalRows.length)throw new HttpError(422,'El profesional no pertenece al tenant activo.');
  }
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareImmunization" ("id","tenantId","patientId","professionalId","vaccine","dose","lot","administeredAt","nextDueAt","notes","createdAt")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz,now()),$8::timestamptz,$9,now()) RETURNING *
  `, tenantId,b.patientId,b.professionalId||null,b.vaccine,b.dose||null,b.lot||null,b.administeredAt||null,b.nextDueAt||null,b.notes||null);
  ok(res, one(rows), 201);
}));

export default router;

export default router;
