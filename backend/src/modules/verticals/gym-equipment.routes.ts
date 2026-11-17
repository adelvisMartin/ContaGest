import { createHash } from 'node:crypto';
import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission } from '../../shared/middleware/context.js';
import { ctx, one } from './verticals.shared.js';
import { gymEquipmentSchema, gymEquipmentWorkOrderSchema, gymEquipmentTransitionSchema, gymEquipmentLocationIdSchema } from './gym.schemas.js';

const router=Router();
const fingerprint=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

router.get('/gym/equipment',requirePermission('gym.manage'),asyncHandler(async(req,res)=>{
  const tenantId=ctx(req).tenantId;
  const locationId=typeof req.query.locationId==='string'?req.query.locationId.trim():'';
  if(locationId&&!gymEquipmentLocationIdSchema.safeParse(locationId).success)
    throw new HttpError(422,'El filtro de sede es inválido.');
  const rows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT e.*,l."name" AS "locationName",
      CASE WHEN e."status"='retired' THEN 'retired'
        WHEN EXISTS (
          SELECT 1 FROM public."GymEquipmentWorkOrder" w
          WHERE w."tenantId"=e."tenantId" AND w."equipmentId"=e."id"
            AND (w."status"='in_progress' OR
              (w."status"='open' AND w."kind" IN ('incident','corrective')))
        ) THEN 'maintenance'
        ELSE e."status"
      END AS "availability",
      (SELECT count(*)::int FROM public."GymEquipmentWorkOrder" w
        WHERE w."tenantId"=e."tenantId" AND w."equipmentId"=e."id"
          AND w."status" IN ('open','in_progress')) AS "openOrders"
    FROM public."GymEquipment" e
    JOIN public."BusinessLocation" l
      ON l."tenantId"=e."tenantId" AND l."id"=e."locationId"
    WHERE e."tenantId"=$1 AND ($2='' OR e."locationId"=$2)
    ORDER BY l."name",e."name" LIMIT 500
  `,tenantId,locationId);
  ok(res,rows);
}));

router.post('/gym/equipment',requirePermission('gym.manage'),asyncHandler(async(req,res)=>{
  const b=gymEquipmentSchema.parse(req.body||{});
  const tenantId=ctx(req).tenantId;
  const created=await prisma.$transaction(async(tx)=>{
    const locations=await tx.$queryRawUnsafe<Array<{id:string;status:string}>>(
      'SELECT "id","status" FROM public."BusinessLocation" WHERE "tenantId"=$1 AND "id"=$2 FOR SHARE',
      tenantId,b.locationId
    );
    if(!locations.length)throw new HttpError(404,'Sede no encontrada en esta empresa.');
    if(locations[0].status!=='active')throw new HttpError(409,'La sede no está activa.');
    const records=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."GymEquipment" ("tenantId","locationId","code","name","area","createdBy")
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT ("tenantId","code") DO NOTHING RETURNING *
    `,tenantId,b.locationId,b.code,b.name,b.area||null,ctx(req).userId||null);
    if(!records.length)throw new HttpError(409,'El código de equipo ya existe.');
    return one(records);
  });
  ok(res,created,201);
}));

router.get('/gym/equipment/:id/work-orders',requirePermission('gym.manage'),asyncHandler(async(req,res)=>{
  const tenantId=ctx(req).tenantId,equipmentId=String(req.params.id);
  const found=await prisma.$queryRawUnsafe<Array<{id:string}>>(
    'SELECT "id" FROM public."GymEquipment" WHERE "tenantId"=$1 AND "id"=$2',
    tenantId,equipmentId
  );
  if(!found.length)throw new HttpError(404,'Equipo no encontrado.');
  const rows=await prisma.$queryRawUnsafe<any[]>(`
    SELECT w.*,COALESCE((
      SELECT jsonb_agg(to_jsonb(ev) ORDER BY ev."createdAt",ev."id")
      FROM public."GymEquipmentWorkOrderEvent" ev
      WHERE ev."tenantId"=w."tenantId" AND ev."workOrderId"=w."id"
    ),'[]'::jsonb) AS "events"
    FROM public."GymEquipmentWorkOrder" w
    WHERE w."tenantId"=$1 AND w."equipmentId"=$2
    ORDER BY w."openedAt" DESC,w."id" DESC LIMIT 200
  `,tenantId,equipmentId);
  ok(res,rows);
}));

router.post('/gym/equipment/:id/work-orders',requirePermission('gym.manage'),asyncHandler(async(req,res)=>{
  const b=gymEquipmentWorkOrderSchema.parse(req.body||{});
  const tenantId=ctx(req).tenantId,equipmentId=String(req.params.id);
  const hash=fingerprint({
    equipmentId,kind:b.kind,title:b.title,description:b.description||null,
    scheduledAt:b.scheduledAt||null
  });
  const outcome=await prisma.$transaction(async(tx)=>{
    await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text AS locked',
      'gym:equipment:order:'+tenantId+':'+b.requestKey);
    const previous=await tx.$queryRawUnsafe<Array<any>>(
      'SELECT * FROM public."GymEquipmentWorkOrder" WHERE "tenantId"=$1 AND "requestKey"=$2',
      tenantId,b.requestKey
    );
    if(previous.length){
      if(previous[0].equipmentId!==equipmentId||previous[0].requestFingerprint!==hash)
        throw new HttpError(409,'Clave usada para otra orden de mantenimiento.');
      return {order:previous[0],replayed:true};
    }
    const devices=await tx.$queryRawUnsafe<Array<{id:string;status:string;locationStatus:string}>>(`
      SELECT e."id",e."status",l."status" AS "locationStatus"
      FROM public."GymEquipment" e
      JOIN public."BusinessLocation" l ON l."tenantId"=e."tenantId" AND l."id"=e."locationId"
      WHERE e."tenantId"=$1 AND e."id"=$2 LIMIT 1 FOR SHARE OF e,l
    `,tenantId,equipmentId);
    if(!devices.length)throw new HttpError(404,'Equipo no encontrado.');
    if(devices[0].status==='retired'||devices[0].locationStatus!=='active')
      throw new HttpError(409,'El equipo o sede no admiten una orden nueva.');
    const rows=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."GymEquipmentWorkOrder"
        ("tenantId","equipmentId","kind","title","description","scheduledAt","requestKey","requestFingerprint","createdBy")
      VALUES ($1,$2,$3,$4,$5,$6::timestamptz,$7,$8,$9) RETURNING *
    `,tenantId,equipmentId,b.kind,b.title,b.description||null,
      b.scheduledAt||null,b.requestKey,hash,ctx(req).userId||null);
    const order=one(rows);
    await tx.$executeRawUnsafe(`
      INSERT INTO public."GymEquipmentWorkOrderEvent"
        ("tenantId","workOrderId","eventKey","requestFingerprint","fromStatus","toStatus","reason","actorId")
      VALUES ($1,$2,$3,$4,NULL,'open',NULL,$5)
    `,tenantId,order.id,b.requestKey,hash,ctx(req).userId||null);
    return {order,replayed:false};
  });
  ok(res,{...outcome.order,replayed:outcome.replayed},outcome.replayed?200:201);
}));

router.post('/gym/equipment/work-orders/:id/transitions',requirePermission('gym.manage'),asyncHandler(async(req,res)=>{
  const b=gymEquipmentTransitionSchema.parse(req.body||{});
  const tenantId=ctx(req).tenantId,orderId=String(req.params.id);
  const hash=fingerprint({orderId,toStatus:b.toStatus,reason:b.reason||null});
  const outcome=await prisma.$transaction(async(tx)=>{
    await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1,0))::text AS locked',
      'gym:equipment:event:'+tenantId+':'+b.eventKey);
    const previous=await tx.$queryRawUnsafe<Array<any>>(
      'SELECT * FROM public."GymEquipmentWorkOrderEvent" WHERE "tenantId"=$1 AND "eventKey"=$2',
      tenantId,b.eventKey
    );
    if(previous.length){
      if(previous[0].workOrderId!==orderId||previous[0].requestFingerprint!==hash)
        throw new HttpError(409,'Clave usada para otro evento de mantenimiento.');
      return {event:previous[0],replayed:true};
    }
    const orders=await tx.$queryRawUnsafe<Array<{id:string;status:string}>>(
      'SELECT "id","status" FROM public."GymEquipmentWorkOrder" WHERE "tenantId"=$1 AND "id"=$2 FOR UPDATE',
      tenantId,orderId
    );
    const current=one(orders,'Orden no encontrada.');
    const allowed=current.status==='open'?['in_progress','cancelled']:
      current.status==='in_progress'?['resolved','cancelled']:[];
    if(!allowed.includes(b.toStatus))throw new HttpError(409,'Transición de orden no permitida.');
    await tx.$executeRawUnsafe(`
      UPDATE public."GymEquipmentWorkOrder"
      SET "status"=$3,"resolution"=CASE WHEN $3 IN ('resolved','cancelled') THEN $4 ELSE "resolution" END,
        "closedBy"=CASE WHEN $3 IN ('resolved','cancelled') THEN $5 ELSE "closedBy" END,
        "closedAt"=CASE WHEN $3 IN ('resolved','cancelled') THEN now() ELSE "closedAt" END,
        "updatedAt"=now()
      WHERE "tenantId"=$1 AND "id"=$2
    `,tenantId,orderId,b.toStatus,b.reason||null,ctx(req).userId||null);
    const events=await tx.$queryRawUnsafe<any[]>(`
      INSERT INTO public."GymEquipmentWorkOrderEvent"
        ("tenantId","workOrderId","eventKey","requestFingerprint","fromStatus","toStatus","reason","actorId")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `,tenantId,orderId,b.eventKey,hash,current.status,b.toStatus,
      b.reason||null,ctx(req).userId||null);
    return {event:one(events),replayed:false};
  });
  ok(res,{...outcome.event,replayed:outcome.replayed},outcome.replayed?200:201);
}));

export default router;
