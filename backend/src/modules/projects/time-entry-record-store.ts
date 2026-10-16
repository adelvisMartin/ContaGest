import { createHash } from 'node:crypto';
import { normalizeProjectTimePeriod } from './time-entry-period.js';

/** #761 Draft-only, unaudited money/time authority. Storage remains behind a default-OFF route. */
export const PROJECT_TIME_ENTRY_SLUG = 'project-time-entry-v761';
const PROJECT_SLUG = 'project-workspace-v761';
const TASK_SLUG = 'project-task-v761';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ATTEMPT = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export class ProjectTimeEntryNotFound extends Error { constructor(){super('PROJECT_TIME_ENTRY_PARENT_NOT_FOUND');} }
export class ProjectTimeEntryForbidden extends Error { constructor(){super('PROJECT_TIME_ENTRY_ASSIGNEE_REQUIRED');} }
export class ProjectTimeEntryConflict extends Error { constructor(){super('PROJECT_TIME_ENTRY_REPLAY_OR_CHANGED_PARENT');} }
function id(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new TypeError(label);
}

export function timeEntryIdFromAttempt(tenantId: string, projectId: string, taskId: string, key: string) {
  id(tenantId,'PROJECT_TIME_ENTRY_TENANT_INVALID');
  id(projectId,'PROJECT_TIME_ENTRY_PROJECT_INVALID');
  id(taskId,'PROJECT_TIME_ENTRY_TASK_INVALID');
  if (typeof key !== 'string' || !ATTEMPT.test(key)) throw new TypeError('PROJECT_TIME_ENTRY_IDEMPOTENCY_INVALID');
  const buffer = createHash('sha256').update('contagest:time-entry:v761\0').update(tenantId)
    .update('\0').update(projectId).update('\0').update(taskId).update('\0')
    .update(key.toLowerCase()).digest().subarray(0,16);
  buffer[6]=(buffer[6]&0x0f)|0x50;
  buffer[8]=(buffer[8]&0x3f)|0x80;
  const s=buffer.toString('hex');
  return [s.slice(0,8),s.slice(8,12),s.slice(12,16),s.slice(16,20),s.slice(20)].join('-');
}

export function validateTimeEntryDraft(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('PROJECT_TIME_ENTRY_DRAFT_INVALID');
  const value=raw as Record<string,unknown>;
  if (Object.keys(value).some(k=>!['startedAt','endedAt','source','recordedMinutes'].includes(k))) {
    throw new TypeError('PROJECT_TIME_ENTRY_FIELD_FORBIDDEN');
  }
  // 'timer' requires a durable server timer session in a later ticket.
  if (value.source !== 'manual') throw new TypeError('PROJECT_TIME_ENTRY_TIMER_NOT_VERIFIED');
  if (typeof value.startedAt!=='string' || typeof value.endedAt!=='string') {
    throw new TypeError('PROJECT_TIME_ENTRY_TIMESTAMP_INVALID');
  }
  if (value.recordedMinutes !== undefined &&
      (!Number.isSafeInteger(value.recordedMinutes) || (value.recordedMinutes as number)<=0)) {
    throw new TypeError('PROJECT_TIME_ENTRY_MINUTES_INVALID');
  }
  return Object.freeze({startedAt:value.startedAt,endedAt:value.endedAt,
    source:'manual' as const,recordedMinutes:value.recordedMinutes as number|undefined});
}

type Ref = {id:string;tenantId:string;moduleSlug:string;status:string;payload:any};
function parents(project: Ref|null, task: Ref|null, tenantId: string, projectId: string,
  taskId:string, memberId: string, writable: boolean) {
  if (!project || !task) throw new ProjectTimeEntryNotFound();
  const p=project.payload,t=task.payload;
  if (project.id!==projectId || task.id!==taskId || project.tenantId!==tenantId ||
      task.tenantId!==tenantId || project.moduleSlug!==PROJECT_SLUG || task.moduleSlug!==TASK_SLUG ||
      !p || typeof p!=='object' || Array.isArray(p) || p.schemaVersion!==1 ||
      !UUID.test(p.clientId||'') || !UUID.test(p.managerId||'') ||
      !t || typeof t!=='object' || Array.isArray(t) || t.schemaVersion!==1 ||
      t.projectId!==projectId || t.clientId!==p.clientId || !UUID.test(t.assigneeId||'') ||
      !['planning','active','archived'].includes(project.status) ||
      !['todo','in_progress','done'].includes(task.status)) {
    throw new TypeError('PROJECT_TIME_ENTRY_SCOPE_MISMATCH');
  }
  if (writable && (project.status!=='active' || task.status!=='in_progress')) {
    throw new ProjectTimeEntryConflict();
  }
  if (writable && t.assigneeId!==memberId) throw new ProjectTimeEntryForbidden();
  return {clientId:p.clientId as string,memberId:t.assigneeId as string};
}

export function serializeTimeEntry(row:any,tenantId:string,projectId:string,taskId:string,clientId:string) {
  const p=row?.payload;
  if (!row || row.tenantId!==tenantId || row.moduleSlug!==PROJECT_TIME_ENTRY_SLUG ||
      !['draft','submitted','rejected','approved'].includes(row.status) || !p || typeof p!=='object' || Array.isArray(p) ||
      p.schemaVersion!==1 || p.projectId!==projectId || p.taskId!==taskId ||
      p.clientId!==clientId || !UUID.test(p.memberId||'') ||
      p.source!=='manual' || !Number.isSafeInteger(p.durationMinutes) ||
      p.durationMinutes<1 || p.durationMinutes>1440 ||
      typeof p.startedAtUtc!=='string' || typeof p.endedAtUtc!=='string' ||
      !UTC.test(p.startedAtUtc) || !UTC.test(p.endedAtUtc) ||
      (!Number.isSafeInteger(p.revision) || p.revision<1 || p.revision>=Number.MAX_SAFE_INTEGER) ||
      p.billable!==false || p.linkedInvoiceId!==null ||
      (row.status==='approved' ? (typeof p.approvedBy!=='string' || !UUID.test(p.approvedBy) ||
        typeof p.approvedAt!=='string' || !UTC.test(p.approvedAt) ||
        !Number.isFinite(Date.parse(p.approvedAt)) ||
        new Date(p.approvedAt).toISOString()!==p.approvedAt) :
        (p.approvedAt!==null || p.approvedBy!==null))) {
    throw new TypeError('PROJECT_TIME_ENTRY_STORED_SCOPE_INVALID');
  }
  // Stored timestamps and duration must still agree on every read.
  if (!Number.isFinite(Date.parse(p.startedAtUtc)) || !Number.isFinite(Date.parse(p.endedAtUtc)) ||
      new Date(p.startedAtUtc).toISOString()!==p.startedAtUtc ||
      new Date(p.endedAtUtc).toISOString()!==p.endedAtUtc ||
      (Date.parse(p.endedAtUtc)-Date.parse(p.startedAtUtc))!==p.durationMinutes*60000) {
    throw new TypeError('PROJECT_TIME_ENTRY_STORED_DURATION_INVALID');
  }
  return Object.freeze({id:row.id,projectId,taskId,clientId,memberId:p.memberId,
    startedAtUtc:p.startedAtUtc,endedAtUtc:p.endedAtUtc,durationMinutes:p.durationMinutes,
    source:p.source,status:row.status as 'draft'|'submitted'|'rejected'|'approved',
    revision:p.revision as number,billable:false as const,
    createdAt:row.createdAt,updatedAt:row.updatedAt});
}

/**
 * Predicate used inside the same SERIALIZABLE transaction as the INSERT.
 * PostgreSQL JSONB string comparisons are valid for canonical, fixed-width UTC
 * timestamps (ISO 8601); two half-open windows overlap iff start < otherEnd
 * AND end > otherStart. Scope by MEMBER, not only task/project, so the same
 * worker cannot book overlapping minutes on two different client projects.
 * Only one matching row is needed: no unbounded application-side history scan.
 * Rows of every status are considered, including future approved/invoiced ones.
 */
export function memberTimeOverlapQuery(tenantId: string, memberId: string,
  startUtc: string, endUtc: string) {
  id(tenantId,'PROJECT_TIME_ENTRY_TENANT_INVALID');
  id(memberId,'PROJECT_TIME_ENTRY_ACTOR_INVALID');
  for (const value of [startUtc,endUtc]) {
    if (!UTC.test(value) || !Number.isFinite(Date.parse(value)) ||
        new Date(value).toISOString()!==value) {
      throw new TypeError('PROJECT_TIME_ENTRY_OVERLAP_TIMESTAMP_INVALID');
    }
  }
  if (startUtc>=endUtc) throw new TypeError('PROJECT_TIME_ENTRY_OVERLAP_INTERVAL_INVALID');
  return {
    where:{tenantId,moduleSlug:PROJECT_TIME_ENTRY_SLUG,
      AND:[
        {payload:{path:['memberId'],equals:memberId}},
        {payload:{path:['startedAtUtc'],lt:endUtc}},
        {payload:{path:['endedAtUtc'],gt:startUtc}}
      ]},
    select:{id:true},take:1
  };
}

/** Only the authenticated active task assignee can persist personal MANUAL time. */
export async function createTimeEntryDraft({db,tenantId,actorId,projectId,taskId,
  idempotencyKey,draft,ipAddress,userAgent}: {
  db:any;tenantId:string;actorId:string;projectId:string;taskId:string;
  idempotencyKey:string;draft:unknown;ipAddress?:string;userAgent?:string|string[];
}) {
  id(actorId,'PROJECT_TIME_ENTRY_ACTOR_INVALID');
  const recordId=timeEntryIdFromAttempt(tenantId,projectId,taskId,idempotencyKey);
  const proposed=validateTimeEntryDraft(draft);
  if (typeof db?.$transaction!=='function') throw new TypeError('PROJECT_TIME_ENTRY_TX_REQUIRED');
  try {
    return await db.$transaction(async (tx:any)=>{
      if (!tx.moduleRecord?.findFirst || !tx.moduleRecord?.findMany || !tx.moduleRecord?.create ||
          !tx.userProfile?.findFirst || !tx.client?.findFirst || !tx.auditLog?.create) {
        throw new TypeError('PROJECT_TIME_ENTRY_DB_AUTHORITY_REQUIRED');
      }
      const project=await tx.moduleRecord.findFirst({where:{id:projectId,tenantId,moduleSlug:PROJECT_SLUG}});
      const task=await tx.moduleRecord.findFirst({where:{id:taskId,tenantId,moduleSlug:TASK_SLUG}});
      const {clientId}=parents(project,task,tenantId,projectId,taskId,actorId,true);
      const [actor,client]=await Promise.all([
        tx.userProfile.findFirst({where:{id:actorId,tenantId,status:'active'},select:{id:true,tenantId:true}}),
        tx.client.findFirst({where:{id:clientId,tenantId,active:true},select:{id:true,tenantId:true}})
      ]);
      if (!actor || actor.id!==actorId || actor.tenantId!==tenantId) throw new ProjectTimeEntryForbidden();
      if (!client || client.id!==clientId || client.tenantId!==tenantId) throw new ProjectTimeEntryNotFound();
      const time=normalizeProjectTimePeriod({tenantId,clientId,memberId:actorId,
        project:{id:projectId,tenantId,clientId},task:{id:taskId,tenantId,projectId},
        ...proposed});
      // Serializable predicate read + insert makes concurrent cross-task overlap
      // attempts conflict. A P2034 serialization failure maps to 409 below.
      const conflicts=await tx.moduleRecord.findMany(memberTimeOverlapQuery(
        tenantId,actorId,time.startedAtUtc,time.endedAtUtc));
      if (!Array.isArray(conflicts) || conflicts.length>1) {
        throw new TypeError('PROJECT_TIME_ENTRY_OVERLAP_QUERY_INVALID');
      }
      if (conflicts.length>0) throw new ProjectTimeEntryConflict();
      const saved=await tx.moduleRecord.create({data:{id:recordId,tenantId,
        moduleSlug:PROJECT_TIME_ENTRY_SLUG,title:'Registro horario',status:'draft',
        payload:{schemaVersion:1,projectId,taskId,clientId,memberId:actorId,
          source:'manual',startedAtUtc:time.startedAtUtc,endedAtUtc:time.endedAtUtc,
          durationMinutes:time.durationMinutes,revision:1,billable:false,
          linkedInvoiceId:null,approvedAt:null,approvedBy:null}}});
      await tx.auditLog.create({data:{tenantId,userId:actorId,action:'project.time-entry.create',
        entity:'ModuleRecord',entityId:recordId,
        after:{moduleSlug:PROJECT_TIME_ENTRY_SLUG,projectId,taskId,
          durationMinutes:time.durationMinutes,status:'draft'},
        ipAddress:ipAddress||null,userAgent:typeof userAgent==='string'?userAgent:null}});
      return serializeTimeEntry(saved,tenantId,projectId,taskId,clientId);
    },{isolationLevel:'Serializable'});
  } catch(e:any) {
    if (e?.code==='P2002'||e?.code==='P2034') throw new ProjectTimeEntryConflict();
    throw e;
  }
}

export async function listTimeEntryDrafts({db,tenantId,projectId,taskId,actorId,
  take=50,skip=0}: {db:any;tenantId:string;projectId:string;taskId:string;
  actorId:string;take?:number;skip?:number}) {
  id(tenantId,'PROJECT_TIME_ENTRY_TENANT_INVALID');
  id(projectId,'PROJECT_TIME_ENTRY_PROJECT_INVALID');
  id(taskId,'PROJECT_TIME_ENTRY_TASK_INVALID');
  id(actorId,'PROJECT_TIME_ENTRY_ACTOR_INVALID');
  if (!Number.isSafeInteger(take)||take<1||take>100||
      !Number.isSafeInteger(skip)||skip<0||skip>10000) throw new TypeError('PROJECT_TIME_ENTRY_PAGE_INVALID');
  if (!db?.$transaction) throw new TypeError('PROJECT_TIME_ENTRY_TX_REQUIRED');
  return db.$transaction(async (tx:any)=>{
    if (!tx.moduleRecord?.findFirst || !tx.moduleRecord?.findMany) throw new TypeError('PROJECT_TIME_ENTRY_DB_AUTHORITY_REQUIRED');
    const project=await tx.moduleRecord.findFirst({where:{id:projectId,tenantId,moduleSlug:PROJECT_SLUG}});
    const task=await tx.moduleRecord.findFirst({where:{id:taskId,tenantId,moduleSlug:TASK_SLUG}});
    const {clientId,memberId}=parents(project,task,tenantId,projectId,taskId,actorId,false);
    // Only the actual assignee can view personal timesheets; manager read is a later permission decision.
    if (actorId!==memberId) throw new ProjectTimeEntryForbidden();
    const rows=await tx.moduleRecord.findMany({where:{tenantId,moduleSlug:PROJECT_TIME_ENTRY_SLUG,
      payload:{path:['taskId'],equals:taskId}},take:take+1,skip,
      orderBy:[{createdAt:'desc'},{id:'desc'}]});
    if (!Array.isArray(rows)||rows.length>take+1) throw new TypeError('PROJECT_TIME_ENTRY_PAGE_RESULT_INVALID');
    return Object.freeze({items:rows.slice(0,take).map((row:any)=>{
      const entry=serializeTimeEntry(row,tenantId,projectId,taskId,clientId);
      if (entry.memberId!==actorId) throw new TypeError('PROJECT_TIME_ENTRY_STORED_SCOPE_INVALID');
      return entry;
    }),pagination:Object.freeze({take,skip,hasMore:rows.length>take,
      nextSkip:rows.length>take?skip+take:null})});
  },{isolationLevel:'Serializable'});
}

/** Read listing preserves submitted/rejected/approved review history. */
export const listTimeEntries = listTimeEntryDrafts;
