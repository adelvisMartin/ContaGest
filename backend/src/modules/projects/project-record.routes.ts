import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requireTenant, requirePermission } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { createProjectRecord, listProjectRecords, ProjectOwnerNotFound, ProjectReplayConflict } from './project-record-store.js';
import { transitionProjectStatus, ProjectStatusNotFound, ProjectStatusConflict,
  ProjectStatusForbidden, ProjectStatusTransitionRejected } from './project-status-transition.js';
import { createProjectTask, listProjectTasks, transitionProjectTask, ProjectTaskNotFound, ProjectTaskForbidden,
  ProjectTaskConflict, ProjectTaskStaleRevision, ProjectTaskTransitionRejected } from './project-task-store.js';
import { createTimeEntryDraft, listTimeEntries, ProjectTimeEntryNotFound,
  ProjectTimeEntryForbidden, ProjectTimeEntryConflict } from './time-entry-record-store.js';
import { transitionTimeEntryReview, TimeReviewMissing, TimeReviewForbidden,
  TimeReviewConflict, TimeReviewStateError } from './time-entry-review-store.js';
import { createProjectRateCard, listProjectRateCards, ProjectRateCardNotFound,
  ProjectRateCardForbidden, ProjectRateCardConflict } from './project-rate-card-store.js';
import { captureApprovedTimeRateSnapshot, SnapshotNotFound,
  SnapshotForbidden, SnapshotConflict } from './time-entry-rate-snapshot-store.js';

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


const taskDraftSchema=z.object({
  title:z.string().trim().min(3).max(160),
  assigneeId:z.string().uuid(),
  description:z.string().trim().max(2000).optional()
}).strict();

// Both routes inherit the default-OFF feature flag and trusted request tenant.
// A successful task write cannot authorize timesheets, billing or posting.
router.get('/:projectId/tasks',requirePermission('modules.manage'),asyncHandler(async(req,res)=>{
  const page=pageSchema.safeParse(req.query);
  if(!page.success)throw new HttpError(400,'Paginación de tareas inválida.');
  const ctx=(req as any).context as {tenantId:string};
  try{
    const result=await listProjectTasks({
      db:prisma,tenantId:ctx.tenantId,projectId:req.params.projectId,...page.data
    });
    res.setHeader('Cache-Control','private, no-store');
    ok(res,result);
  }catch(error){
    if(error instanceof ProjectTaskNotFound)throw new HttpError(404,'Proyecto no encontrado.');
    if(error instanceof TypeError&&[
      'PROJECT_TASK_PROJECT_ID_INVALID','PROJECT_TASK_PAGE_INVALID'
    ].includes(error.message))throw new HttpError(400,'Identificador o paginación inválidos.');
    throw error;
  }
}));

router.post('/:projectId/tasks',requirePermission('modules.manage'),validateBody(taskDraftSchema),
  asyncHandler(async(req,res)=>{
    const ctx=(req as any).context as {tenantId:string;userId?:string;ip?:string;userAgent?:string};
    if(!ctx.userId)throw new HttpError(403,'Se requiere usuario autenticado.');
    try{
      const result=await createProjectTask({
        db:prisma,tenantId:ctx.tenantId,actorId:ctx.userId,
        projectId:req.params.projectId,idempotencyKey:String(req.header('Idempotency-Key')||''),
        draft:req.body,ipAddress:ctx.ip,userAgent:ctx.userAgent
      });
      res.setHeader('Cache-Control','private, no-store');
      ok(res,result,201);
    }catch(error){
      if(error instanceof ProjectTaskForbidden)throw new HttpError(403,'Solo el responsable activo del proyecto puede asignar tareas.');
      if(error instanceof ProjectTaskNotFound)throw new HttpError(404,'Proyecto, usuario o cliente no disponible en esta empresa.');
      if(error instanceof ProjectTaskConflict)throw new HttpError(409,'Proyecto modificado o intento de tarea ya procesado.');
      if(error instanceof TypeError&&[
        'PROJECT_TASK_TENANT_INVALID','PROJECT_TASK_ACTOR_INVALID','PROJECT_TASK_PROJECT_ID_INVALID',
        'PROJECT_TASK_IDEMPOTENCY_KEY_INVALID','PROJECT_TASK_DRAFT_INVALID',
        'PROJECT_TASK_FIELD_NOT_ALLOWED','PROJECT_TASK_TITLE_INVALID',
        'PROJECT_TASK_ASSIGNEE_INVALID','PROJECT_TASK_DESCRIPTION_INVALID'
      ].includes(error.message))throw new HttpError(400,'Identificador, clave de intento o datos de tarea inválidos.');
      throw error;
    }
  }));


const taskTransitionSchema=z.object({
  nextStatus:z.enum(['in_progress','done']),
  expectedUpdatedAt:z.string().datetime({offset:false,local:false})
}).strict();

// Same default-OFF feature flag and tenant+RBAC gate as task creation.
// Only the active project manager can progress a task; no invoice/ledger effect.
router.patch('/:projectId/tasks/:taskId/status',
  requirePermission('modules.manage'),validateBody(taskTransitionSchema),
  asyncHandler(async(req,res)=>{
    const ctx=(req as any).context as {tenantId:string;userId?:string;ip?:string;userAgent?:string};
    if(!ctx.userId)throw new HttpError(403,'Se requiere usuario autenticado.');
    try{
      const result=await transitionProjectTask({
        db:prisma,tenantId:ctx.tenantId,actorId:ctx.userId,
        projectId:req.params.projectId,taskId:req.params.taskId,
        nextStatus:req.body.nextStatus,expectedUpdatedAt:req.body.expectedUpdatedAt,
        ipAddress:ctx.ip,userAgent:ctx.userAgent
      });
      res.setHeader('Cache-Control','private, no-store');
      ok(res,result);
    }catch(error){
      if(error instanceof ProjectTaskForbidden)throw new HttpError(403,'Solo el responsable activo del proyecto puede cambiar sus tareas.');
      if(error instanceof ProjectTaskNotFound)throw new HttpError(404,'Tarea o proyecto no encontrado.');
      if(error instanceof ProjectTaskConflict || error instanceof ProjectTaskStaleRevision){
        throw new HttpError(409,'La tarea o el proyecto cambió. Actualiza el registro.');
      }
      if(error instanceof ProjectTaskTransitionRejected)throw new HttpError(409,'Transición de tarea no permitida.');
      if(error instanceof TypeError&&[
        'PROJECT_TASK_TENANT_INVALID','PROJECT_TASK_ACTOR_INVALID','PROJECT_TASK_PROJECT_ID_INVALID',
        'PROJECT_TASK_ID_INVALID','PROJECT_TASK_REVISION_INVALID'
      ].includes(error.message))throw new HttpError(400,'Identificador o revisión de tarea inválidos.');
      throw error;
    }
  }));


const timeEntryDraftSchema=z.object({
  source:z.literal('manual'),
  startedAt:z.string().datetime({offset:true,local:false}),
  endedAt:z.string().datetime({offset:true,local:false}),
  recordedMinutes:z.number().int().min(1).max(1440).optional()
}).strict();

// #761 No billing authority. All time routes inherit default-OFF flag/tenant.
// Actor is derived ONLY from authenticated context, never JSON client fields.
router.post('/:projectId/tasks/:taskId/time-entries',
  requirePermission('modules.manage'),validateBody(timeEntryDraftSchema),
  asyncHandler(async(req,res)=>{
    const ctx=(req as any).context as {tenantId:string;userId?:string;ip?:string;userAgent?:string};
    if(!ctx.userId)throw new HttpError(403,'Se requiere usuario autenticado.');
    try {
      const result=await createTimeEntryDraft({
        db:prisma,tenantId:ctx.tenantId,actorId:ctx.userId,
        projectId:req.params.projectId,taskId:req.params.taskId,
        idempotencyKey:String(req.header('Idempotency-Key')||''),
        draft:req.body,ipAddress:ctx.ip,userAgent:ctx.userAgent
      });
      res.setHeader('Cache-Control','private, no-store');
      ok(res,result,201);
    } catch(error){
      if(error instanceof ProjectTimeEntryForbidden)throw new HttpError(403,'Solo el usuario asignado puede registrar sus horas.');
      if(error instanceof ProjectTimeEntryNotFound)throw new HttpError(404,'Proyecto, tarea o cliente no disponibles.');
      if(error instanceof ProjectTimeEntryConflict)throw new HttpError(409,'El proyecto cambió o este intento ya fue procesado.');
      if(error instanceof TypeError&&[
        'PROJECT_TIME_ENTRY_TENANT_INVALID','PROJECT_TIME_ENTRY_ACTOR_INVALID',
        'PROJECT_TIME_ENTRY_PROJECT_INVALID','PROJECT_TIME_ENTRY_TASK_INVALID',
        'PROJECT_TIME_ENTRY_IDEMPOTENCY_INVALID','PROJECT_TIME_ENTRY_DRAFT_INVALID',
        'PROJECT_TIME_ENTRY_FIELD_FORBIDDEN','PROJECT_TIME_ENTRY_TIMER_NOT_VERIFIED',
        'PROJECT_TIME_ENTRY_TIMESTAMP_INVALID','PROJECT_TIME_ENTRY_MINUTES_INVALID',
        'PROJECT_TIME_TIMESTAMP_INVALID','PROJECT_TIME_DURATION_INVALID',
        'PROJECT_TIME_DURATION_MISMATCH'
      ].includes(error.message))throw new HttpError(400,'Período o clave de registro inválidos.');
      throw error;
    }
  }));

router.get('/:projectId/tasks/:taskId/time-entries',
  requirePermission('modules.manage'),asyncHandler(async(req,res)=>{
    const page=pageSchema.safeParse(req.query);
    if(!page.success)throw new HttpError(400,'Paginación de horas inválida.');
    const ctx=(req as any).context as {tenantId:string;userId?:string};
    if(!ctx.userId)throw new HttpError(403,'Se requiere usuario autenticado.');
    try {
      const result=await listTimeEntries({
        db:prisma,tenantId:ctx.tenantId,actorId:ctx.userId,
        projectId:req.params.projectId,taskId:req.params.taskId,...page.data
      });
      res.setHeader('Cache-Control','private, no-store');
      ok(res,result);
    } catch(error){
      if(error instanceof ProjectTimeEntryForbidden)throw new HttpError(403,'No puedes consultar registros de otro usuario.');
      if(error instanceof ProjectTimeEntryNotFound)throw new HttpError(404,'Proyecto o tarea no encontrados.');
      if(error instanceof TypeError&&[
        'PROJECT_TIME_ENTRY_TENANT_INVALID','PROJECT_TIME_ENTRY_PROJECT_INVALID',
        'PROJECT_TIME_ENTRY_TASK_INVALID','PROJECT_TIME_ENTRY_ACTOR_INVALID',
        'PROJECT_TIME_ENTRY_PAGE_INVALID'
      ].includes(error.message))throw new HttpError(400,'Identificador o paginación inválidos.');
      throw error;
    }
  }));


const timeReviewSchema=z.object({
  action:z.enum(['submit','withdraw','revise','reject','approve']),
  expectedRevision:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER-1)
}).strict();

// Applies existing default-OFF feature flag and tenant/license/RBAC middleware.
// Reviewer identity is resolved from active Project.managerId in transaction,
// never a client-controlled canReviewTime field.
router.patch('/:projectId/tasks/:taskId/time-entries/:entryId/review',
  requirePermission('modules.manage'),validateBody(timeReviewSchema),
  asyncHandler(async(req,res)=>{
    const ctx=(req as any).context as {tenantId:string;userId?:string;ip?:string;userAgent?:string};
    if(!ctx.userId)throw new HttpError(403,'Se requiere usuario autenticado.');
    try {
      const result=await transitionTimeEntryReview({
        db:prisma,tenantId:ctx.tenantId,actorId:ctx.userId,
        projectId:req.params.projectId,taskId:req.params.taskId,entryId:req.params.entryId,
        action:req.body.action,expectedRevision:req.body.expectedRevision,
        ipAddress:ctx.ip,userAgent:ctx.userAgent
      });
      res.setHeader('Cache-Control','private, no-store');
      ok(res,result);
    } catch(error) {
      if(error instanceof TimeReviewForbidden)throw new HttpError(403,'No tienes autorización para revisar estas horas.');
      if(error instanceof TimeReviewMissing)throw new HttpError(404,'Proyecto, tarea, cliente o registro no disponibles.');
      if(error instanceof TimeReviewConflict || error instanceof TimeReviewStateError){
        throw new HttpError(409,'El estado o la revisión del registro no permite esta operación.');
      }
      if(error instanceof TypeError&&[
        'PROJECT_TIME_REVIEW_TENANT_INVALID','PROJECT_TIME_REVIEW_ACTOR_INVALID',
        'PROJECT_TIME_REVIEW_PROJECT_INVALID','PROJECT_TIME_REVIEW_TASK_INVALID',
        'PROJECT_TIME_REVIEW_ENTRY_INVALID','PROJECT_TIME_REVIEW_REVISION_INVALID'
      ].includes(error.message))throw new HttpError(400,'Identificador o revisión inválidos.');
      throw error;
    }
  }));


const projectRateCardDraftSchema=z.object({
  memberId:z.string().uuid(),
  hourlyRateExact:z.string().regex(/^[0-9]{1,12}\.[0-9]{2}$/),
  currency:z.string().regex(/^[A-Z]{3}$/),
  effectiveFromUtc:z.string().datetime({offset:false,local:false}),
  expectedRevision:z.number().int().min(0).max(1023)
}).strict();

// All rate card routes inherit project feature flag OFF by default, tenant,
// active license and modules.manage. The store independently authorizes the
// active Project.managerId, and NEVER produces billing or invoice authority.
router.post('/:projectId/rate-cards',
  requirePermission('modules.manage'),validateBody(projectRateCardDraftSchema),
  asyncHandler(async(req,res)=>{
    const ctx=(req as any).context as {tenantId:string;userId?:string;ip?:string;userAgent?:string};
    if(!ctx.userId)throw new HttpError(403,'Se requiere usuario autenticado.');
    try{
      const result=await createProjectRateCard({
        db:prisma,tenantId:ctx.tenantId,actorId:ctx.userId,
        projectId:req.params.projectId,draft:req.body,ipAddress:ctx.ip,userAgent:ctx.userAgent
      });
      res.setHeader('Cache-Control','private, no-store');
      ok(res,result,201);
    }catch(error){
      if(error instanceof ProjectRateCardForbidden)throw new HttpError(403,'Solo el responsable activo puede registrar tarifas.');
      if(error instanceof ProjectRateCardNotFound)throw new HttpError(404,'Proyecto, cliente o trabajador no disponibles.');
      if(error instanceof ProjectRateCardConflict)throw new HttpError(409,'Versión o vigencia de tarifa incompatible. Actualiza el historial.');
      if(error instanceof TypeError&&error.message.startsWith('PROJECT_RATE_CARD_')&&
         !error.message.startsWith('PROJECT_RATE_CARD_STORED_')&&
         !error.message.includes('DB_AUTHORITY')){
        throw new HttpError(400,'Datos de tarifa o revisión inválidos.');
      }
      throw error;
    }
  }));

router.get('/:projectId/rate-cards/:memberId',
  requirePermission('modules.manage'),asyncHandler(async(req,res)=>{
    const page=pageSchema.safeParse(req.query);
    if(!page.success)throw new HttpError(400,'Paginación de tarifas inválida.');
    const ctx=(req as any).context as {tenantId:string;userId?:string};
    if(!ctx.userId)throw new HttpError(403,'Se requiere usuario autenticado.');
    try{
      const result=await listProjectRateCards({
        db:prisma,tenantId:ctx.tenantId,actorId:ctx.userId,
        projectId:req.params.projectId,memberId:req.params.memberId,...page.data
      });
      res.setHeader('Cache-Control','private, no-store');
      ok(res,result);
    }catch(error){
      if(error instanceof ProjectRateCardForbidden)throw new HttpError(403,'No autorizado para consultar tarifas.');
      if(error instanceof ProjectRateCardNotFound)throw new HttpError(404,'Proyecto no encontrado.');
      if(error instanceof TypeError&&[
        'PROJECT_RATE_CARD_TENANT_INVALID','PROJECT_RATE_CARD_ACTOR_INVALID',
        'PROJECT_RATE_CARD_PROJECT_INVALID','PROJECT_RATE_CARD_MEMBER_INVALID',
        'PROJECT_RATE_CARD_PAGE_INVALID'
      ].includes(error.message))throw new HttpError(400,'Identificador o paginación inválidos.');
      throw error;
    }
  }));


const timeSnapshotSchema=z.object({
  expectedRevision:z.number().int().min(2).max(Number.MAX_SAFE_INTEGER-1)
}).strict();

// Captures only immutable rate evidence. The default-OFF Projects flag,
// requireTenant, server session/licence and modules.manage still apply.
router.post('/:projectId/tasks/:taskId/time-entries/:entryId/rate-snapshot',
  requirePermission('modules.manage'),validateBody(timeSnapshotSchema),
  asyncHandler(async(req,res)=>{
    const ctx=(req as any).context as {tenantId:string;userId?:string;ip?:string;userAgent?:string};
    if(!ctx.userId)throw new HttpError(403,'Se requiere usuario autenticado.');
    try{
      const result=await captureApprovedTimeRateSnapshot({
        db:prisma,tenantId:ctx.tenantId,actorId:ctx.userId,
        projectId:req.params.projectId,taskId:req.params.taskId,
        entryId:req.params.entryId,expectedRevision:req.body.expectedRevision,
        ipAddress:ctx.ip,userAgent:ctx.userAgent
      });
      res.setHeader('Cache-Control','private, no-store');
      ok(res,result,201);
    }catch(error){
      if(error instanceof SnapshotForbidden)throw new HttpError(403,'Solo el responsable independiente puede registrar el snapshot de tarifa.');
      if(error instanceof SnapshotNotFound)throw new HttpError(404,'Proyecto, tarea, trabajador, cliente o registro no disponibles.');
      if(error instanceof SnapshotConflict)throw new HttpError(409,'El registro cambió o ya existe el snapshot.');
      if(error instanceof TypeError&&[
        'PROJECT_SNAPSHOT_TENANT_INVALID','PROJECT_SNAPSHOT_ACTOR_INVALID',
        'PROJECT_SNAPSHOT_PROJECT_INVALID','PROJECT_SNAPSHOT_TASK_INVALID',
        'PROJECT_SNAPSHOT_ENTRY_INVALID','PROJECT_SNAPSHOT_REVISION_INVALID'
      ].includes(error.message))throw new HttpError(400,'Identificador o revisión inválidos.');
      throw error;
    }
  }));

export default router;
