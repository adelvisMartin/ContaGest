import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { HttpError, asyncHandler, ok } from '../../shared/http.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { writeAudit } from '../../shared/services/audit.service.js';

const router = Router();
router.use(requireTenant, requirePermission('dashboard.view'));

const taskSchema = z.object({
  title:z.string().min(2).max(180),
  description:z.string().max(4000).optional(),
  module:z.string().max(80).optional(),
  assignee:z.string().max(160).optional(),
  start:z.string().optional(),
  due:z.string().optional(),
  priority:z.enum(['Baja','Media','Alta','Crítica']).default('Media'),
  status:z.enum(['Pendiente','En proceso','En revisión','Completada']).default('Pendiente'),
  recurrence:z.enum(['No','Diaria','Semanal','Mensual']).default('No'),
  dependsOn:z.string().max(180).optional()
});
const statusSchema = z.object({ status:z.enum(['Pendiente','En proceso','En revisión','Completada']) });
const context = (req:any) => req.context as { tenantId:string; userId?:string; ip?:string; userAgent?:string };
const toJson = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;

function serialize(record:any) {
  const payload = record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload) ? record.payload : {};
  return { id:record.id,title:record.title,status:record.status,...payload,createdAt:record.createdAt,updatedAt:record.updatedAt };
}

function payloadObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

router.get('/', asyncHandler(async (req,res)=>{
  const ctx=context(req);
  const q=String(req.query.q || '').toLowerCase();
  const status=String(req.query.status || '');
  const rows=await prisma.moduleRecord.findMany({
    where:{ tenantId:ctx.tenantId,moduleSlug:'tasks',status:{ not:'archived' },...(status&&status!=='all'?{ status }:{}),...(q?{ title:{ contains:q,mode:'insensitive' } }: {}) },
    orderBy:{ updatedAt:'desc' },take:500
  });
  const result=rows.map(serialize).filter((task:any)=>!q || [task.title,task.description,task.module,task.assignee].some((value)=>String(value||'').toLowerCase().includes(q)));
  ok(res,result);
}));

router.post('/', validateBody(taskSchema), asyncHandler(async (req,res)=>{
  const ctx=context(req);
  const input=req.body as z.infer<typeof taskSchema>;
  const { title,status,...payload }=input;
  const created=await prisma.moduleRecord.create({ data:{ tenantId:ctx.tenantId,moduleSlug:'tasks',title,status,payload:toJson(payload) } });
  await writeAudit({tenantId:ctx.tenantId,userId:ctx.userId,action:'tasks.create',entity:'ModuleRecord',entityId:created.id,after:serialize(created),ipAddress:ctx.ip,userAgent:ctx.userAgent});
  ok(res,serialize(created));
}));

router.put('/:id', validateBody(taskSchema.partial()), asyncHandler(async (req,res)=>{
  const ctx=context(req);
  const existing=await prisma.moduleRecord.findFirst({where:{id:req.params.id,tenantId:ctx.tenantId,moduleSlug:'tasks',status:{not:'archived'}}});
  if(!existing)throw new HttpError(404,'Tarea no encontrada.');
  const previous=serialize(existing);
  const currentPayload=payloadObject(existing.payload);
  const {title,status,...payload}=req.body;
  const updated=await prisma.moduleRecord.update({where:{id:existing.id},data:{title:title ?? existing.title,status:status ?? existing.status,payload:toJson({...currentPayload,...payload})}});
  await writeAudit({tenantId:ctx.tenantId,userId:ctx.userId,action:'tasks.update',entity:'ModuleRecord',entityId:updated.id,before:previous,after:serialize(updated),ipAddress:ctx.ip,userAgent:ctx.userAgent});
  ok(res,serialize(updated));
}));

router.patch('/:id/status', validateBody(statusSchema), asyncHandler(async (req,res)=>{
  const ctx=context(req);
  const existing=await prisma.moduleRecord.findFirst({where:{id:req.params.id,tenantId:ctx.tenantId,moduleSlug:'tasks',status:{not:'archived'}}});
  if(!existing)throw new HttpError(404,'Tarea no encontrada.');
  const payload=payloadObject(existing.payload);
  const updated=await prisma.moduleRecord.update({where:{id:existing.id},data:{status:req.body.status,payload:toJson({...payload,completedAt:req.body.status==='Completada'?new Date().toISOString():null})}});
  await writeAudit({tenantId:ctx.tenantId,userId:ctx.userId,action:'tasks.status',entity:'ModuleRecord',entityId:updated.id,before:serialize(existing),after:serialize(updated),ipAddress:ctx.ip,userAgent:ctx.userAgent});
  ok(res,serialize(updated));
}));

router.delete('/:id', asyncHandler(async (req,res)=>{
  const ctx=context(req);
  const existing=await prisma.moduleRecord.findFirst({where:{id:req.params.id,tenantId:ctx.tenantId,moduleSlug:'tasks',status:{not:'archived'}}});
  if(!existing)throw new HttpError(404,'Tarea no encontrada.');
  const payload=payloadObject(existing.payload);
  const archived=await prisma.moduleRecord.update({where:{id:existing.id},data:{status:'archived',payload:toJson({...payload,archivedAt:new Date().toISOString()})}});
  await writeAudit({tenantId:ctx.tenantId,userId:ctx.userId,action:'tasks.archive',entity:'ModuleRecord',entityId:archived.id,before:serialize(existing),after:serialize(archived),ipAddress:ctx.ip,userAgent:ctx.userAgent});
  ok(res,{archived:true,id:archived.id});
}));

export default router;
