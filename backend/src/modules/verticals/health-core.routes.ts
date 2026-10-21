import { Router } from 'express';
import { createHash } from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission } from '../../shared/middleware/context.js';
import { ctx, one, num } from './verticals.shared.js';
import { parseCareAppointmentReadWindow } from './care-appointment-range.js';
import {
  patientSchema,
  professionalSchema,
  appointmentSchema,
  appointmentPatchSchema,
  ambulatoryCommandSchema,
  ambulatoryCompletionSchema
} from './health.schemas.js';
import { assertCareAppointmentTransition, assertCareAppointmentPatchTransition } from './care-appointment-transition.js';
import {
  ACTIVE_APPOINTMENT_STATUSES,
  assertAppointmentSlotAvailable,
  lockAppointmentSchedule
} from './health.route-helpers.js';

const router = Router();

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
  // Do not silently broaden patient queries when an invalid kind is supplied.
  const allowed=new Set(['kind','q']);
  if(Object.keys(req.query||{}).some(key=>!allowed.has(key)))throw new HttpError(422,'Filtros de pacientes inválidos.');
  const kindRaw=req.query.kind;
  if(kindRaw!==undefined&&(typeof kindRaw!=='string'||!['human','animal'].includes(kindRaw)))
    throw new HttpError(422,'Tipo de paciente inválido.');
  const qRaw=req.query.q;
  if(qRaw!==undefined&&(typeof qRaw!=='string'||qRaw.length>120||/[\u0000-\u001f\u007f]/.test(qRaw)))
    throw new HttpError(422,'Búsqueda de pacientes inválida.');
  const kind=kindRaw||null;
  const q=`%${(qRaw||'').trim()}%`;
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
  let range: ReturnType<typeof parseCareAppointmentReadWindow>;
  try { range=parseCareAppointmentReadWindow(req.query); }
  catch { throw new HttpError(422,'Los filtros de agenda no son válidos.'); }
  const {from,to,type}=range;
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT a.*, p."displayName" AS "patientName", p."kind" AS "patientKind", pr."fullName" AS "professionalName", pr."specialty"
    FROM public."CareAppointment" a
    JOIN public."CarePatient" p ON p."id"=a."patientId" AND p."tenantId"=a."tenantId"
    LEFT JOIN public."CareProfessional" pr ON pr."id"=a."professionalId" AND pr."tenantId"=a."tenantId"
    WHERE a."tenantId"=$1
      AND ($4::text='' OR a."type"=$4)
      AND (
        a."startsAt" BETWEEN $2::timestamptz AND $3::timestamptz
        OR (a."recallDueAt" IS NOT NULL AND a."recallDueAt" BETWEEN $2::timestamptz AND $3::timestamptz)
      )
    ORDER BY CASE WHEN a."status"='waitlisted' THEN 1 ELSE 0 END, a."startsAt" ASC
    LIMIT 1000
  `, ctx(req).tenantId, from, to, type);
  ok(res, rows);
}));

router.post('/health/appointments', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const tenantId=ctx(req).tenantId;
  const actor={userId:ctx(req).userId||null,email:ctx(req).email||null};
  const b = appointmentSchema.parse(req.body || {});
  if(!['scheduled','confirmed','waitlisted'].includes(b.status))throw new HttpError(422,'La cita debe empezar programada, confirmada o en espera.');
  const created=await prisma.$transaction(async (tx)=>{
    await lockAppointmentSchedule(tx,tenantId);
    const patientRows=await tx.$queryRawUnsafe<any[]>(`SELECT "id" FROM public."CarePatient" WHERE "tenantId"=$1 AND "id"=$2 AND "active"=true LIMIT 1`,tenantId,b.patientId);
    if(!patientRows.length)throw new HttpError(422,'El paciente no pertenece al tenant activo.');
    if(b.professionalId){
      const professionalRows=await tx.$queryRawUnsafe<any[]>(`SELECT "id" FROM public."CareProfessional" WHERE "tenantId"=$1 AND "id"=$2 AND "status"='active' LIMIT 1`,tenantId,b.professionalId);
      if(!professionalRows.length)throw new HttpError(422,'El profesional no está disponible en el tenant activo.');
    }
    if(b.status!=='waitlisted'){
      await assertAppointmentSlotAvailable(tx,{tenantId,patientId:b.patientId,professionalId:b.professionalId,startsAt:b.startsAt,endsAt:b.endsAt,room:b.room});
    }
    const schedulingMeta={
      createdAt:new Date().toISOString(),
      createdBy:actor,
      ...(b.status==='waitlisted'?{waitlist:{requestedAt:new Date().toISOString(),requestedBy:actor}}:{})
    };
    const rows = await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."CareAppointment"
        ("id","tenantId","patientId","professionalId","startsAt","endsAt","type","status","reason","channel","room","reminderStatus","recallDueAt","schedulingMeta","notes","createdAt","updatedAt")
      VALUES
        (gen_random_uuid()::text,$1,$2,$3,$4::timestamptz,$5::timestamptz,$6,$7,$8,$9,$10,'pending',$11::timestamptz,$12::jsonb,$13,now(),now())
      RETURNING *
    `,tenantId,b.patientId,b.professionalId||null,b.startsAt,b.endsAt,b.type,b.status,b.reason||null,b.channel,b.room||null,b.recallDueAt||null,JSON.stringify(schedulingMeta),b.notes||null);
    return one(rows);
  });
  ok(res, created, 201);
}));

router.patch('/health/appointments/:id', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const tenantId=ctx(req).tenantId;
  const actor={userId:ctx(req).userId||null,email:ctx(req).email||null};
  const appointmentId=String(req.params.id||'');
  const b=appointmentPatchSchema.parse(req.body||{});
  const updated=await prisma.$transaction(async (tx)=>{
    await lockAppointmentSchedule(tx,tenantId);
    const currentRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT * FROM public."CareAppointment"
      WHERE "tenantId"=$1 AND "id"=$2
      FOR UPDATE
    `,tenantId,appointmentId);
    const current=one(currentRows,'Cita no encontrada.');
    const startsAt=b.startsAt||new Date(current.startsAt).toISOString();
    const endsAt=b.endsAt||new Date(current.endsAt).toISOString();
    if(new Date(endsAt).getTime()<=new Date(startsAt).getTime())throw new HttpError(422,'La cita debe terminar después de comenzar.');
    const professionalId=b.professionalId===undefined?current.professionalId:b.professionalId;
    const room=b.room===undefined?current.room:b.room;
    const status=b.status||current.status;
    assertCareAppointmentPatchTransition(current.status, status);
    if(professionalId){
      const professionalRows=await tx.$queryRawUnsafe<any[]>(`SELECT "id" FROM public."CareProfessional" WHERE "tenantId"=$1 AND "id"=$2 AND "status"='active' LIMIT 1`,tenantId,professionalId);
      if(!professionalRows.length)throw new HttpError(422,'El profesional no está disponible en el tenant activo.');
    }
    if(ACTIVE_APPOINTMENT_STATUSES.includes(status as any)){
      await assertAppointmentSlotAvailable(tx,{tenantId,appointmentId,patientId:current.patientId,professionalId,startsAt,endsAt,room});
    }
    const now=new Date().toISOString();
    const previousMeta=current.schedulingMeta&&typeof current.schedulingMeta==='object'?current.schedulingMeta:{};
    const schedulingMeta={
      ...previousMeta,
      lastChangedAt:now,
      lastChangedBy:actor,
      ...(status==='confirmed'&&current.status!=='confirmed'?{confirmation:{confirmedAt:now,confirmedBy:actor}}:{}),
      ...(current.status==='waitlisted'&&status==='scheduled'?{waitlist:{...(previousMeta.waitlist||{}),convertedAt:now,convertedBy:actor}}:{}),
      ...(Object.prototype.hasOwnProperty.call(b,'recallDueAt')?{recall:{updatedAt:now,updatedBy:actor,dueAt:b.recallDueAt||null}}:{})
    };
    const rows=await tx.$queryRawUnsafe<any[]>(`
      UPDATE public."CareAppointment"
      SET "professionalId"=$3,
          "startsAt"=$4::timestamptz,
          "endsAt"=$5::timestamptz,
          "status"=$6,
          "reason"=$7,
          "room"=$8,
          "recallDueAt"=$9::timestamptz,
          "schedulingMeta"=$10::jsonb,
          "notes"=$11,
          "updatedAt"=now()
      WHERE "tenantId"=$1 AND "id"=$2
      RETURNING *
    `,tenantId,appointmentId,professionalId||null,startsAt,endsAt,status,b.reason===undefined?current.reason:b.reason||null,room||null,b.recallDueAt===undefined?current.recallDueAt:b.recallDueAt||null,JSON.stringify(schedulingMeta),b.notes===undefined?current.notes:b.notes||null);
    return one(rows);
  });
  ok(res,updated);
}));

router.post('/health/appointments/:id/check-in', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const tenantId = ctx(req).tenantId;
  const actorUserId = ctx(req).userId;
  if(!actorUserId)throw new HttpError(403,'Se requiere un operador autenticado.');
  const command = ambulatoryCommandSchema.parse(req.body || {});
  const appointmentId = String(req.params.id);
  const result = await prisma.$transaction(async (tx) => {
    const appointments = await tx.$queryRawUnsafe<any[]>(`
      SELECT * FROM public."CareAppointment"
      WHERE "tenantId"=$1 AND "id"=$2 FOR UPDATE
    `, tenantId, appointmentId);
    const appointment = one(appointments, 'Cita no encontrada.');
    const priorMeta = appointment.schedulingMeta && typeof appointment.schedulingMeta === 'object' ? appointment.schedulingMeta : {};
    const priorKey = priorMeta.checkIn?.idempotencyKey;
    if(priorKey) {
      if(priorKey !== command.idempotencyKey)throw new HttpError(409,'La cita ya tiene un check-in diferente.');
      return { appointment, replayed:true };
    }
    assertCareAppointmentTransition(appointment.status, 'checked_in');
    const patient = await tx.$queryRawUnsafe<any[]>(`
      SELECT "id" FROM public."CarePatient"
      WHERE "tenantId"=$1 AND "id"=$2 AND "active"=true LIMIT 1
    `, tenantId, appointment.patientId);
    if(!patient.length)throw new HttpError(422,'El paciente no pertenece al tenant o está inactivo.');
    const changedAt = new Date().toISOString();
    const meta = {...priorMeta,checkIn:{idempotencyKey:command.idempotencyKey,at:changedAt,byUserId:actorUserId}};
    const updated = await tx.$queryRawUnsafe<any[]>(`
      UPDATE public."CareAppointment" SET "status"='checked_in', "schedulingMeta"=$3::jsonb, "updatedAt"=now()
      WHERE "tenantId"=$1 AND "id"=$2 AND "status" IN ('scheduled','confirmed')
      RETURNING *
    `, tenantId, appointmentId, JSON.stringify(meta));
    return {appointment:one(updated), replayed:false};
  });
  res.setHeader('Idempotency-Replayed',result.replayed?'true':'false');
  res.setHeader('Cache-Control','no-store');
  ok(res,result.appointment);
}));

router.post('/health/appointments/:id/start-encounter', requirePermission('health.manage'), asyncHandler(async (req, res) => {
  const tenantId = ctx(req).tenantId;
  const actorUserId = ctx(req).userId;
  if(!actorUserId)throw new HttpError(403,'Se requiere un profesional autenticado.');
  const command = ambulatoryCommandSchema.parse(req.body || {});
  const appointmentId = String(req.params.id);
  const result = await prisma.$transaction(async (tx) => {
    const appointments = await tx.$queryRawUnsafe<any[]>(`
      SELECT * FROM public."CareAppointment"
      WHERE "tenantId"=$1 AND "id"=$2 FOR UPDATE
    `,tenantId,appointmentId);
    const appointment = one(appointments,'Cita no encontrada.');
    const existing = await tx.$queryRawUnsafe<any[]>(`
      SELECT "id", "patientId", "professionalId", "clinicalData", "status"
      FROM public."CareEncounter"
      WHERE "tenantId"=$1 AND "appointmentId"=$2 AND "type"='ambulatory-visit'
      LIMIT 1
    `,tenantId,appointmentId);
    if(existing.length){
      if(existing[0].clinicalData?.workflow?.startIdempotencyKey !== command.idempotencyKey){
        throw new HttpError(409,'La cita ya tiene otro encuentro ambulatorio.');
      }
      return {encounter:existing[0],appointment,replayed:true};
    }
    assertCareAppointmentTransition(appointment.status,'in_progress');
    if(!appointment.professionalId)throw new HttpError(422,'Asigna un profesional antes de iniciar la consulta.');
    const patient = await tx.$queryRawUnsafe<any[]>(`
      SELECT "id" FROM public."CarePatient" WHERE "tenantId"=$1 AND "id"=$2 AND "active"=true LIMIT 1
    `,tenantId,appointment.patientId);
    if(!patient.length)throw new HttpError(422,'El paciente no pertenece al tenant o está inactivo.');
    const professional = await tx.$queryRawUnsafe<any[]>(`
      SELECT "id" FROM public."CareProfessional"
      WHERE "tenantId"=$1 AND "id"=$2 AND "userId"=$3
        AND "status"='active' AND NULLIF(trim("licenseNumber"),'') IS NOT NULL LIMIT 1
    `,tenantId,appointment.professionalId,actorUserId);
    if(!professional.length)throw new HttpError(403,'Solo el profesional activo y matriculado asignado puede iniciar esta consulta.');
    const changedAt = new Date().toISOString();
    const meta = appointment.schedulingMeta && typeof appointment.schedulingMeta === 'object' ? appointment.schedulingMeta : {};
    const workflow = {startIdempotencyKey:command.idempotencyKey,startedAt:changedAt,startedByUserId:actorUserId};
    const encounters = await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."CareEncounter"
        ("tenantId","patientId","professionalId","appointmentId","type","specialty","subjective","status","clinicalData")
      VALUES ($1,$2,$3,$4,'ambulatory-visit','general',$5,'draft',$6::jsonb)
      RETURNING *
    `,tenantId,appointment.patientId,appointment.professionalId,appointment.id,appointment.reason||null,JSON.stringify({workflow}));
    const updated = await tx.$queryRawUnsafe<any[]>(`
      UPDATE public."CareAppointment"
      SET "status"='in_progress',"schedulingMeta"=$3::jsonb,"updatedAt"=now()
      WHERE "tenantId"=$1 AND "id"=$2 AND "status"='checked_in' RETURNING *
    `,tenantId,appointmentId,JSON.stringify({...meta,encounterStart:workflow}));
    return {encounter:one(encounters),appointment:one(updated),replayed:false};
  });
  res.setHeader('Idempotency-Replayed',result.replayed?'true':'false');
  res.setHeader('Cache-Control','no-store');
  ok(res,result,result.replayed?200:201);
}));

router.post('/health/appointments/:id/complete-encounter', requirePermission('health.manage'), asyncHandler(async (req,res)=>{
  const tenantId=ctx(req).tenantId;
  const actorUserId=ctx(req).userId;
  if(!actorUserId)throw new HttpError(403,'Se requiere el profesional autenticado.');
  const command=ambulatoryCompletionSchema.parse(req.body||{});
  const appointmentId=String(req.params.id);
  const digest=createHash('sha256').update(JSON.stringify(command)).digest('hex');
  const result=await prisma.$transaction(async(tx)=>{
    const appointments=await tx.$queryRawUnsafe<any[]>(`
      SELECT * FROM public."CareAppointment" WHERE "tenantId"=$1 AND "id"=$2 FOR UPDATE
    `,tenantId,appointmentId);
    const appointment=one(appointments,'Cita no encontrada.');
    const rows=await tx.$queryRawUnsafe<any[]>(`
      SELECT * FROM public."CareEncounter"
      WHERE "tenantId"=$1 AND "appointmentId"=$2 AND "patientId"=$3
        AND "type"='ambulatory-visit' FOR UPDATE
    `,tenantId,appointmentId,appointment.patientId);
    const encounter=one(rows,'No existe una consulta ambulatoria iniciada.');
    const workflow=encounter.clinicalData?.workflow||{};
    if(encounter.status==='signed'){
      if(workflow.completeIdempotencyKey!==command.idempotencyKey || workflow.completionDigest!==digest)
        throw new HttpError(409,'El alta ya se registró con otro contenido o solicitud.');
      return {encounter,appointment,replayed:true};
    }
    if(appointment.status!=='in_progress'||encounter.status!=='draft')
      throw new HttpError(409,'El alta requiere cita en curso y nota clínica en borrador.');
    assertCareAppointmentTransition(appointment.status,'completed');
    const professional=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id" FROM public."CareProfessional"
      WHERE "tenantId"=$1 AND "id"=$2 AND "userId"=$3 AND "status"='active'
        AND NULLIF(trim("licenseNumber"),'') IS NOT NULL LIMIT 1
    `,tenantId,encounter.professionalId,actorUserId);
    if(!professional.length)throw new HttpError(403,'Solo el profesional asignado y matriculado puede firmar el alta.');
    const signedAt=new Date().toISOString();
    const nextClinicalData={...encounter.clinicalData,workflow:{...workflow,
      completeIdempotencyKey:command.idempotencyKey,completionDigest:digest,
      completedAt:signedAt,completedByUserId:actorUserId,
      billingStatus:'pending'
    }};
    const signed=await tx.$queryRawUnsafe<any[]>(`
      UPDATE public."CareEncounter"
      SET "subjective"=$3,"objective"=$4,"assessment"=$5,"plan"=$6,
          "diagnosisCodes"=$7::jsonb,"clinicalData"=$8::jsonb,
          "status"='signed',"signedAt"=now(),"updatedAt"=now()
      WHERE "tenantId"=$1 AND "id"=$2 AND "status"='draft' RETURNING *
    `,tenantId,encounter.id,command.subjective||null,command.objective||null,
      command.assessment,command.plan,JSON.stringify(command.diagnosisCodes),JSON.stringify(nextClinicalData));
    const updated=await tx.$queryRawUnsafe<any[]>(`
      UPDATE public."CareAppointment"
      SET "status"='completed',"schedulingMeta"=$3::jsonb,"updatedAt"=now()
      WHERE "tenantId"=$1 AND "id"=$2 AND "status"='in_progress' RETURNING *
    `,tenantId,appointment.id,JSON.stringify({...(appointment.schedulingMeta||{}),
      discharge:{at:signedAt,byUserId:actorUserId,encounterId:encounter.id,billingStatus:'pending'}}));
    return {encounter:one(signed),appointment:one(updated),replayed:false};
  });
  res.setHeader('Idempotency-Replayed',result.replayed?'true':'false');
  res.setHeader('Cache-Control','no-store');
  ok(res,result);
}));


export default router;
