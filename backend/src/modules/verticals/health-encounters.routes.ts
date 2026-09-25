import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission } from '../../shared/middleware/context.js';
import { ctx, one } from './verticals.shared.js';
import {
  dentalTreatmentPlanClinicalDataSchema,
  treatmentPlanDecisionSchema,
  dentalEncounterWorkflowSchema,
  encounterSchema,
  dentalEncounterAmendmentSchema
} from './health.schemas.js';
import {
  dentalChangedFields,
  dentalSnapshot,
  normalizeDentalTreatmentDraft,
  normalizeDentalTreatmentPlan
} from './health.route-helpers.js';

const router = Router();

router.get('/health/encounters', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const patientId = String(req.query.patientId || '');
  if (!patientId) throw new HttpError(422, 'patientId es obligatorio.');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT e.*, pr."fullName" AS "professionalName" FROM public."CareEncounter" e
    LEFT JOIN public."CareProfessional" pr ON pr."id"=e."professionalId"
    WHERE e."tenantId"=$1 AND e."patientId"=$2 ORDER BY e."createdAt" DESC LIMIT 500
  `, ctx(req).tenantId, patientId);
  ok(res, rows);
}));

router.post('/health/encounters', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const tenantId=ctx(req).tenantId;
  const b = encounterSchema.parse(req.body || {});
  const patientRows=await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM public."CarePatient" WHERE "tenantId"=$1 AND "id"=$2 LIMIT 1`,tenantId,b.patientId);
  if(!patientRows.length)throw new HttpError(422,'El paciente no pertenece al tenant activo.');
  if(b.professionalId){
    const professionalRows=await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM public."CareProfessional" WHERE "tenantId"=$1 AND "id"=$2 LIMIT 1`,tenantId,b.professionalId);
    if(!professionalRows.length)throw new HttpError(422,'El profesional no pertenece al tenant activo.');
  }
  const actor={userId:ctx(req).userId||null,email:ctx(req).email||null};
  const clinicalData = b.type==='dental-treatment-plan'
    ? normalizeDentalTreatmentPlan(b.clinicalData)
    : b.type==='dental-treatment'
      ? normalizeDentalTreatmentDraft(b.clinicalData,actor)
      : b.clinicalData;
  const encounterStatus=b.type==='dental-treatment'?'draft':b.status;
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareEncounter" ("id","tenantId","patientId","professionalId","appointmentId","specialty","type","subjective","objective","assessment","plan","diagnosisCodes","clinicalData","confidential","status","signedAt","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,CASE WHEN $14='signed' THEN now() ELSE NULL END,now(),now()) RETURNING *
  `, tenantId,b.patientId,b.professionalId||null,b.appointmentId||null,b.specialty,b.type,b.subjective||null,b.objective||null,b.assessment||null,b.plan||null,JSON.stringify(b.diagnosisCodes),JSON.stringify(clinicalData),b.confidential,encounterStatus);
  ok(res, one(rows), 201);
}));

router.post('/health/encounters/:id/amend', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const tenantId = ctx(req).tenantId;
  const actorUserId = ctx(req).userId || null;
  const actorEmail = ctx(req).email || null;
  const encounterId = String(req.params.id || '');
  const b = dentalEncounterAmendmentSchema.parse(req.body || {});

  const amended = await prisma.$transaction(async (tx) => {
    const previousRows = await tx.$queryRawUnsafe<any[]>(`
      SELECT * FROM public."CareEncounter"
      WHERE "tenantId"=$1 AND "id"=$2
      FOR UPDATE
    `, tenantId, encounterId);
    const previous = one(previousRows, 'Encuentro odontológico no encontrado.');

    if (previous.type !== 'dental-treatment') throw new HttpError(422, 'Solo los tratamientos odontológicos admiten este flujo de enmienda.');
    if (previous.status !== 'signed') throw new HttpError(409, 'Solo la versión firmada vigente puede enmendarse.');

    const pendingAmendments=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id" FROM public."CareEncounter"
      WHERE "tenantId"=$1
        AND "patientId"=$2
        AND "type"='dental-treatment'
        AND "status" IN ('draft','review')
        AND "clinicalData"->'versioning'->>'previousEncounterId'=$3
      LIMIT 1
    `,tenantId,previous.patientId,previous.id);
    if(pendingAmendments.length) throw new HttpError(409,'Ya existe una enmienda pendiente para esta versión firmada.');

    const previousClinicalData = previous.clinicalData && typeof previous.clinicalData === 'object' ? previous.clinicalData : {};
    const beforeClinical = dentalSnapshot(previousClinicalData);
    const afterClinical = dentalSnapshot(b.clinicalData);
    const before = {
      ...beforeClinical,
      subjective:String(previous.subjective || ''),
      assessment:String(previous.assessment || ''),
      plan:String(previous.plan || '')
    };
    const after = {
      ...afterClinical,
      subjective:String(b.subjective ?? previous.subjective ?? ''),
      assessment:String(b.assessment ?? previous.assessment ?? ''),
      plan:String(b.plan ?? previous.plan ?? '')
    };
    const changedFields = dentalChangedFields(before, after);
    if (!changedFields.length) throw new HttpError(422, 'La enmienda debe contener al menos un cambio clínico.');

    const nextProfessionalId = b.professionalId === undefined ? previous.professionalId : b.professionalId;
    if (nextProfessionalId) {
      const professionalRows = await tx.$queryRawUnsafe<any[]>(`
        SELECT "id" FROM public."CareProfessional"
        WHERE "tenantId"=$1 AND "id"=$2
        LIMIT 1
      `, tenantId, nextProfessionalId);
      if (!professionalRows.length) throw new HttpError(422, 'El profesional no pertenece al tenant activo.');
    }

    const priorVersioning = previousClinicalData.versioning && typeof previousClinicalData.versioning === 'object'
      ? previousClinicalData.versioning
      : {};
    const revision = Math.max(1, Number(priorVersioning.revision || 1)) + 1;
    const draftCreatedAt = new Date().toISOString();
    const nextClinicalData = {
      ...b.clinicalData,
      versioning:{
        revision,
        rootEncounterId:String(priorVersioning.rootEncounterId || previous.id),
        previousEncounterId:previous.id,
        reason:b.reason,
        actor:{ userId:actorUserId, email:actorEmail },
        actorUserId,
        actorEmail,
        amendedAt:null,
        changedFields,
        before,
        after
      },
      lifecycle:{
        state:'draft',
        purpose:'amendment',
        previousEncounterId:previous.id,
        createdBy:{userId:actorUserId,email:actorEmail},
        createdAt:draftCreatedAt,
        workflowNote:'enmienda pendiente de revisión y firma'
      }
    };

    const created = await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."CareEncounter"
        ("id","tenantId","patientId","professionalId","appointmentId","specialty","type","subjective","objective","assessment","plan","diagnosisCodes","clinicalData","confidential","status","signedAt","createdAt","updatedAt")
      VALUES
        (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,'draft',NULL,now(),now())
      RETURNING *
    `,
      tenantId,
      previous.patientId,
      nextProfessionalId,
      previous.appointmentId,
      previous.specialty,
      previous.type,
      b.subjective ?? previous.subjective,
      `Pieza ${afterClinical.tooth}`,
      b.assessment ?? previous.assessment,
      b.plan ?? previous.plan,
      JSON.stringify(previous.diagnosisCodes || []),
      JSON.stringify(nextClinicalData),
      Boolean(previous.confidential)
    );
    return one(created);
  });

  ok(res, amended, 201);
}));

router.post('/health/encounters/:id/workflow', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const tenantId=ctx(req).tenantId;
  const actor={userId:ctx(req).userId||null,email:ctx(req).email||null};
  const encounterId=String(req.params.id||'');
  const b=dentalEncounterWorkflowSchema.parse(req.body||{});

  const transitioned=await prisma.$transaction(async (tx)=>{
    const rows=await tx.$queryRawUnsafe<any[]>(`
      SELECT * FROM public."CareEncounter"
      WHERE "tenantId"=$1 AND "id"=$2
      FOR UPDATE
    `,tenantId,encounterId);
    const previous=one(rows,'Encuentro odontológico no encontrado.');
    if(previous.type!=='dental-treatment')throw new HttpError(422,'Solo los tratamientos odontológicos usan este lifecycle.');

    const clinicalData=previous.clinicalData&&typeof previous.clinicalData==='object'?previous.clinicalData:{};
    const lifecycle=clinicalData.lifecycle&&typeof clinicalData.lifecycle==='object'?clinicalData.lifecycle:{};
    const changedAt=new Date().toISOString();

    if(b.action==='submit-review'){
      if(previous.status!=='draft')throw new HttpError(409,'Solo un borrador puede enviarse a revisión.');
      const nextClinicalData={
        ...clinicalData,
        lifecycle:{
          ...lifecycle,
          state:'review',
          reviewRequestedAt:changedAt,
          reviewRequestedBy:actor
        }
      };
      const updated=await tx.$queryRawUnsafe<any[]>(`
        UPDATE public."CareEncounter"
        SET "clinicalData"=$3::jsonb,"status"='review',"updatedAt"=now()
        WHERE "tenantId"=$1 AND "id"=$2 AND "status"='draft'
        RETURNING *
      `,tenantId,previous.id,JSON.stringify(nextClinicalData));
      return one(updated);
    }

    if(previous.status!=='review')throw new HttpError(409,'Solo una versión en revisión puede firmarse.');
    const previousEncounterId=String(
      clinicalData?.versioning?.previousEncounterId ||
      lifecycle?.previousEncounterId ||
      ''
    );

    if(previousEncounterId){
      const authorityRows=await tx.$queryRawUnsafe<any[]>(`
        SELECT * FROM public."CareEncounter"
        WHERE "tenantId"=$1 AND "patientId"=$2 AND "id"=$3
        FOR UPDATE
      `,tenantId,previous.patientId,previousEncounterId);
      const authority=one(authorityRows,'La versión firmada previa de la enmienda no existe.');
      if(authority.type!=='dental-treatment'||authority.status!=='signed'){
        throw new HttpError(409,'La versión previa ya no es la autoridad clínica firmada.');
      }
      await tx.$executeRawUnsafe(`
        UPDATE public."CareEncounter"
        SET "status"='amended',"updatedAt"=now()
        WHERE "tenantId"=$1 AND "id"=$2 AND "status"='signed'
      `,tenantId,authority.id);
    }

    const nextClinicalData={
      ...clinicalData,
      ...(previousEncounterId&&clinicalData.versioning&&typeof clinicalData.versioning==='object'
        ? {versioning:{...clinicalData.versioning,amendedAt:changedAt}}
        : {}),
      lifecycle:{
        ...lifecycle,
        state:'signed',
        signedAt:changedAt,
        signedBy:actor
      }
    };
    const updated=await tx.$queryRawUnsafe<any[]>(`
      UPDATE public."CareEncounter"
      SET "clinicalData"=$3::jsonb,"status"='signed',"signedAt"=now(),"updatedAt"=now()
      WHERE "tenantId"=$1 AND "id"=$2 AND "status"='review'
      RETURNING *
    `,tenantId,previous.id,JSON.stringify(nextClinicalData));
    return one(updated);
  });

  ok(res,transitioned);
}));

router.post('/health/encounters/:id/treatment-plan-decision', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const tenantId=ctx(req).tenantId;
  const actorUserId=ctx(req).userId||null;
  const actorEmail=ctx(req).email||null;
  const encounterId=String(req.params.id||'');
  const b=treatmentPlanDecisionSchema.parse(req.body||{});

  const decided=await prisma.$transaction(async (tx)=>{
    const rows=await tx.$queryRawUnsafe<any[]>(`
      SELECT * FROM public."CareEncounter"
      WHERE "tenantId"=$1 AND "id"=$2
      FOR UPDATE
    `,tenantId,encounterId);
    const previous=one(rows,'Plan de tratamiento no encontrado.');
    if(previous.type!=='dental-treatment-plan')throw new HttpError(422,'El encuentro no es un plan de tratamiento.');
    if(previous.status!=='draft')throw new HttpError(409,'El plan ya tiene una decisión terminal.');

    const clinicalData=dentalTreatmentPlanClinicalDataSchema.parse(previous.clinicalData||{});
    const decidedAt=new Date().toISOString();
    const nextStatus=b.decision==='accepted'?'signed':'cancelled';
    const nextClinicalData={
      ...clinicalData,
      treatmentPlan:{
        ...clinicalData.treatmentPlan,
        status:b.decision,
        acceptance:{
          status:b.decision,
          decidedAt,
          actor:{userId:actorUserId,email:actorEmail},
          actorUserId,
          actorEmail,
          reason:String(b.reason||'').trim()||null,
          evidence:'operational-decision-only'
        }
      }
    };

    const updated=await tx.$queryRawUnsafe<any[]>(`
      UPDATE public."CareEncounter"
      SET "clinicalData"=$3::jsonb,
          "status"=$4,
          "signedAt"=CASE WHEN $4='signed' THEN now() ELSE "signedAt" END,
          "updatedAt"=now()
      WHERE "tenantId"=$1 AND "id"=$2 AND "status"='draft'
      RETURNING *
    `,tenantId,previous.id,JSON.stringify(nextClinicalData),nextStatus);
    return one(updated);
  });

  ok(res,decided);
}));


export default router;
