import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requireTenant, requirePermission } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { createProjectRecord, listProjectRecords, ProjectOwnerNotFound, ProjectReplayConflict } from './project-record-store.js';
import { transitionProjectStatus, ProjectStatusNotFound, ProjectStatusConflict,
  ProjectStatusForbidden, ProjectStatusTransitionRejected } from './project-status-transition.js';

const router=Router();
router.use(requireTenant);
// This first persistence cut remains closed until tenant-negative PostgreSQL,
// auth/RBAC and HTTP smoke pass on the deployment's exact SHA.
router.use((_req,_res,next)=>{
  if(process.env.CONTAGEST_PROJECTS_V761_ENABLE!=='true'){
    return next(new HttpError(503,'El módulo de proyectos está pendiente de habilitación verificada.'));
  }
  next();
});

const draftSchema=z.object({
  name:z.string().trim().min(3).max(160),
  clientId:z.string().uuid(),
  description:z.string().trim().max(2000).optional()
}).strict();

const pageSchema=z.object({
  take:z.coerce.number().int().min(1).max(100).default(50),
  skip:z.coerce.number().int().min(0).max(10000).default(0)
}).strict();

router.get('/',requirePermission('modules.manage'),asyncHandler(async(req,res)=>{
  const page=pageSchema.safeParse(req.query);
  if(!page.success)throw new HttpError(400,'Paginación de proyectos inválida.');
  const tenantId=(req as any).context.tenantId as string;
  const result=await listProjectRecords({db:prisma,tenantId,...page.data});
  res.setHeader('Cache-Control','private, no-store');
  ok(res,result);
}));

router.post('/',requirePermission('modules.manage'),validateBody(draftSchema),asyncHandler(async(req,res)=>{
  const ctx=(req as any).context as {tenantId:string;userId?:string;ip?:string;userAgent?:string};
  if(!ctx.userId)throw new HttpError(403,'Se requiere identidad de usuario autenticada.');
  const idempotencyKey=String(req.header('Idempotency-Key')||'');
  try{
    const result=await createProjectRecord({
      db:prisma,tenantId:ctx.tenantId,actorId:ctx.userId,
      idempotencyKey,draft:req.body,ipAddress:ctx.ip,userAgent:ctx.userAgent
    });
    res.setHeader('Cache-Control','private, no-store');
    ok(res,result,201);
  }catch(error){
    if(error instanceof ProjectReplayConflict)throw new HttpError(409,'Este intento ya creó un proyecto. Actualiza el listado.');
    if(error instanceof ProjectOwnerNotFound)throw new HttpError(404,'Cliente o responsable no disponible para esta empresa.');
    if(error instanceof TypeError&&[
      'PROJECT_IDEMPOTENCY_KEY_INVALID','PROJECT_DRAFT_INVALID','PROJECT_DRAFT_UNKNOWN_FIELD',
      'PROJECT_NAME_INVALID','PROJECT_CLIENT_ID_INVALID','PROJECT_DESCRIPTION_INVALID'
    ].includes(error.message))throw new HttpError(400,'Datos del proyecto o clave de intento inválidos.');
    throw error;
  }
}));

const projectStatusSchema=z.object({
  nextStatus:z.enum(['active','archived']),
  expectedUpdatedAt:z.string().datetime({offset:false,local:false})
}).strict();

// Guarded by the same disabled-by-default v761 flag and server-side RBAC.
router.patch('/:id/status',requirePermission('modules.manage'),validateBody(projectStatusSchema),
  asyncHandler(async(req,res)=>{
    const ctx=(req as any).context as {tenantId:string;userId?:string;ip?:string;userAgent?:string};
    if(!ctx.userId)throw new HttpError(403,'Se requiere identidad de usuario autenticada.');
    try{
      const result=await transitionProjectStatus({
        db:prisma,tenantId:ctx.tenantId,actorId:ctx.userId,projectId:req.params.id,
        nextStatus:req.body.nextStatus,expectedUpdatedAt:req.body.expectedUpdatedAt,
        ipAddress:ctx.ip,userAgent:ctx.userAgent
      });
      res.setHeader('Cache-Control','private, no-store');
      ok(res,result);
    }catch(error){
      if(error instanceof ProjectStatusNotFound)throw new HttpError(404,'Proyecto no encontrado.');
      if(error instanceof ProjectStatusForbidden)throw new HttpError(403,'Solo el responsable activo puede cambiar el proyecto.');
      if(error instanceof ProjectStatusConflict)throw new HttpError(409,'El proyecto cambió. Actualiza la información y vuelve a intentarlo.');
      if(error instanceof ProjectStatusTransitionRejected)throw new HttpError(409,'La transición de estado no está permitida.');
      if(error instanceof TypeError&&[
        'PROJECT_STATUS_REVISION_REQUIRED','PROJECT_STATUS_ID_INVALID'
      ].includes(error.message))throw new HttpError(400,'Identificador o revisión de proyecto inválidos.');
      throw error;
    }
  }));

export default router;
