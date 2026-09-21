import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission } from '../../shared/middleware/context.js';
import { optionalText, dateText, jsonRecord, jsonArray, ctx, one, num } from './verticals.shared.js';

const router = Router();

const patientSchema = z.object({
  kind: z.enum(['human','animal']).default('human'),
  firstName: optionalText,
  lastName: optionalText,
  displayName: z.string().trim().min(2).max(180),
  idNumber: optionalText,
  birthDate: z.string().optional().nullable(),
  sex: optionalText,
  phone: optionalText,
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: optionalText,
  photoUrl: optionalText,
  species: optionalText,
  breed: optionalText,
  color: optionalText,
  microchip: optionalText,
  guardianName: optionalText,
  guardianPhone: optionalText,
  guardianEmail: z.string().email().optional().nullable().or(z.literal('')),
  emergencyContact: jsonRecord,
  allergies: optionalText,
  conditions: optionalText,
  notes: optionalText,
  active: z.boolean().default(true)
});

const professionalSchema = z.object({
  fullName: z.string().trim().min(2).max(180),
  specialty: z.string().trim().min(2).max(120).default('general'),
  licenseNumber: optionalText,
  email: z.string().email().optional().nullable().or(z.literal('')),
  phone: optionalText,
  status: z.enum(['active','inactive','vacation']).default('active'),
  schedule: jsonRecord
});

const appointmentSchema = z.object({
  patientId: z.string().min(10),
  professionalId: z.string().optional().nullable(),
  startsAt: dateText,
  endsAt: dateText,
  type: z.string().trim().max(120).default('consultation'),
  status: z.enum(['scheduled','confirmed','checked_in','in_progress','completed','cancelled','no_show']).default('scheduled'),
  reason: optionalText,
  channel: z.enum(['onsite','telemedicine','home_visit']).default('onsite'),
  room: optionalText,
  notes: optionalText
});

const DENTAL_PERMANENT_TEETH = new Set(['11','12','13','14','15','16','17','18','21','22','23','24','25','26','27','28','31','32','33','34','35','36','37','38','41','42','43','44','45','46','47','48']);
const DENTAL_PRIMARY_TEETH = new Set(['51','52','53','54','55','61','62','63','64','65','71','72','73','74','75','81','82','83','84','85']);
const dentalClinicalDataSchema = z.object({
  tooth: optionalText,
  procedure: optionalText,
  odontogram: z.object({
    dentition: z.enum(['permanent','primary']),
    tooth: z.string().trim().min(2).max(2),
    surfaces: z.array(z.enum(['vestibular','lingual_palatal','mesial','distal','occlusal_incisal'])).min(1).max(5),
    condition: z.string().trim().min(1).max(120)
  }).superRefine((value, refinement) => {
    const catalog = value.dentition === 'primary' ? DENTAL_PRIMARY_TEETH : DENTAL_PERMANENT_TEETH;
    if (!catalog.has(value.tooth)) refinement.addIssue({ code:'custom', path:['tooth'], message:'La pieza no pertenece a la dentición seleccionada.' });
  })
}).passthrough();

const PERIODONTAL_SITE_KEYS = ['mesiobuccal','midbuccal','distobuccal','mesiolingual','midlingual','distolingual'] as const;
const periodontalSiteSchema = z.object({
  site: z.enum(PERIODONTAL_SITE_KEYS),
  probingDepthMm: z.coerce.number().int().min(0).max(15),
  gingivalMarginMm: z.coerce.number().int().min(-10).max(20),
  bleeding: z.boolean(),
  suppuration: z.boolean(),
  plaque: z.boolean()
});
const periodontalClinicalDataSchema = z.object({
  periodontogram: z.object({
    dentition: z.enum(['permanent','primary']),
    tooth: z.string().trim().min(2).max(2),
    mobilityGrade: z.coerce.number().int().min(0).max(3),
    furcationGrade: z.coerce.number().int().min(0).max(3),
    sites: z.array(periodontalSiteSchema).length(6)
  }).superRefine((value, refinement) => {
    const catalog = value.dentition === 'primary' ? DENTAL_PRIMARY_TEETH : DENTAL_PERMANENT_TEETH;
    if (!catalog.has(value.tooth)) refinement.addIssue({ code:'custom', path:['tooth'], message:'La pieza no pertenece a la dentición seleccionada.' });
    const uniqueSites = new Set(value.sites.map((site) => site.site));
    if (uniqueSites.size !== PERIODONTAL_SITE_KEYS.length) refinement.addIssue({ code:'custom', path:['sites'], message:'El periodontograma requiere los seis sitios canónicos sin duplicados.' });
  }),
  notes: optionalText
}).passthrough();

const dentalMoneyText = z.string().trim().regex(/^\d+(?:\.\d{1,2})?$/, 'Monto inválido; usa máximo dos decimales.');
const dentalTreatmentProcedureSchema = z.object({
  name: z.string().trim().min(2).max(180),
  tooth: optionalText,
  quantity: z.coerce.number().int().min(1).max(99),
  unitPrice: dentalMoneyText
});
const dentalTreatmentPhaseSchema = z.object({
  order: z.coerce.number().int().min(1).max(50),
  name: z.string().trim().min(2).max(180),
  procedures: z.array(dentalTreatmentProcedureSchema).min(1).max(50)
});
const dentalTreatmentPlanClinicalDataSchema = z.object({
  treatmentPlan: z.object({
    diagnosis: z.string().trim().min(2).max(2000),
    alternatives: z.array(z.object({
      name:z.string().trim().min(2).max(180),
      description:optionalText
    })).min(1).max(12),
    phases: z.array(dentalTreatmentPhaseSchema).min(1).max(12),
    budget: z.object({
      currency:z.enum(['VES','USD']),
      estimatedTotal:dentalMoneyText.optional()
    }),
    status:z.literal('proposed').default('proposed'),
    acceptance:z.object({ status:z.literal('pending') }).default({status:'pending'})
  }).superRefine((value, refinement) => {
    const allTeeth = new Set([...DENTAL_PERMANENT_TEETH,...DENTAL_PRIMARY_TEETH]);
    value.phases.forEach((phase, phaseIndex) => phase.procedures.forEach((procedure, procedureIndex) => {
      const tooth = String(procedure.tooth || '').trim();
      if (tooth && !allTeeth.has(tooth)) refinement.addIssue({ code:'custom', path:['phases',phaseIndex,'procedures',procedureIndex,'tooth'], message:'La pieza indicada no es válida.' });
    }));
  })
}).passthrough();

const dentalMoneyCents = (value: unknown) => {
  const raw=String(value??'').trim();
  if(!/^\d+(?:\.\d{1,2})?$/.test(raw))throw new HttpError(422,'Monto estimado inválido.');
  const [whole,fraction='']=raw.split('.');
  return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
};
const dentalCentsMoney = (value: bigint) => `${value/100n}.${(value%100n).toString().padStart(2,'0')}`;
const normalizeDentalTreatmentPlan = (clinicalData: unknown) => {
  const parsed=dentalTreatmentPlanClinicalDataSchema.parse(clinicalData);
  const total=parsed.treatmentPlan.phases.reduce((phaseTotal,phase)=>phaseTotal+phase.procedures.reduce((procedureTotal,procedure)=>procedureTotal+(dentalMoneyCents(procedure.unitPrice)*BigInt(procedure.quantity)),0n),0n);
  return {
    ...parsed,
    treatmentPlan:{
      ...parsed.treatmentPlan,
      budget:{...parsed.treatmentPlan.budget,estimatedTotal:dentalCentsMoney(total)},
      status:'proposed',
      acceptance:{status:'pending'}
    }
  };
};

const treatmentPlanDecisionSchema = z.object({
  decision:z.enum(['accepted','rejected']),
  reason:optionalText
}).superRefine((value, refinement) => {
  if(value.decision==='rejected'&&!String(value.reason||'').trim()) refinement.addIssue({code:'custom',path:['reason'],message:'El rechazo requiere un motivo.'});
});

const dentalEncounterWorkflowSchema = z.object({
  action:z.enum(['submit-review','sign'])
});

const normalizeDentalTreatmentDraft = (clinicalData: unknown, actor: { userId:string|null; email:string|null }) => {
  const parsed=dentalClinicalDataSchema.parse(clinicalData);
  const createdAt=new Date().toISOString();
  return {
    ...parsed,
    lifecycle:{
      state:'draft',
      purpose:'treatment',
      createdBy:actor,
      createdAt
    }
  };
};

const encounterSchema = z.object({
  patientId: z.string().min(10),
  professionalId: z.string().optional().nullable(),
  appointmentId: z.string().optional().nullable(),
  specialty: z.string().trim().max(120).default('general'),
  type: z.string().trim().max(120).default('consultation'),
  subjective: optionalText,
  objective: optionalText,
  assessment: optionalText,
  plan: optionalText,
  diagnosisCodes: jsonArray,
  clinicalData: jsonRecord,
  confidential: z.boolean().default(false),
  status: z.enum(['draft','review','signed','amended','cancelled']).default('draft')
}).superRefine((value, refinement) => {
  if (value.type === 'dental-treatment') {
    const parsed = dentalClinicalDataSchema.safeParse(value.clinicalData);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) refinement.addIssue({ code:'custom', path:['clinicalData',...issue.path], message:issue.message });
    }
    if (value.status !== 'draft') refinement.addIssue({ code:'custom', path:['status'], message:'Los tratamientos odontológicos nuevos deben iniciar como borrador.' });
  }
  if (value.type === 'periodontal-chart') {
    const parsed = periodontalClinicalDataSchema.safeParse(value.clinicalData);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) refinement.addIssue({ code:'custom', path:['clinicalData',...issue.path], message:issue.message });
    }
  }
  if (value.type === 'dental-treatment-plan') {
    const parsed = dentalTreatmentPlanClinicalDataSchema.safeParse(value.clinicalData);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) refinement.addIssue({ code:'custom', path:['clinicalData',...issue.path], message:issue.message });
    }
    if(value.status!=='draft') refinement.addIssue({code:'custom',path:['status'],message:'Los planes nuevos deben iniciar como borrador propuesto.'});
  }
});

const dentalEncounterAmendmentSchema = z.object({
  reason: z.string().trim().min(5).max(500),
  professionalId: z.string().optional().nullable(),
  subjective: optionalText,
  assessment: optionalText,
  plan: optionalText,
  clinicalData: dentalClinicalDataSchema
});

const dentalSnapshot = (clinicalData: any) => {
  const source = clinicalData && typeof clinicalData === 'object' ? clinicalData : {};
  const odontogram = source.odontogram && typeof source.odontogram === 'object' ? source.odontogram : {};
  return {
    dentition:String(odontogram.dentition || ''),
    tooth:String(odontogram.tooth || source.tooth || ''),
    surfaces:Array.isArray(odontogram.surfaces) ? [...odontogram.surfaces].map(String).sort() : [],
    condition:String(odontogram.condition || ''),
    procedure:String(source.procedure || '')
  };
};

const dentalChangedFields = (before: Record<string, unknown>, after: Record<string, unknown>) =>
  Object.keys(after).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));

const measurementSchema = z.object({
  patientId: z.string().min(10),
  encounterId: z.string().optional().nullable(),
  kind: z.string().trim().min(1).max(100),
  value: z.coerce.number(),
  unit: z.string().trim().min(1).max(40),
  measuredAt: z.string().optional(),
  metadata: jsonRecord
});

const immunizationSchema = z.object({
  patientId: z.string().min(10),
  professionalId: z.string().optional().nullable(),
  vaccine: z.string().trim().min(2).max(180),
  dose: optionalText,
  lot: optionalText,
  administeredAt: z.string().optional(),
  nextDueAt: z.string().optional().nullable(),
  notes: optionalText
});

router.get('/health/summary', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const tenantId = ctx(req).tenantId;
  const [patients, appointments, dueVaccines, encounters] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total, count(*) FILTER (WHERE "kind"='animal')::int AS animals, count(*) FILTER (WHERE "kind"='human')::int AS humans FROM public."CarePatient" WHERE "tenantId"=$1 AND "active"=true`, tenantId),
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total, count(*) FILTER (WHERE "status" IN ('scheduled','confirmed'))::int AS upcoming FROM public."CareAppointment" WHERE "tenantId"=$1 AND "startsAt" >= date_trunc('day', now()) AND "startsAt" < date_trunc('day', now()) + interval '1 day'`, tenantId),
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total FROM public."CareImmunization" WHERE "tenantId"=$1 AND "nextDueAt" IS NOT NULL AND "nextDueAt" <= now() + interval '30 days'`, tenantId),
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total FROM public."CareEncounter" WHERE "tenantId"=$1 AND "createdAt" >= date_trunc('month', now())`, tenantId)
  ]);
  ok(res, { patients:patients[0] || {}, appointmentsToday:appointments[0] || {}, vaccinesDue:num(dueVaccines[0]?.total), encountersThisMonth:num(encounters[0]?.total) });
}));

router.get('/health/patients', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const tenantId = ctx(req).tenantId;
  const kind = ['human','animal'].includes(String(req.query.kind)) ? String(req.query.kind) : null;
  const q = `%${String(req.query.q || '').trim()}%`;
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT * FROM public."CarePatient"
    WHERE "tenantId"=$1 AND ($2::text IS NULL OR "kind"=$2)
      AND ($3='%%' OR "displayName" ILIKE $3 OR COALESCE("idNumber",'') ILIKE $3 OR COALESCE("guardianName",'') ILIKE $3)
    ORDER BY "active" DESC, "displayName" ASC LIMIT 500
  `, tenantId, kind, q);
  ok(res, rows);
}));

router.post('/health/patients', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const tenantId = ctx(req).tenantId;
  const b = patientSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CarePatient" ("id","tenantId","kind","firstName","lastName","displayName","idNumber","birthDate","sex","phone","email","address","photoUrl","species","breed","color","microchip","guardianName","guardianPhone","guardianEmail","emergencyContact","allergies","conditions","notes","active","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7::date,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21,$22,$23,$24,now(),now()) RETURNING *
  `, tenantId,b.kind,b.firstName||null,b.lastName||null,b.displayName,b.idNumber||null,b.birthDate||null,b.sex||null,b.phone||null,b.email||null,b.address||null,b.photoUrl||null,b.species||null,b.breed||null,b.color||null,b.microchip||null,b.guardianName||null,b.guardianPhone||null,b.guardianEmail||null,JSON.stringify(b.emergencyContact),b.allergies||null,b.conditions||null,b.notes||null,b.active);
  ok(res, one(rows), 201);
}));

router.get('/health/professionals', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT * FROM public."CareProfessional" WHERE "tenantId"=$1 ORDER BY "status", "fullName"`, ctx(req).tenantId);
  ok(res, rows);
}));

router.post('/health/professionals', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const b = professionalSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareProfessional" ("id","tenantId","userId","fullName","specialty","licenseNumber","email","phone","status","schedule","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,now(),now()) RETURNING *
  `, ctx(req).tenantId,ctx(req).userId||null,b.fullName,b.specialty,b.licenseNumber||null,b.email||null,b.phone||null,b.status,JSON.stringify(b.schedule));
  ok(res, one(rows), 201);
}));

router.get('/health/appointments', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const from = String(req.query.from || new Date(Date.now() - 86400000).toISOString());
  const to = String(req.query.to || new Date(Date.now() + 30 * 86400000).toISOString());
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT a.*, p."displayName" AS "patientName", p."kind" AS "patientKind", pr."fullName" AS "professionalName", pr."specialty"
    FROM public."CareAppointment" a
    JOIN public."CarePatient" p ON p."id"=a."patientId"
    LEFT JOIN public."CareProfessional" pr ON pr."id"=a."professionalId"
    WHERE a."tenantId"=$1 AND a."startsAt" BETWEEN $2::timestamptz AND $3::timestamptz
    ORDER BY a."startsAt" ASC LIMIT 1000
  `, ctx(req).tenantId, from, to);
  ok(res, rows);
}));

router.post('/health/appointments', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const b = appointmentSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareAppointment" ("id","tenantId","patientId","professionalId","startsAt","endsAt","type","status","reason","channel","room","reminderStatus","notes","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4::timestamptz,$5::timestamptz,$6,$7,$8,$9,$10,'pending',$11,now(),now()) RETURNING *
  `, ctx(req).tenantId,b.patientId,b.professionalId||null,b.startsAt,b.endsAt,b.type,b.status,b.reason||null,b.channel,b.room||null,b.notes||null);
  ok(res, one(rows), 201);
}));

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
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareEncounter" ("id","tenantId","patientId","professionalId","appointmentId","specialty","type","subjective","objective","assessment","plan","diagnosisCodes","clinicalData","confidential","status","signedAt","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,CASE WHEN $14='signed' THEN now() ELSE NULL END,now(),now()) RETURNING *
  `, tenantId,b.patientId,b.professionalId||null,b.appointmentId||null,b.specialty,b.type,b.subjective||null,b.objective||null,b.assessment||null,b.plan||null,JSON.stringify(b.diagnosisCodes),JSON.stringify(clinicalData),b.confidential,b.status);
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

router.post('/health/measurements', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const b = measurementSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareMeasurement" ("id","tenantId","patientId","encounterId","kind","value","unit","measuredAt","metadata")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz,now()),$8::jsonb) RETURNING *
  `, ctx(req).tenantId,b.patientId,b.encounterId||null,b.kind,b.value,b.unit,b.measuredAt||null,JSON.stringify(b.metadata));
  ok(res, one(rows), 201);
}));

router.post('/health/immunizations', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const b = immunizationSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareImmunization" ("id","tenantId","patientId","professionalId","vaccine","dose","lot","administeredAt","nextDueAt","notes","createdAt")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz,now()),$8::timestamptz,$9,now()) RETURNING *
  `, ctx(req).tenantId,b.patientId,b.professionalId||null,b.vaccine,b.dose||null,b.lot||null,b.administeredAt||null,b.nextDueAt||null,b.notes||null);
  ok(res, one(rows), 201);
}));

export default router;
