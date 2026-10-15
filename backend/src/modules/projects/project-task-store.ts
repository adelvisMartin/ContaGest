import { createHash } from 'node:crypto';

/** #761: real task records on the existing ModuleRecord table, not time or billing authority. */
export const PROJECT_TASK_SLUG = 'project-task-v761';
export const PROJECT_TASK_PAGE_LIMIT = 100;
const PROJECT_SLUG = 'project-workspace-v761';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ATTEMPT = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ProjectTaskNotFound extends Error { constructor(){super('PROJECT_TASK_PROJECT_NOT_FOUND');} }
export class ProjectTaskForbidden extends Error { constructor(){super('PROJECT_TASK_MANAGER_REQUIRED');} }
export class ProjectTaskConflict extends Error { constructor(){super('PROJECT_TASK_REPLAY_OR_CONCURRENT_CHANGE');} }

function requireId(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new TypeError(label);
}

export function validateTaskDraft(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('PROJECT_TASK_DRAFT_INVALID');
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(k => !['title','assigneeId','description'].includes(k))) {
    throw new TypeError('PROJECT_TASK_FIELD_NOT_ALLOWED');
  }
  if (typeof value.title !== 'string' || value.title.trim().length < 3 || value.title.trim().length > 160) {
    throw new TypeError('PROJECT_TASK_TITLE_INVALID');
  }
  requireId(value.assigneeId, 'PROJECT_TASK_ASSIGNEE_INVALID');
  if (value.description != null && (typeof value.description !== 'string' || value.description.trim().length > 2000)) {
    throw new TypeError('PROJECT_TASK_DESCRIPTION_INVALID');
  }
  return Object.freeze({ title: value.title.trim(), assigneeId: value.assigneeId,
    description: typeof value.description === 'string' ? value.description.trim() || null : null });
}

export function taskIdFromAttempt(tenantId: string, projectId: string, key: string) {
  requireId(tenantId,'PROJECT_TASK_TENANT_INVALID');
  requireId(projectId,'PROJECT_TASK_PROJECT_ID_INVALID');
  if (typeof key !== 'string' || !ATTEMPT.test(key)) throw new TypeError('PROJECT_TASK_IDEMPOTENCY_KEY_INVALID');
  const bytes = createHash('sha256').update('contagest:project-task:v761\0').update(tenantId)
    .update('\0').update(projectId).update('\0').update(key.toLowerCase()).digest().subarray(0,16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = bytes.toString('hex');
  return [value.slice(0,8),value.slice(8,12),value.slice(12,16),value.slice(16,20),value.slice(20)].join('-');
}

function assertProject(project: any, tenantId: string, projectId: string) {
  const payload = project?.payload;
  if (!project) throw new ProjectTaskNotFound();
  if (project.id !== projectId || project.tenantId !== tenantId || project.moduleSlug !== PROJECT_SLUG ||
      !['planning','active','archived'].includes(project.status) ||
      !payload || Array.isArray(payload) || payload.schemaVersion !== 1 ||
      typeof payload !== 'object' || typeof payload.managerId !== 'string' ||
      typeof payload.clientId !== 'string' || !UUID.test(payload.clientId)) {
    throw new TypeError('PROJECT_TASK_PARENT_SCOPE_INVALID');
  }
  return payload as {managerId:string;clientId:string};
}

export function serializeTask(row: any, tenantId: string, projectId: string, clientId: string) {
  const payload = row?.payload;
  if (!row || row.tenantId !== tenantId || row.moduleSlug !== PROJECT_TASK_SLUG ||
      row.status !== 'todo' || !payload || typeof payload !== 'object' || Array.isArray(payload) ||
      payload.schemaVersion !== 1 || payload.projectId !== projectId || payload.clientId !== clientId ||
      !UUID.test(payload.assigneeId || '') || !UUID.test(payload.creatorId || '') ||
      typeof row.title !== 'string' || row.title.trim().length < 3) {
    throw new TypeError('PROJECT_TASK_ROW_SCOPE_INVALID');
  }
  return Object.freeze({id:row.id, projectId, title:row.title, status:row.status,
    assigneeId:payload.assigneeId, creatorId:payload.creatorId,
    description:typeof payload.description === 'string' ? payload.description : null,
    createdAt:row.createdAt,updatedAt:row.updatedAt});
}

/** All references are read under SERIALIZABLE isolation before task+audit insert. */
export async function createProjectTask({db, tenantId, actorId, projectId, idempotencyKey,
  draft, ipAddress, userAgent}: {
  db:any;tenantId:string;actorId:string;projectId:string;idempotencyKey:string;draft:unknown;
  ipAddress?:string;userAgent?:string|string[];
}) {
  requireId(tenantId,'PROJECT_TASK_TENANT_INVALID');
  requireId(actorId,'PROJECT_TASK_ACTOR_INVALID');
  const id = taskIdFromAttempt(tenantId,projectId,idempotencyKey);
  const data = validateTaskDraft(draft);
  if (typeof db?.$transaction !== 'function') throw new TypeError('PROJECT_TASK_TRANSACTION_REQUIRED');
  try {
    return await db.$transaction(async (tx:any) => {
      if (!tx.moduleRecord?.findFirst || !tx.moduleRecord?.create ||
          !tx.userProfile?.findFirst || !tx.client?.findFirst || !tx.auditLog?.create) {
        throw new TypeError('PROJECT_TASK_STORE_AUTHORITY_REQUIRED');
      }
      const project = await tx.moduleRecord.findFirst({where:{id:projectId,tenantId,moduleSlug:PROJECT_SLUG}});
      const parent = assertProject(project,tenantId,projectId);
      if (project.status !== 'active') throw new ProjectTaskConflict();
      if (parent.managerId !== actorId) throw new ProjectTaskForbidden();
      const manager = await tx.userProfile.findFirst({where:{id:actorId,tenantId,status:'active'},select:{id:true,tenantId:true}});
      const assignee = await tx.userProfile.findFirst({where:{id:data.assigneeId,tenantId,status:'active'},select:{id:true,tenantId:true}});
      const client = await tx.client.findFirst({where:{id:parent.clientId,tenantId,active:true},select:{id:true,tenantId:true}});
      if (!manager || manager.id !== actorId || manager.tenantId !== tenantId) throw new ProjectTaskForbidden();
      if (!assignee || assignee.id !== data.assigneeId || assignee.tenantId !== tenantId ||
          !client || client.id !== parent.clientId || client.tenantId !== tenantId) throw new ProjectTaskNotFound();
      const record = await tx.moduleRecord.create({data:{id,tenantId,moduleSlug:PROJECT_TASK_SLUG,
        title:data.title,status:'todo',payload:{schemaVersion:1,projectId,clientId:parent.clientId,
          assigneeId:assignee.id,creatorId:actorId,description:data.description}}});
      await tx.auditLog.create({data:{tenantId,userId:actorId,action:'project.task.create',
        entity:'ModuleRecord',entityId:record.id,
        after:{moduleSlug:PROJECT_TASK_SLUG,projectId,status:'todo',assigneeId:assignee.id},
        ipAddress:ipAddress||null,userAgent:typeof userAgent==='string'?userAgent:null}});
      return serializeTask(record,tenantId,projectId,parent.clientId);
    },{isolationLevel:'Serializable'});
  } catch (error:any) {
    if (error?.code === 'P2002' || error?.code === 'P2034') throw new ProjectTaskConflict();
    throw error;
  }
}

/** Historical tasks remain readable for archived projects; the list never alters state. */
export async function listProjectTasks({db,tenantId,projectId,take=50,skip=0}: {
  db:any;tenantId:string;projectId:string;take?:number;skip?:number;
}) {
  requireId(tenantId,'PROJECT_TASK_TENANT_INVALID');
  requireId(projectId,'PROJECT_TASK_PROJECT_ID_INVALID');
  if (!Number.isSafeInteger(take) || take<1 || take>PROJECT_TASK_PAGE_LIMIT ||
      !Number.isSafeInteger(skip) || skip<0 || skip>10000) throw new TypeError('PROJECT_TASK_PAGE_INVALID');
  if (!db?.moduleRecord?.findFirst || !db?.moduleRecord?.findMany) throw new TypeError('PROJECT_TASK_STORE_AUTHORITY_REQUIRED');
  const project = await db.moduleRecord.findFirst({where:{id:projectId,tenantId,moduleSlug:PROJECT_SLUG}});
  const parent = assertProject(project,tenantId,projectId);
  const rows = await db.moduleRecord.findMany({where:{tenantId,moduleSlug:PROJECT_TASK_SLUG,
    status:'todo',payload:{path:['projectId'],equals:projectId}},take:take+1,skip,
    orderBy:[{createdAt:'desc'},{id:'desc'}]});
  if (!Array.isArray(rows) || rows.length>take+1) throw new TypeError('PROJECT_TASK_PAGE_RESULT_INVALID');
  const result = rows.slice(0,take).map(row=>serializeTask(row,tenantId,projectId,parent.clientId));
  return Object.freeze({items:result,pagination:Object.freeze({take,skip,hasMore:rows.length>take,
    nextSkip:rows.length>take?skip+take:null,consistency:'REQUEST_SNAPSHOT_ONLY'})});
}
