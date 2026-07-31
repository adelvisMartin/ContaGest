import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { HttpError, asyncHandler, ok } from '../../shared/http.js';
import { validate } from '../../shared/validate.js';
import { writeAudit } from '../../shared/audit.js';

const router = Router();
router.use(requireTenant, requirePermission('dashboard.read'));

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

function serialize(record:any) {
  const payload = record.payload && typeof record.payload === 'object' ? record.payload : {};
  return { id:record.id,title:record.title,status:record.status,...payload,createdAt:record.createdAt,updatedAt:record.updatedAt };
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

router.post('/', validate(taskSchema), asyncHandler(async (req,res)=>{
  const ctx=context(req);
  const input=req.body as z.infer<typeof taskSchema>;
  const { title,status,...payload }=input;
  const created=await prisma.moduleRecord.create({ data:{ tenantId:ctx.tenantId,moduleSlug:'tasks',title,status,payload } });
  await writeAudit({tenantId:ctx.tenantId,userId:ctx.userId,module:'tasks',action:'create',entity:'ModuleRecord',entityId:created.id,after:serialize(created),ip:ctx.ip,userAgent:ctx.userAgent});
  ok(res,serialize(created));
}));

router.put('/:id', validate(taskSchema.partial()), asyncHandler(async (req,res)=>{
  const ctx=context(req);
  const existing=await prisma.moduleRecord.findFirst({where:{id:req.params.id,tenantId:ctx.tenantId,moduleSlug:'tasks',status:{not:'archived'}}});
  if(!existing)throw new HttpError(404,'Tarea no encontrada.');
  const previous=serialize(existing);
  const currentPayload=existing.payload && typeof existing.payload==='object' ? existing.payload as Record<string,unknown> : {};
  const {title,status,...payload}=req.body;
  const updated=await prisma.moduleRecord.update({where:{id:existing.id},data:{title:title ?? existing.title,status:status ?? existing.status,payload:{...currentPayload,...payload}}});
  await writeAudit({tenantId:ctx.tenantId,userId:ctx.userId,module:'tasks',action:'update',entity:'ModuleRecord',entityId:updated.id,before:previous,after:serialize(updated),ip:ctx.ip,userAgent:ctx.userAgent});
  ok(res,serialize(updated));
}));

router.patch('/:id/status', validate(statusSchema), asyncHandler(async (req,res)=>{
  const ctx=context(req);
  const existing=await prisma.moduleRecord.findFirst({where:{id:req.params.id,tenantId:ctx.tenantId,moduleSlug:'tasks',status:{not:'archived'}}});
  if(!existing)throw new HttpError(404,'Tarea no encontrada.');
  const payload=existing.payload && typeof existing.payload==='object' ? existing.payload as Record<string,unknown> : {};
  const updated=await prisma.moduleRecord.update({where:{id:existing.id},data:{status:req.body.status,payload:{...payload,completedAt:req.body.status==='Completada'?new Date().toISOString():null}}});
  await writeAudit({tenantId:ctx.tenantId,userId:ctx.userId,module:'tasks',action:'status',entity:'ModuleRecord',entityId:updated.id,before:serialize(existing),after:serialize(updated),ip:ctx.ip,userAgent:ctx.userAgent});
  ok(res,serialize(updated));
}));

router.delete('/:id', asyncHandler(async (req,res)=>{
  const ctx=context(req);
  const existing=await prisma.moduleRecord.findFirst({where:{id:req.params.id,tenantId:ctx.tenantId,moduleSlug:'tasks',status:{not:'archived'}}});
  if(!existing)throw new HttpError(404,'Tarea no encontrada.');
  const payload=existing.payload && typeof existing.payload==='object' ? existing.payload as Record<string,unknown> : {};
  const archived=await prisma.moduleRecord.update({where:{id:existing.id},data:{status:'archived',payload:{...payload,archivedAt:new Date().toISOString()}}});
  await writeAudit({tenantId:ctx.tenantId,userId:ctx.userId,module:'tasks',action:'archive',entity:'ModuleRecord',entityId:archived.id,before:serialize(existing),after:serialize(archived),ip:ctx.ip,userAgent:ctx.userAgent});
  ok(res,{archived:true,id:archived.id});
}));

export default router;
