import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission } from '../../shared/middleware/context.js';
import { writeAudit } from '../../shared/services/audit.service.js';
import { ctx, one } from './verticals.shared.js';
import {
  veterinaryBoardingSettingsSchema,
  veterinaryBoardingResourceSchema,
  veterinaryBoardingResourceStatusSchema,
  veterinaryBoardingAvailabilityQuerySchema,
  veterinaryBoardingStayQuerySchema,
  veterinaryBoardingStaySchema,
  veterinaryBoardingStayTransitionSchema
} from './veterinary.schemas.js';

const router = Router();

const assertBoardingEnabled=async(db:any,tenantId:string)=>{
  const rows:any[]=await db.$queryRawUnsafe(`
    SELECT "enabled"
    FROM public."VeterinaryBoardingSetting"
    WHERE "tenantId"=$1
    LIMIT 1
  `,tenantId);
  if(!rows[0]?.enabled)throw new HttpError(409,'El módulo opcional de estancia veterinaria no está habilitado.');
};

router.get('/boarding/settings', asyncHandler(async (req,res)=>{
  const tenantId=ctx(req).tenantId;
  const rows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT "enabled","updatedBy","updatedAt"
    FROM public."VeterinaryBoardingSetting"
    WHERE "tenantId"=$1
    LIMIT 1
  `,tenantId);
  ok(res,rows[0]||{enabled:false,updatedBy:null,updatedAt:null});
}));

router.patch('/boarding/settings', requirePermission('admin.manage'), asyncHandler(async (req,res)=>{
  const tenantId=ctx(req).tenantId;
  const actorUserId=String(ctx(req).userId||'').trim();
  if(!actorUserId)throw new HttpError(401,'Cambiar el módulo de estancia requiere un actor autenticado.');
  const body=veterinaryBoardingSettingsSchema.parse(req.body||{});
  const setting=await prisma.$transaction(async(tx)=>{
    await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,`veterinary-boarding-settings:${tenantId}`);
    if(!body.enabled){
      const active=await tx.$queryRawUnsafe<any[]>(`
        SELECT "id"
        FROM public."VeterinaryBoardingStay"
        WHERE "tenantId"=$1 AND "status" IN ('reserved','checked_in')
        LIMIT 1
        FOR UPDATE
      `,tenantId);
      if(active.length)throw new HttpError(409,'No se puede desactivar estancia mientras existan reservas o ingresos activos.');
    }
    const rows=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."VeterinaryBoardingSetting" ("tenantId","enabled","updatedBy","updatedAt")
      VALUES ($1,$2,$3,now())
      ON CONFLICT ("tenantId")
      DO UPDATE SET "enabled"=EXCLUDED."enabled","updatedBy"=EXCLUDED."updatedBy","updatedAt"=now()
      RETURNING *
    `,tenantId,body.enabled,actorUserId);
    return one(rows);
  });
  await writeAudit({
    tenantId,userId:actorUserId,
    action:'veterinary.boarding.settings.updated',
    entity:'VeterinaryBoardingSetting',entityId:tenantId,
    after:{enabled:Boolean(setting.enabled)}
  });
  ok(res,setting);
}));

router.get('/boarding/resources', asyncHandler(async (req,res)=>{
  const tenantId=ctx(req).tenantId;
  const query=veterinaryBoardingAvailabilityQuerySchema.parse(req.query||{});
  const settingRows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT "enabled" FROM public."VeterinaryBoardingSetting" WHERE "tenantId"=$1 LIMIT 1
  `,tenantId);
  const enabled=Boolean(settingRows[0]?.enabled);
  if(!enabled)return ok(res,{enabled:false,window:{from:query.from,to:query.to},resources:[]});
  const [resources,stays]=await Promise.all([
    prisma.$queryRawUnsafe<any[]>(`
      SELECT "id","code","name","type","location","status","notes","createdAt","updatedAt"
      FROM public."VeterinaryBoardingResource"
      WHERE "tenantId"=$1
      ORDER BY CASE "status" WHEN 'active' THEN 0 WHEN 'maintenance' THEN 1 ELSE 2 END, lower("name"),"code"
      LIMIT 1000
    `,tenantId),
    prisma.$queryRawUnsafe<any[]>(`
      SELECT s."id",s."resourceId",s."patientId",s."startsAt",s."plannedEndsAt",s."endedAt",s."status",
             p."displayName" AS "patientName"
      FROM public."VeterinaryBoardingStay" s
      JOIN public."CarePatient" p
        ON p."tenantId"=s."tenantId" AND p."id"=s."patientId" AND p."kind"='animal'
      WHERE s."tenantId"=$1
        AND s."status" IN ('reserved','checked_in')
        AND s."startsAt" < $3::timestamptz
        AND COALESCE(s."endedAt",s."plannedEndsAt") > $2::timestamptz
      ORDER BY s."startsAt",s."createdAt"
    `,tenantId,query.from,query.to)
  ]);
  const stayByResource=new Map(stays.map((stay)=>[String(stay.resourceId),stay]));
  ok(res,{
    enabled:true,
    window:{from:query.from,to:query.to},
    resources:resources.map((resource)=>{
      const occupancy=stayByResource.get(String(resource.id))||null;
      return {...resource,available:resource.status==='active'&&!occupancy,occupancy};
    })
  });
}));

router.post('/boarding/resources', asyncHandler(async (req,res)=>{
  const tenantId=ctx(req).tenantId;
  const actorUserId=String(ctx(req).userId||'').trim();
  if(!actorUserId)throw new HttpError(401,'Crear un recurso de estancia requiere un actor autenticado.');
  await assertBoardingEnabled(prisma,tenantId);
  const body=veterinaryBoardingResourceSchema.parse(req.body||{});
  const result=await prisma.$transaction(async (tx)=>{
    const code=body.code.toUpperCase();
    await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,`veterinary-boarding-resource:${tenantId}:${code}`);
    const existing=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id" FROM public."VeterinaryBoardingResource"
      WHERE "tenantId"=$1 AND upper("code")=$2
      LIMIT 1
      FOR UPDATE
    `,tenantId,code);
    if(existing.length)throw new HttpError(409,'Ya existe un recurso de estancia con ese código.');
    const rows=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."VeterinaryBoardingResource"
        ("id","tenantId","code","name","type","location","status","notes","createdAt","updatedAt")
      VALUES
        (gen_random_uuid()::text,$1,$2,$3,$4,$5,'active',$6,now(),now())
      RETURNING *
    `,tenantId,code,body.name,body.type,body.location||null,body.notes||null);
    return one(rows);
  });
  await writeAudit({
    tenantId,userId:actorUserId,
    action:'veterinary.boarding.resource.created',
    entity:'VeterinaryBoardingResource',entityId:result.id,
    after:{code:result.code,name:result.name,type:result.type,status:result.status}
  });
  ok(res,result,201);
}));

router.patch('/boarding/resources/:id/status', asyncHandler(async (req,res)=>{
  const tenantId=ctx(req).tenantId;
  const actorUserId=String(ctx(req).userId||'').trim();
  if(!actorUserId)throw new HttpError(401,'Cambiar un recurso de estancia requiere un actor autenticado.');
  await assertBoardingEnabled(prisma,tenantId);
  const body=veterinaryBoardingResourceStatusSchema.parse(req.body||{});
  const result=await prisma.$transaction(async (tx)=>{
    await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,`veterinary-boarding-resource:${tenantId}:${req.params.id}`);
    const resourceRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT * FROM public."VeterinaryBoardingResource"
      WHERE "tenantId"=$1 AND "id"=$2
      LIMIT 1
      FOR UPDATE
    `,tenantId,req.params.id);
    const resource=one(resourceRows,'Recurso de estancia no encontrado.');
    if(body.status!=='active'){
      const active=await tx.$queryRawUnsafe<any[]>(`
        SELECT "id" FROM public."VeterinaryBoardingStay"
        WHERE "tenantId"=$1 AND "resourceId"=$2
          AND "status" IN ('reserved','checked_in')
          AND COALESCE("endedAt","plannedEndsAt") > now()
        LIMIT 1
      `,tenantId,resource.id);
      if(active.length)throw new HttpError(409,'No se puede desactivar un recurso con una estancia activa o reservada.');
    }
    const rows=await tx.$queryRawUnsafe<any[]>(`
      UPDATE public."VeterinaryBoardingResource"
      SET "status"=$3,"updatedAt"=now()
      WHERE "tenantId"=$1 AND "id"=$2
      RETURNING *
    `,tenantId,resource.id,body.status);
    return {before:resource,after:one(rows)};
  });
  await writeAudit({
    tenantId,userId:actorUserId,
    action:'veterinary.boarding.resource.status_changed',
    entity:'VeterinaryBoardingResource',entityId:result.after.id,
    before:{status:result.before.status},after:{status:result.after.status}
  });
  ok(res,result.after);
}));

router.get('/boarding/stays', asyncHandler(async (req,res)=>{
  const tenantId=ctx(req).tenantId;
  await assertBoardingEnabled(prisma,tenantId);
  const query=veterinaryBoardingStayQuerySchema.parse(req.query||{});
  const rows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT s.*,p."displayName" AS "patientName",p."species",p."breed",
           r."code" AS "resourceCode",r."name" AS "resourceName",r."type" AS "resourceType"
    FROM public."VeterinaryBoardingStay" s
    JOIN public."CarePatient" p
      ON p."tenantId"=s."tenantId" AND p."id"=s."patientId" AND p."kind"='animal'
    JOIN public."VeterinaryBoardingResource" r
      ON r."tenantId"=s."tenantId" AND r."id"=s."resourceId"
    WHERE s."tenantId"=$1
      AND ($2::text IS NULL OR s."patientId"=$2)
      AND ($3::text IS NULL OR s."status"=$3)
    ORDER BY CASE s."status" WHEN 'checked_in' THEN 0 WHEN 'reserved' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END,
             s."startsAt" DESC,s."createdAt" DESC
    LIMIT 2000
  `,tenantId,query.patientId||null,query.status||null);
  ok(res,rows);
}));

router.post('/boarding/stays', asyncHandler(async (req,res)=>{
  const tenantId=ctx(req).tenantId;
  const actorUserId=String(ctx(req).userId||'').trim();
  if(!actorUserId)throw new HttpError(401,'Reservar una estancia requiere un actor autenticado.');
  await assertBoardingEnabled(prisma,tenantId);
  const body=veterinaryBoardingStaySchema.parse(req.body||{});
  const result=await prisma.$transaction(async (tx)=>{
    await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,`veterinary-boarding-resource:${tenantId}:${body.resourceId}`);
    await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,`veterinary-boarding-patient:${tenantId}:${body.patientId}`);
    const patientRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id","displayName" FROM public."CarePatient"
      WHERE "tenantId"=$1 AND "id"=$2 AND "kind"='animal' AND "active"=true
      LIMIT 1
      FOR SHARE
    `,tenantId,body.patientId);
    const patient=one(patientRows,'Mascota activa no encontrada.');
    const resourceRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT * FROM public."VeterinaryBoardingResource"
      WHERE "tenantId"=$1 AND "id"=$2
      LIMIT 1
      FOR UPDATE
    `,tenantId,body.resourceId);
    const resource=one(resourceRows,'Recurso de estancia no encontrado.');
    if(resource.status!=='active')throw new HttpError(409,'El recurso seleccionado no está disponible para nuevas estancias.');
    const resourceConflict=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id" FROM public."VeterinaryBoardingStay"
      WHERE "tenantId"=$1 AND "resourceId"=$2
        AND "status" IN ('reserved','checked_in')
        AND "startsAt" < $4::timestamptz
        AND COALESCE("endedAt","plannedEndsAt") > $3::timestamptz
      LIMIT 1
      FOR UPDATE
    `,tenantId,resource.id,body.startsAt,body.plannedEndsAt);
    if(resourceConflict.length)throw new HttpError(409,'El recurso ya tiene una estancia solapada en ese horario.');
    const patientConflict=await tx.$queryRawUnsafe<any[]>(`
      SELECT "id" FROM public."VeterinaryBoardingStay"
      WHERE "tenantId"=$1 AND "patientId"=$2
        AND "status" IN ('reserved','checked_in')
        AND "startsAt" < $4::timestamptz
        AND COALESCE("endedAt","plannedEndsAt") > $3::timestamptz
      LIMIT 1
      FOR UPDATE
    `,tenantId,patient.id,body.startsAt,body.plannedEndsAt);
    if(patientConflict.length)throw new HttpError(409,'La mascota ya tiene una estancia solapada en ese horario.');
    const rows=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."VeterinaryBoardingStay"
        ("id","tenantId","patientId","resourceId","startsAt","plannedEndsAt","status","notes","createdBy","createdAt","updatedAt")
      VALUES
        (gen_random_uuid()::text,$1,$2,$3,$4::timestamptz,$5::timestamptz,'reserved',$6,$7,now(),now())
      RETURNING *
    `,tenantId,patient.id,resource.id,body.startsAt,body.plannedEndsAt,body.notes||null,actorUserId);
    return {...one(rows),patientName:patient.displayName,resourceCode:resource.code,resourceName:resource.name};
  });
  await writeAudit({
    tenantId,userId:actorUserId,
    action:'veterinary.boarding.stay.reserved',
    entity:'VeterinaryBoardingStay',entityId:result.id,
    after:{patientId:result.patientId,resourceId:result.resourceId,startsAt:result.startsAt,plannedEndsAt:result.plannedEndsAt,status:'reserved'}
  });
  ok(res,result,201);
}));

router.patch('/boarding/stays/:id/status', asyncHandler(async (req,res)=>{
  const tenantId=ctx(req).tenantId;
  const actorUserId=String(ctx(req).userId||'').trim();
  if(!actorUserId)throw new HttpError(401,'Cambiar una estancia requiere un actor autenticado.');
  await assertBoardingEnabled(prisma,tenantId);
  const body=veterinaryBoardingStayTransitionSchema.parse(req.body||{});
  const result=await prisma.$transaction(async (tx)=>{
    const stayRows=await tx.$queryRawUnsafe<any[]>(`
      SELECT * FROM public."VeterinaryBoardingStay"
      WHERE "tenantId"=$1 AND "id"=$2
      LIMIT 1
      FOR UPDATE
    `,tenantId,req.params.id);
    const stay=one(stayRows,'Estancia no encontrada.');
    await tx.$queryRawUnsafe(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`,`veterinary-boarding-resource:${tenantId}:${stay.resourceId}`);
    const transitions:any={reserved:['checked_in','cancelled'],checked_in:['completed','cancelled'],completed:[],cancelled:[]};
    if(!transitions[String(stay.status)]?.includes(body.status))throw new HttpError(409,'La transición solicitada no es válida para el estado actual de la estancia.');
    if(body.status==='checked_in'){
      if(new Date(stay.plannedEndsAt).getTime()<=Date.now())throw new HttpError(409,'La reserva venció; actualiza la ventana antes de registrar el ingreso.');
      const resourceRows=await tx.$queryRawUnsafe<any[]>(`
        SELECT "status" FROM public."VeterinaryBoardingResource"
        WHERE "tenantId"=$1 AND "id"=$2
        LIMIT 1
        FOR SHARE
      `,tenantId,stay.resourceId);
      if(one(resourceRows,'Recurso de estancia no encontrado.').status!=='active')throw new HttpError(409,'El recurso ya no está activo para registrar el ingreso.');
      const overlaps=await tx.$queryRawUnsafe<any[]>(`
        SELECT "id"
        FROM public."VeterinaryBoardingStay"
        WHERE "tenantId"=$1 AND "resourceId"=$2 AND "id"<>$3
          AND "status" IN ('reserved','checked_in')
          AND "startsAt" < $5::timestamptz
          AND COALESCE("endedAt","plannedEndsAt") > $4::timestamptz
        LIMIT 1
        FOR UPDATE
      `,tenantId,stay.resourceId,stay.id,stay.startsAt,stay.plannedEndsAt);
      if(overlaps.length)throw new HttpError(409,'El recurso tiene otra estancia solapada y no permite registrar el ingreso.');
    }
    const endValue=body.status==='checked_in'?null:(body.endedAt||new Date().toISOString());
    if(endValue&&new Date(endValue).getTime()<new Date(stay.startsAt).getTime())throw new HttpError(422,'La fecha de cierre no puede ser anterior al inicio de la estancia.');
    const rows=await tx.$queryRawUnsafe<any[]>(`
      UPDATE public."VeterinaryBoardingStay"
      SET "status"=$3,"endedAt"=CASE WHEN $3='checked_in' THEN NULL ELSE $4::timestamptz END,"updatedAt"=now()
      WHERE "tenantId"=$1 AND "id"=$2
      RETURNING *
    `,tenantId,stay.id,body.status,endValue);
    return {before:stay,after:one(rows)};
  });
  await writeAudit({
    tenantId,userId:actorUserId,
    action:'veterinary.boarding.stay.status_changed',
    entity:'VeterinaryBoardingStay',entityId:result.after.id,
    before:{status:result.before.status},after:{status:result.after.status,endedAt:result.after.endedAt}
  });
  ok(res,result.after);
}));

export default router;
