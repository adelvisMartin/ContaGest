import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { ctx, one } from './verticals.shared.js';
import {
  treatmentSheetEntrySchema,
  VETERINARY_TREATMENT_VITAL_UNITS,
  VETERINARY_TREATMENT_VITAL_KEYS
} from './veterinary.schemas.js';

const router = Router();

router.get('/hospitalizations/:id/treatment-sheet', asyncHandler(async (req, res) => {
  const tenantId=ctx(req).tenantId;
  const hospitalizationRows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id" FROM public."CareHospitalization"
    WHERE "tenantId"=$1 AND "id"=$2
    LIMIT 1
  `,tenantId,req.params.id);
  one(hospitalizationRows,'Hospitalización no encontrada.');

  const rows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT o.*,pr."fullName" AS "responsibleProfessionalName"
    FROM public."CareHospitalObservation" o
    LEFT JOIN public."CareProfessional" pr
      ON pr."id"=o."professionalId" AND pr."tenantId"=o."tenantId"
    WHERE o."tenantId"=$1
      AND o."hospitalizationId"=$2
      AND o."values"->>'treatmentSheetVersion'='1'
    ORDER BY o."observedAt" DESC,o."createdAt" DESC
    LIMIT 3000
  `,tenantId,req.params.id);

  ok(res,rows.map((row)=>({
    id:row.id,
    hospitalizationId:row.hospitalizationId,
    responsibleProfessionalId:row.professionalId,
    responsibleProfessionalName:row.responsibleProfessionalName||null,
    observedAt:row.observedAt,
    createdAt:row.createdAt,
    type:row.type,
    note:row.note,
    ...(row.values&&typeof row.values==='object'?row.values:{})
  })));
}));

router.post('/hospitalizations/:id/treatment-sheet', asyncHandler(async (req, res) => {
  const tenantId=ctx(req).tenantId;
  const body=treatmentSheetEntrySchema.parse(req.body||{});
  const now=new Date().toISOString();
  const result=await prisma.$transaction(async (tx)=>{
    const hospitalizationRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT h."id",h."patientId",h."encounterId",h."status"
      FROM public."CareHospitalization" h
      JOIN public."CarePatient" p
        ON p."id"=h."patientId" AND p."tenantId"=h."tenantId" AND p."kind"='animal'
      WHERE h."tenantId"=$1 AND h."id"=$2
      FOR UPDATE OF h
    `,tenantId,req.params.id);
    const hospitalization=one(hospitalizationRows,'Hospitalización no encontrada.');
    if(!['admitted','observed'].includes(String(hospitalization.status))){
      throw new HttpError(409,'La hospitalización ya no admite nuevas tareas o cuidados.');
    }

    if(body.responsibleProfessionalId){
      const professionals=await tx.$queryRawUnsafe<any[]>(`
        SELECT "id" FROM public."CareProfessional"
        WHERE "tenantId"=$1 AND "id"=$2
        LIMIT 1
      `,tenantId,body.responsibleProfessionalId);
      if(!professionals.length)throw new HttpError(422,'El profesional no pertenece al tenant activo.');
    }

    const scheduledAt=body.scheduledAt||null;
    const performedAt=body.status==='completed'?(body.performedAt||now):(body.performedAt||null);
    const observedAt=performedAt||scheduledAt||now;
    const type=body.category==='observation'?'note':body.category;
    const values={
      treatmentSheetVersion:'1',
      category:body.category,
      status:body.status,
      title:body.title,
      scheduledAt,
      performedAt,
      responsibleProfessionalId:body.responsibleProfessionalId||null,
      actorUserId:ctx(req).userId||null,
      actorEmail:ctx(req).email||null,
      details:body.details
    };

    const rows=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."CareHospitalObservation"
        ("id","tenantId","hospitalizationId","professionalId","observedAt","type","values","note","createdAt")
      VALUES
        (gen_random_uuid()::text,$1,$2,$3,$4::timestamptz,$5,$6::jsonb,$7,now())
      RETURNING *
    `,tenantId,hospitalization.id,body.responsibleProfessionalId||null,observedAt,type,JSON.stringify(values),body.note||null);

    const row=one(rows);

    if(body.category==='vitals'&&body.status==='completed'){
      const vitalEntries=VETERINARY_TREATMENT_VITAL_KEYS
        .map((detailKey)=>({
          detailKey,
          unit:VETERINARY_TREATMENT_VITAL_UNITS[detailKey],
          raw:String(body.details?.[detailKey]||'').trim()
        }))
        .filter((item)=>item.raw!=='');
      for(const item of vitalEntries){
        const kind=item.detailKey==='heartRate'
          ? 'heart_rate'
          : item.detailKey==='respiratoryRate'
            ? 'respiratory_rate'
            : item.detailKey;
        const metadata={
          source:'veterinary-treatment-sheet',
          sourceObservationId:row.id,
          hospitalizationId:hospitalization.id,
          treatmentSheetVersion:'1'
        };
        await tx.$queryRawUnsafe<any[]>(`
          INSERT INTO public."CareMeasurement"
            ("id","tenantId","patientId","encounterId","kind","value","unit","measuredAt","metadata")
          VALUES
            (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7::timestamptz,$8::jsonb)
          RETURNING "id"
        `,
          tenantId,
          hospitalization.patientId,
          hospitalization.encounterId||null,
          kind,
          Number(item.raw),
          item.unit,
          performedAt||observedAt,
          JSON.stringify(metadata)
        );
      }
    }

    return {
      ...row,
      ...values,
      responsibleProfessionalId:row.professionalId
    };
  });

  ok(res,result,201);
}));

export default router;
