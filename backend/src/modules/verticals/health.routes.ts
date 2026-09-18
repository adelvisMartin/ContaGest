import { randomUUID } from 'node:crypto';
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
  status: z.enum(['draft','signed','amended','cancelled']).default('draft')
}).superRefine((value, refinement) => {
  if (value.type === 'dental-treatment') {
    const parsed = dentalClinicalDataSchema.safeParse(value.clinicalData);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) refinement.addIssue({ code:'custom', path:['clinicalData',...issue.path], message:issue.message });
    }
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

const PERIODONTAL_SITES = ['mesiobuccal','buccal','distobuccal','mesiolingual','lingual','distolingual'] as const;
const periodontalSiteSchema = z.object({
  site: z.enum(PERIODONTAL_SITES),
  probingDepth: z.coerce.number().min(0).max(30),
  gingivalMargin: z.coerce.number().min(-30).max(30),
  clinicalAttachmentLevel: z.coerce.number().min(0).max(40),
  bleeding: z.boolean().default(false),
  suppuration: z.boolean().default(false),
  plaque: z.boolean().default(false)
});
const periodontalExamSchema = z.object({
  patientId: z.string().min(10),
  professionalId: z.string().min(10),
  dentition: z.enum(['permanent','primary']),
  tooth: z.string().trim().min(2).max(2),
  measuredAt: z.string().optional(),
  reason: z.string().trim().min(3).max(240),
  mobility: z.coerce.number().int().min(0).max(3).default(0),
  furcation: z.coerce.number().int().min(0).max(3).default(0),
  sites: z.array(periodontalSiteSchema).length(6)
}).superRefine((value, refinement) => {
  const catalog = value.dentition === 'primary' ? DENTAL_PRIMARY_TEETH : DENTAL_PERMANENT_TEETH;
  if (!catalog.has(value.tooth)) refinement.addIssue({ code:'custom', path:['tooth'], message:'La pieza no pertenece a la dentición seleccionada.' });
  const siteSet = new Set(value.sites.map((site) => site.site));
  if (siteSet.size !== PERIODONTAL_SITES.length || PERIODONTAL_SITES.some((site) => !siteSet.has(site))) {
    refinement.addIssue({ code:'custom', path:['sites'], message:'El periodontograma requiere exactamente los seis sitios canónicos.' });
  }
});

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
  const b = encounterSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareEncounter" ("id","tenantId","patientId","professionalId","appointmentId","specialty","type","subjective","objective","assessment","plan","diagnosisCodes","clinicalData","confidential","status","signedAt","createdAt","updatedAt")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,CASE WHEN $14='signed' THEN now() ELSE NULL END,now(),now()) RETURNING *
  `, ctx(req).tenantId,b.patientId,b.professionalId||null,b.appointmentId||null,b.specialty,b.type,b.subjective||null,b.objective||null,b.assessment||null,b.plan||null,JSON.stringify(b.diagnosisCodes),JSON.stringify(b.clinicalData),b.confidential,b.status);
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
    const amendedAt = new Date().toISOString();
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
        amendedAt,
        changedFields,
        before,
        after
      }
    };

    await tx.$executeRawUnsafe(`
      UPDATE public."CareEncounter"
      SET "status"='amended',"updatedAt"=now()
      WHERE "tenantId"=$1 AND "id"=$2 AND "status"='signed'
    `, tenantId, previous.id);

    const created = await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."CareEncounter"
        ("id","tenantId","patientId","professionalId","appointmentId","specialty","type","subjective","objective","assessment","plan","diagnosisCodes","clinicalData","confidential","status","signedAt","createdAt","updatedAt")
      VALUES
        (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,'signed',now(),now(),now())
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
