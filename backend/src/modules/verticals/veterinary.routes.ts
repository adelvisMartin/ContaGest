import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';

const router = Router();
router.use(requireTenant, requirePermission('health.manage'));

const ctx = (req: any) => req.context as { tenantId: string; userId?: string; email?: string };
const optionalText = z.string().trim().max(4000).optional().nullable();
const optionalDate = z.string().trim().min(8).max(50).optional().nullable();
const one = <T>(rows: T[], message = 'Registro no encontrado.') => {
  if (!rows.length) throw new HttpError(404, message);
  return rows[0];
};
const referenceNumber = (prefix: string) => `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;

const labOrderSchema = z.object({
  patientId: z.string().min(10),
  encounterId: z.string().optional().nullable(),
  professionalId: z.string().optional().nullable(),
  priority: z.enum(['routine', 'urgent', 'stat']).default('routine'),
  laboratory: optionalText,
  specimenType: optionalText,
  fasting: z.boolean().default(false),
  notes: optionalText,
  tests: z.array(z.object({
    testCode: z.string().trim().max(80).optional().nullable(),
    testName: z.string().trim().min(2).max(180),
    category: z.string().trim().max(100).optional().nullable(),
    unit: z.string().trim().max(60).optional().nullable(),
    referenceMin: z.coerce.number().optional().nullable(),
    referenceMax: z.coerce.number().optional().nullable(),
    referenceText: z.string().trim().max(240).optional().nullable()
  })).min(1).max(100)
});

const labResultSchema = z.object({
  labOrderId: z.string().min(10),
  resultId: z.string().min(10).optional().nullable(),
  testCode: z.string().trim().max(80).optional().nullable(),
  testName: z.string().trim().min(2).max(180),
  category: z.string().trim().max(100).optional().nullable(),
  valueText: optionalText,
  valueNumeric: z.coerce.number().optional().nullable(),
  unit: z.string().trim().max(60).optional().nullable(),
  referenceMin: z.coerce.number().optional().nullable(),
  referenceMax: z.coerce.number().optional().nullable(),
  referenceText: z.string().trim().max(240).optional().nullable(),
  observedAt: optionalDate,
  notes: optionalText,
  attachmentPath: optionalText
}).superRefine((value, refinement) => {
  const hasText=Boolean(String(value.valueText||'').trim());
  const hasNumeric=value.valueNumeric!==null&&value.valueNumeric!==undefined;
  if(!hasText&&!hasNumeric) refinement.addIssue({code:'custom',path:['valueNumeric'],message:'El resultado requiere un valor numérico o textual.'});
  if(value.referenceMin!==null&&value.referenceMin!==undefined&&value.referenceMax!==null&&value.referenceMax!==undefined&&value.referenceMin>value.referenceMax){
    refinement.addIssue({code:'custom',path:['referenceMax'],message:'El máximo de referencia debe ser mayor o igual al mínimo.'});
  }
});

const studySchema = z.object({
  patientId: z.string().min(10),
  encounterId: z.string().optional().nullable(),
  professionalId: z.string().optional().nullable(),
  kind: z.enum(['xray', 'ultrasound', 'ct', 'mri', 'ecg', 'endoscopy', 'pathology', 'dental', 'other']).default('other'),
  title: z.string().trim().min(2).max(240),
  bodySite: optionalText,
  status: z.enum(['ordered', 'scheduled', 'in_progress', 'completed', 'cancelled']).default('ordered'),
  scheduledAt: optionalDate,
  performedAt: optionalDate,
  findings: optionalText,
  impression: optionalText,
  attachmentPath: optionalText,
  externalUrl: z.string().url().optional().nullable().or(z.literal(''))
});

const hospitalizationSchema = z.object({
  patientId: z.string().min(10),
  encounterId: z.string().optional().nullable(),
  professionalId: z.string().optional().nullable(),
  admittedAt: optionalDate,
  ward: optionalText,
  cage: optionalText,
  reason: z.string().trim().min(2).max(1000),
  diagnosis: optionalText,
  status: z.enum(['admitted', 'observed', 'discharged', 'transferred', 'cancelled']).default('admitted'),
  carePlan: z.record(z.string(), z.unknown()).default({})
});

const hospitalizationStatusSchema = z.object({
  status: z.enum(['admitted', 'observed', 'discharged', 'transferred', 'cancelled']),
  dischargedAt: optionalDate,
  diagnosis: optionalText
});

const observationSchema = z.object({
  hospitalizationId: z.string().min(10),
  professionalId: z.string().optional().nullable(),
  observedAt: optionalDate,
  type: z.enum(['vitals', 'medication', 'feeding', 'fluid', 'procedure', 'note', 'task']).default('note'),
  values: z.record(z.string(), z.unknown()).default({}),
  note: optionalText
});

const treatmentSheetEntrySchema = z.object({
  responsibleProfessionalId: z.string().min(10).optional().nullable(),
  category: z.enum(['medication','feeding','fluid','task','observation','vitals']),
  status: z.enum(['scheduled','completed','skipped','cancelled']).default('completed'),
  title: z.string().trim().min(2).max(240),
  scheduledAt: optionalDate,
  performedAt: optionalDate,
  note: optionalText,
  details: z.object({
    medication: optionalText,
    dose: optionalText,
    route: optionalText,
    food: optionalText,
    fluid: optionalText,
    amount: optionalText,
    unit: optionalText,
    rate: optionalText,
    temperature: optionalText,
    heartRate: optionalText,
    respiratoryRate: optionalText,
    weight: optionalText
  }).default({})
}).superRefine((value, refinement) => {
  const requireDetail=(field, message)=>{
    if(!String(value.details?.[field]||'').trim()) refinement.addIssue({code:'custom',path:['details',field],message});
  };
  if (value.status === 'scheduled' && !value.scheduledAt) {
    refinement.addIssue({ code:'custom', path:['scheduledAt'], message:'Una tarea programada requiere fecha/hora.' });
  }
  if(value.category==='medication'){
    requireDetail('medication','Indica el medicamento.');
    requireDetail('dose','Indica la dosis registrada manualmente.');
  }
  if(value.category==='feeding')requireDetail('food','Indica la alimentación.');
  if(value.category==='fluid')requireDetail('fluid','Indica el fluido.');
  if(value.category==='observation'&&!String(value.note||'').trim()){
    refinement.addIssue({code:'custom',path:['note'],message:'La observación no puede estar vacía.'});
  }
  if(value.category==='vitals'&&!['temperature','heartRate','respiratoryRate','weight'].some((key)=>String(value.details?.[key]||'').trim())){
    refinement.addIssue({code:'custom',path:['details'],message:'Registra al menos un signo vital.'});
  }
});

const procedureSchema = z.object({
  patientId: z.string().min(10),
  encounterId: z.string().optional().nullable(),
  professionalId: z.string().optional().nullable(),
  name: z.string().trim().min(2).max(240),
  kind: z.string().trim().min(2).max(120).default('procedure'),
  status: z.enum(['planned', 'scheduled', 'in_progress', 'completed', 'cancelled']).default('planned'),
  scheduledAt: optionalDate,
  performedAt: optionalDate,
  anesthesia: optionalText,
  notes: optionalText,
  outcome: optionalText
});

const communicationSchema = z.object({
  patientId: z.string().optional().nullable(),
  appointmentId: z.string().optional().nullable(),
  channel: z.enum(['whatsapp', 'email', 'sms', 'push']),
  event: z.string().trim().min(2).max(100),
  recipient: z.string().trim().min(3).max(240),
  templateId: z.string().optional().nullable(),
  status: z.enum(['queued', 'sent', 'delivered', 'failed', 'skipped']).default('queued'),
  scheduledAt: optionalDate,
  sentAt: optionalDate,
  providerMessageId: optionalText,
  payload: z.record(z.string(), z.unknown()).default({}),
  error: optionalText
});

const appointmentStatusSchema = z.object({
  status: z.enum(['scheduled', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show']),
  reminderStatus: z.enum(['pending', 'queued', 'sent', 'failed', 'skipped']).optional(),
  notes: optionalText
});

function inferFlag(body: Pick<z.infer<typeof labResultSchema>, 'valueNumeric'|'valueText'|'referenceMin'|'referenceMax'>) {
  if (body.valueNumeric !== null && body.valueNumeric !== undefined) {
    if (body.referenceMin !== null && body.referenceMin !== undefined && body.valueNumeric < body.referenceMin) return 'low';
    if (body.referenceMax !== null && body.referenceMax !== undefined && body.valueNumeric > body.referenceMax) return 'high';
    return 'normal';
  }
  // Text alone does not prove an abnormal result. Without an explicit typed
  // reference rule, keep the deterministic neutral flag instead of guessing.
  return 'normal';
}

router.get('/dashboard', asyncHandler(async (req, res) => {
  const tenantId = ctx(req).tenantId;
  const [patients, appointments, labOrders, criticalResults, hospitalizations, vaccines] = await Promise.all([
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total FROM public."CarePatient" WHERE "tenantId"=$1 AND "kind"='animal' AND "active"=true`, tenantId),
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total, count(*) FILTER (WHERE "status" IN ('scheduled','confirmed','checked_in'))::int AS pending FROM public."CareAppointment" a JOIN public."CarePatient" p ON p."id"=a."patientId" WHERE a."tenantId"=$1 AND p."kind"='animal' AND a."startsAt">=date_trunc('day',now()) AND a."startsAt"<date_trunc('day',now())+interval '1 day'`, tenantId),
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total FROM public."CareLabOrder" WHERE "tenantId"=$1 AND "status" NOT IN ('completed','cancelled')`, tenantId),
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total FROM public."CareLabResult" WHERE "tenantId"=$1 AND "flag" IN ('critical','high','low','abnormal') AND "observedAt">=now()-interval '30 days'`, tenantId),
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total FROM public."CareHospitalization" WHERE "tenantId"=$1 AND "status" IN ('admitted','observed')`, tenantId),
    prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total FROM public."CareImmunization" i JOIN public."CarePatient" p ON p."id"=i."patientId" WHERE i."tenantId"=$1 AND p."kind"='animal' AND i."nextDueAt" IS NOT NULL AND i."nextDueAt"<=now()+interval '30 days'`, tenantId)
  ]);
  ok(res, {
    patients: Number(patients[0]?.total || 0),
    appointmentsToday: appointments[0] || { total: 0, pending: 0 },
    pendingLabOrders: Number(labOrders[0]?.total || 0),
    abnormalResults: Number(criticalResults[0]?.total || 0),
    hospitalized: Number(hospitalizations[0]?.total || 0),
    vaccinesDue: Number(vaccines[0]?.total || 0)
  });
}));

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

router.get('/hospitalizations', asyncHandler(async (req, res) => {
  const patientId = String(req.query.patientId || '');
  const status = String(req.query.status || '');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT h.*, p."displayName" AS "patientName", p."species", p."breed", pr."fullName" AS "professionalName",
      count(o."id")::int AS "observationCount"
    FROM public."CareHospitalization" h JOIN public."CarePatient" p ON p."id"=h."patientId" AND p."kind"='animal'
    LEFT JOIN public."CareProfessional" pr ON pr."id"=h."professionalId" AND pr."tenantId"=h."tenantId"
    LEFT JOIN public."CareHospitalObservation" o ON o."hospitalizationId"=h."id"
    WHERE h."tenantId"=$1 AND ($2='' OR h."patientId"=$2) AND ($3='' OR h."status"=$3)
    GROUP BY h."id",p."displayName",p."species",p."breed",pr."fullName"
    ORDER BY h."admittedAt" DESC LIMIT 1000
  `, ctx(req).tenantId, patientId, status);
  ok(res, rows);
}));

router.post('/hospitalizations', asyncHandler(async (req, res) => {
  const b = hospitalizationSchema.parse(req.body || {});
  const tenantId=ctx(req).tenantId;
  if(b.professionalId){
    const professionals=await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM public."CareProfessional" WHERE "tenantId"=$1 AND "id"=$2 LIMIT 1`,tenantId,b.professionalId);
    if(!professionals.length)throw new HttpError(422,'El profesional no pertenece al tenant activo.');
  }
  if(b.encounterId){
    const encounters=await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM public."CareEncounter" WHERE "tenantId"=$1 AND "id"=$2 AND "patientId"=$3 LIMIT 1`,tenantId,b.encounterId,b.patientId);
    if(!encounters.length)throw new HttpError(422,'El encuentro no pertenece a la mascota hospitalizada.');
  }
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareHospitalization" ("id","tenantId","patientId","encounterId","professionalId","admissionNumber","admittedAt","ward","cage","reason","diagnosis","status","carePlan","createdAt","updatedAt")
    SELECT gen_random_uuid()::text,$1,p."id",$3,$4,$5,COALESCE($6::timestamptz,now()),$7,$8,$9,$10,$11,$12::jsonb,now(),now()
    FROM public."CarePatient" p WHERE p."id"=$2 AND p."tenantId"=$1 AND p."kind"='animal' RETURNING *
  `, ctx(req).tenantId, b.patientId, b.encounterId || null, b.professionalId || null, referenceNumber('VET-HOSP'), b.admittedAt || null, b.ward || null, b.cage || null, b.reason, b.diagnosis || null, b.status, JSON.stringify(b.carePlan));
  ok(res, one(rows, 'Mascota no encontrada.'), 201);
}));

router.patch('/hospitalizations/:id/status', asyncHandler(async (req, res) => {
  const b = hospitalizationStatusSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    UPDATE public."CareHospitalization" SET "status"=$3,"dischargedAt"=CASE WHEN $3='discharged' THEN COALESCE($4::timestamptz,now()) ELSE "dischargedAt" END,"diagnosis"=COALESCE($5,"diagnosis"),"updatedAt"=now()
    WHERE "id"=$1 AND "tenantId"=$2 RETURNING *
  `, req.params.id, ctx(req).tenantId, b.status, b.dischargedAt || null, b.diagnosis || null);
  ok(res, one(rows, 'Hospitalización no encontrada.'));
}));

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
      SELECT h."id",h."patientId",h."status"
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
    return {
      ...row,
      ...values,
      responsibleProfessionalId:row.professionalId
    };
  });

  ok(res,result,201);
}));
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
    FROM public."CareProcedure" c JOIN public."CarePatient" p ON p."id"=c."patientId" AND p."kind"='animal'
    LEFT JOIN public."CareProfessional" pr ON pr."id"=c."professionalId"
    WHERE c."tenantId"=$1 AND ($2='' OR c."patientId"=$2) ORDER BY COALESCE(c."performedAt",c."scheduledAt",c."createdAt") DESC LIMIT 1000
  `, ctx(req).tenantId, patientId);
  ok(res, rows);
}));

router.post('/procedures', asyncHandler(async (req, res) => {
  const b = procedureSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareProcedure" ("id","tenantId","patientId","encounterId","professionalId","name","kind","status","scheduledAt","performedAt","anesthesia","notes","outcome","createdAt","updatedAt")
    SELECT gen_random_uuid()::text,$1,p."id",$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz,$10,$11,$12,now(),now()
    FROM public."CarePatient" p WHERE p."id"=$2 AND p."tenantId"=$1 AND p."kind"='animal' RETURNING *
  `, ctx(req).tenantId, b.patientId, b.encounterId || null, b.professionalId || null, b.name, b.kind, b.status, b.scheduledAt || null, b.performedAt || null, b.anesthesia || null, b.notes || null, b.outcome || null);
  ok(res, one(rows, 'Mascota no encontrada.'), 201);
}));

router.get('/communications', asyncHandler(async (req, res) => {
  const patientId = String(req.query.patientId || '');
  const appointmentId = String(req.query.appointmentId || '');
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT l.*,p."displayName" AS "patientName" FROM public."CareCommunicationLog" l
    LEFT JOIN public."CarePatient" p ON p."id"=l."patientId"
    WHERE l."tenantId"=$1 AND ($2='' OR l."patientId"=$2) AND ($3='' OR l."appointmentId"=$3)
    ORDER BY l."createdAt" DESC LIMIT 1000
  `, ctx(req).tenantId, patientId, appointmentId);
  ok(res, rows);
}));

router.post('/communications', asyncHandler(async (req, res) => {
  const b = communicationSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    INSERT INTO public."CareCommunicationLog" ("id","tenantId","patientId","appointmentId","channel","event","recipient","templateId","status","scheduledAt","sentAt","providerMessageId","payload","error","createdAt")
    VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz,$11,$12::jsonb,$13,now()) RETURNING *
  `, ctx(req).tenantId, b.patientId || null, b.appointmentId || null, b.channel, b.event, b.recipient, b.templateId || null, b.status, b.scheduledAt || null, b.sentAt || null, b.providerMessageId || null, JSON.stringify(b.payload), b.error || null);
  ok(res, one(rows), 201);
}));

router.patch('/appointments/:id/status', asyncHandler(async (req, res) => {
  const b = appointmentStatusSchema.parse(req.body || {});
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    UPDATE public."CareAppointment" a SET "status"=$3,"reminderStatus"=COALESCE($4,"reminderStatus"),"notes"=COALESCE($5,"notes"),"updatedAt"=now()
    FROM public."CarePatient" p
    WHERE a."id"=$1 AND a."tenantId"=$2 AND p."id"=a."patientId" AND p."kind"='animal' RETURNING a.*
  `, req.params.id, ctx(req).tenantId, b.status, b.reminderStatus || null, b.notes || null);
  ok(res, one(rows, 'Cita veterinaria no encontrada.'));
}));

export default router;
