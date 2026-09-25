import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { ctx, one } from './verticals.shared.js';
import {
  labOrderSchema,
  labResultSchema,
  studySchema
} from './veterinary.schemas.js';
import type { VeterinaryLabResultFlagInput } from './veterinary.schemas.js';

const router = Router();

const referenceNumber = (prefix: string) => `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;

function inferFlag(body: VeterinaryLabResultFlagInput) {
  if (body.valueNumeric !== null && body.valueNumeric !== undefined) {
    if (body.referenceMin !== null && body.referenceMin !== undefined && body.valueNumeric < body.referenceMin) return 'low';
    if (body.referenceMax !== null && body.referenceMax !== undefined && body.valueNumeric > body.referenceMax) return 'high';
    return 'normal';
  }
  // Text alone does not prove an abnormal result. Without an explicit typed
  // reference rule, keep the deterministic neutral flag instead of guessing.
  return 'normal';
}

router.get('/lab-orders', asyncHandler(async (req, res) => {
  const patientId = String(req.query.patientId || '');
  const status = String(req.query.status || '');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT o.*, p."displayName" AS "patientName", p."species", p."breed", pr."fullName" AS "professionalName",
      count(r."id")::int AS "resultCount",
      count(r."id") FILTER (WHERE r."flag" IN ('critical','high','low','abnormal'))::int AS "abnormalCount"
    FROM public."CareLabOrder" o
    JOIN public."CarePatient" p ON p."id"=o."patientId" AND p."tenantId"=o."tenantId" AND p."kind"='animal'
    LEFT JOIN public."CareProfessional" pr ON pr."id"=o."professionalId" AND pr."tenantId"=o."tenantId" AND pr."tenantId"=o."tenantId"
    LEFT JOIN public."CareLabResult" r ON r."labOrderId"=o."id" AND r."tenantId"=o."tenantId"
    WHERE o."tenantId"=$1 AND ($2='' OR o."patientId"=$2) AND ($3='' OR o."status"=$3)
    GROUP BY o."id", p."displayName", p."species", p."breed", pr."fullName"
    ORDER BY o."orderedAt" DESC LIMIT 1000
  `, ctx(req).tenantId, patientId, status);
  ok(res, rows);
}));

router.post('/lab-orders', asyncHandler(async (req, res) => {
  const body = labOrderSchema.parse(req.body || {});
  const tenantId = ctx(req).tenantId;
  const patientRows = await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM public."CarePatient" WHERE "tenantId"=$1 AND "id"=$2 AND "kind"='animal' LIMIT 1`, tenantId, body.patientId);
  if (!patientRows.length) throw new HttpError(404, 'Mascota no encontrada.');
  if(body.professionalId){
    const professionalRows=await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM public."CareProfessional" WHERE "tenantId"=$1 AND "id"=$2 LIMIT 1`,tenantId,body.professionalId);
    if(!professionalRows.length)throw new HttpError(422,'El profesional no pertenece al tenant activo.');
  }
  if(body.encounterId){
    const encounterRows=await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM public."CareEncounter" WHERE "tenantId"=$1 AND "id"=$2 AND "patientId"=$3 LIMIT 1`,tenantId,body.encounterId,body.patientId);
    if(!encounterRows.length)throw new HttpError(422,'El encuentro no pertenece a la mascota activa.');
  }
  const orderNumber = referenceNumber('VET-LAB');
  const order = await prisma.$transaction(async (tx) => {
    const orderRows = await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."CareLabOrder" ("id","tenantId","patientId","encounterId","professionalId","orderNumber","status","priority","laboratory","specimenType","fasting","notes","orderedAt","createdAt","updatedAt")
      VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,'ordered',$6,$7,$8,$9,$10,now(),now(),now()) RETURNING *
    `, tenantId, body.patientId, body.encounterId || null, body.professionalId || null, orderNumber, body.priority, body.laboratory || null, body.specimenType || null, body.fasting, body.notes || null);
    const createdOrder = one(orderRows);
    for (const test of body.tests) {
      await tx.$executeRawUnsafe(`
        INSERT INTO public."CareLabResult" ("id","tenantId","labOrderId","testCode","testName","category","unit","referenceMin","referenceMax","referenceText","flag","createdAt")
        VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,'normal',now())
      `, tenantId, createdOrder.id, test.testCode || null, test.testName, test.category || null, test.unit || null, test.referenceMin ?? null, test.referenceMax ?? null, test.referenceText || null);
    }
    return createdOrder;
  });
  ok(res, order, 201);
}));

router.get('/lab-results', asyncHandler(async (req, res) => {
  const labOrderId = String(req.query.labOrderId || '');
  const patientId = String(req.query.patientId || '');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT r.*, o."orderNumber", o."patientId", o."status" AS "orderStatus", p."displayName" AS "patientName"
    FROM public."CareLabResult" r
    JOIN public."CareLabOrder" o ON o."id"=r."labOrderId" AND o."tenantId"=r."tenantId"
    JOIN public."CarePatient" p ON p."id"=o."patientId" AND p."tenantId"=o."tenantId" AND p."kind"='animal'
    WHERE r."tenantId"=$1 AND ($2='' OR r."labOrderId"=$2) AND ($3='' OR o."patientId"=$3)
    ORDER BY r."observedAt" DESC, r."testName" ASC LIMIT 2000
  `, ctx(req).tenantId, labOrderId, patientId);
  ok(res, rows);
}));

router.post('/lab-results', asyncHandler(async (req, res) => {
  const body = labResultSchema.parse(req.body || {});
  const tenantId=ctx(req).tenantId;
  const verifier=ctx(req).email||ctx(req).userId||null;

  const result=await prisma.$transaction(async (tx)=>{
    const orderRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id","status" FROM public."CareLabOrder"
      WHERE "tenantId"=$1 AND "id"=$2
      FOR UPDATE
    `,tenantId,body.labOrderId);
    const order=one(orderRows,'Orden de laboratorio no encontrada.');
    if(order.status==='cancelled')throw new HttpError(409,'La orden de laboratorio está cancelada.');
    if(order.status==='completed')throw new HttpError(409,'La orden de laboratorio ya está completada.');

    let rows:any[]=[];
    if(body.resultId){
      const targetRows=await tx.$queryRawUnsafe<any[]>(`
        SELECT "id","testCode","testName","category","unit","referenceMin","referenceMax","referenceText"
        FROM public."CareLabResult"
        WHERE "tenantId"=$1 AND "id"=$2 AND "labOrderId"=$3
          AND "valueNumeric" IS NULL
          AND COALESCE("valueText",'')=''
        FOR UPDATE
      `,tenantId,body.resultId,body.labOrderId);
      const target=one(targetRows,'Prueba ordenada no encontrada o ya fue informada.');
      const referenceMin=target.referenceMin===null||target.referenceMin===undefined?null:Number(target.referenceMin);
      const referenceMax=target.referenceMax===null||target.referenceMax===undefined?null:Number(target.referenceMax);
      const flag=inferFlag({
        valueNumeric:body.valueNumeric,
        valueText:body.valueText,
        referenceMin,
        referenceMax
      });

      rows=await tx.$queryRawUnsafe<any[]>(`
        UPDATE public."CareLabResult"
        SET "valueText"=$4,
            "valueNumeric"=$5,
            "flag"=$6,
            "observedAt"=COALESCE($7::timestamptz,now()),
            "verifiedBy"=$8,
            "notes"=$9,
            "attachmentPath"=$10
        WHERE "tenantId"=$1 AND "id"=$2 AND "labOrderId"=$3
          AND "valueNumeric" IS NULL
          AND COALESCE("valueText",'')=''
        RETURNING *
      `,tenantId,body.resultId,body.labOrderId,body.valueText||null,body.valueNumeric??null,flag,body.observedAt||null,verifier,body.notes||null,body.attachmentPath||null);
      if(!rows.length)throw new HttpError(409,'La prueba ya fue informada por otra operación.');
    }else{
      const flag=inferFlag(body);
      rows=await tx.$queryRawUnsafe<any[]>(`
        INSERT INTO public."CareLabResult" ("id","tenantId","labOrderId","testCode","testName","category","valueText","valueNumeric","unit","referenceMin","referenceMax","referenceText","flag","observedAt","verifiedBy","notes","attachmentPath","createdAt")
        VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,COALESCE($13::timestamptz,now()),$14,$15,$16,now())
        RETURNING *
      `,tenantId,body.labOrderId,body.testCode||null,body.testName,body.category||null,body.valueText||null,body.valueNumeric??null,body.unit||null,body.referenceMin??null,body.referenceMax??null,body.referenceText||null,flag,body.observedAt||null,verifier,body.notes||null,body.attachmentPath||null);
    }

    const pendingRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT count(*)::int AS "pendingCount"
      FROM public."CareLabResult"
      WHERE "tenantId"=$1 AND "labOrderId"=$2
        AND "valueNumeric" IS NULL
        AND COALESCE("valueText",'')=''
    `,tenantId,body.labOrderId);
    const pendingCount=Number(pendingRows[0]?.pendingCount||0);
    await tx.$executeRawUnsafe(`
      UPDATE public."CareLabOrder"
      SET "status"=$3,"updatedAt"=now()
      WHERE "id"=$1 AND "tenantId"=$2
    `,body.labOrderId,tenantId,pendingCount===0?'completed':'processing');

    return one(rows);
  });

  ok(res,result,201);
}));

router.get('/studies', asyncHandler(async (req, res) => {
  const patientId = String(req.query.patientId || '');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT s.*, p."displayName" AS "patientName", pr."fullName" AS "professionalName"
    FROM public."CareDiagnosticStudy" s JOIN public."CarePatient" p ON p."id"=s."patientId" AND p."kind"='animal'
    LEFT JOIN public."CareProfessional" pr ON pr."id"=s."professionalId"
    WHERE s."tenantId"=$1 AND ($2='' OR s."patientId"=$2)
    ORDER BY COALESCE(s."performedAt",s."scheduledAt",s."createdAt") DESC LIMIT 1000
  `, ctx(req).tenantId, patientId);
  ok(res, rows);
}));

router.post('/studies', asyncHandler(async (req, res) => {
  const b = studySchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareDiagnosticStudy" ("id","tenantId","patientId","encounterId","professionalId","kind","title","bodySite","status","scheduledAt","performedAt","findings","impression","attachmentPath","externalUrl","createdAt","updatedAt")
    SELECT gen_random_uuid()::text,$1,p."id",$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz,$11,$12,$13,$14,now(),now()
    FROM public."CarePatient" p WHERE p."id"=$2 AND p."tenantId"=$1 AND p."kind"='animal' RETURNING *
  `, ctx(req).tenantId, b.patientId, b.encounterId || null, b.professionalId || null, b.kind, b.title, b.bodySite || null, b.status, b.scheduledAt || null, b.performedAt || null, b.findings || null, b.impression || null, b.attachmentPath || null, b.externalUrl || null);
  ok(res, one(rows, 'Mascota no encontrada.'), 201);
}));

export default router;
