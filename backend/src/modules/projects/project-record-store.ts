import { createHash } from 'node:crypto';

/**
 * #761 Project v1: real project creation/list on the existing ModuleRecord table.
 * Not the generic Stitch module; no task/timesheet/invoice authority is granted.
 */
export const PROJECT_RECORD_SLUG = 'project-workspace-v761';
export const PROJECT_MAX_PAGE = 100;
const UUID_V4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ProjectReplayConflict extends Error {
  constructor(){super('PROJECT_CREATE_REPLAY_CONFLICT');}
}
export class ProjectOwnerNotFound extends Error {
  constructor(){super('PROJECT_CLIENT_OR_MANAGER_NOT_FOUND');}
}

function serverId(value: unknown, name: string): string {
  if(typeof value!=='string'||!value.trim()||value.length>128)throw new TypeError(name);
  return value;
}

export function projectIdFromAttempt(tenantId: string, idempotencyKey: string): string {
  serverId(tenantId,'PROJECT_TENANT_REQUIRED');
  if(typeof idempotencyKey!=='string'||!UUID_V4.test(idempotencyKey)){
    throw new TypeError('PROJECT_IDEMPOTENCY_KEY_INVALID');
  }
  const bytes=createHash('sha256').update('contagest:project:v761\0')
    .update(tenantId).update('\0').update(idempotencyKey.toLowerCase()).digest().subarray(0,16);
  bytes[6]=(bytes[6]&0x0f)|0x50;
  bytes[8]=(bytes[8]&0x3f)|0x80;
  const h=bytes.toString('hex');
  return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
}

export function validateProjectDraft(value: unknown) {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('PROJECT_DRAFT_INVALID');
  const obj=value as Record<string,unknown>;
  if(Object.keys(obj).some(k=>!['name','clientId','description'].includes(k))){
    throw new TypeError('PROJECT_DRAFT_UNKNOWN_FIELD');
  }
  if(typeof obj.name!=='string'||obj.name.trim().length<3||obj.name.trim().length>160){
    throw new TypeError('PROJECT_NAME_INVALID');
  }
  if(typeof obj.clientId!=='string'||!UUID.test(obj.clientId)){
    throw new TypeError('PROJECT_CLIENT_ID_INVALID');
  }
  if(obj.description!==undefined&&obj.description!==null&&
     (typeof obj.description!=='string'||obj.description.trim().length>2000)){
    throw new TypeError('PROJECT_DESCRIPTION_INVALID');
  }
  return Object.freeze({
    name:obj.name.trim(),
    clientId:obj.clientId,
    description:typeof obj.description==='string'?obj.description.trim()||null:null
  });
}

export function serializeProjectRecord(row: any,tenantId: string) {
  const payload=row?.payload;
  if(!row||row.tenantId!==tenantId||row.moduleSlug!==PROJECT_RECORD_SLUG||
     !payload||typeof payload!=='object'||Array.isArray(payload)||
     payload.schemaVersion!==1||typeof payload.clientId!=='string'||
     !UUID.test(payload.clientId)||typeof payload.managerId!=='string'||
     !payload.managerId.trim()||typeof row.title!=='string'||
     row.title.length<3||!['planning','active','archived'].includes(row.status)){
    throw new TypeError('PROJECT_TENANT_DATA_LEAK_BLOCKED');
  }
  return Object.freeze({
    id:row.id,name:row.title,clientId:payload.clientId,managerId:payload.managerId,
    status:row.status,description:typeof payload.description==='string'?payload.description:null,
    createdAt:row.createdAt,updatedAt:row.updatedAt
  });
}

/** Server principal, client ownership and audit are checked inside ONE transaction. */
export async function createProjectRecord({db,tenantId,actorId,idempotencyKey,draft,ipAddress,userAgent}: {
  db:any;tenantId:string;actorId:string;idempotencyKey:string;draft:unknown;
  ipAddress?:string;userAgent?:string|string[];
}) {
  serverId(tenantId,'PROJECT_TENANT_REQUIRED');
  serverId(actorId,'PROJECT_ACTOR_REQUIRED');
  if(typeof db?.$transaction!=='function')throw new TypeError('PROJECT_TRANSACTION_REQUIRED');
  const id=projectIdFromAttempt(tenantId,idempotencyKey);
  const input=validateProjectDraft(draft);
  try{
    return await db.$transaction(async (tx:any)=>{
      if(!tx.client?.findFirst||!tx.userProfile?.findFirst||
         !tx.moduleRecord?.create||!tx.auditLog?.create){
        throw new TypeError('PROJECT_STORE_AUTHORITY_REQUIRED');
      }
      const client=await tx.client.findFirst({
        where:{id:input.clientId,tenantId,active:true},select:{id:true,tenantId:true}
      });
      if(!client||client.tenantId!==tenantId)throw new ProjectOwnerNotFound();
      const actor=await tx.userProfile.findFirst({
        where:{id:actorId,tenantId,status:'active'},select:{id:true,tenantId:true}
      });
      if(!actor||actor.tenantId!==tenantId)throw new ProjectOwnerNotFound();
      const saved=await tx.moduleRecord.create({data:{
        id,tenantId,moduleSlug:PROJECT_RECORD_SLUG,title:input.name,status:'planning',
        payload:{schemaVersion:1,clientId:client.id,managerId:actor.id,description:input.description}
      }});
      await tx.auditLog.create({data:{
        tenantId,userId:actorId,action:'project.create',entity:'ModuleRecord',
        entityId:saved.id,
        after:{moduleSlug:PROJECT_RECORD_SLUG,status:'planning',clientId:client.id,managerId:actor.id},
        ipAddress:ipAddress||null,userAgent:typeof userAgent==='string'?userAgent:null
      }});
      return serializeProjectRecord(saved,tenantId);
    });
  }catch(error:any){
    if(error?.code==='P2002')throw new ProjectReplayConflict();
    throw error;
  }
}

export async function listProjectRecords({db,tenantId,take=50,skip=0}:{
  db:any;tenantId:string;take?:number;skip?:number;
}) {
  serverId(tenantId,'PROJECT_TENANT_REQUIRED');
  if(!db?.moduleRecord?.findMany)throw new TypeError('PROJECT_STORE_REQUIRED');
  if(!Number.isSafeInteger(take)||take<1||take>PROJECT_MAX_PAGE||
     !Number.isSafeInteger(skip)||skip<0||skip>10000){
    throw new TypeError('PROJECT_PAGE_INVALID');
  }
  const rows=await db.moduleRecord.findMany({
    where:{tenantId,moduleSlug:PROJECT_RECORD_SLUG},
    take:take+1,skip,orderBy:[{createdAt:'desc'},{id:'desc'}]
  });
  if(!Array.isArray(rows)||rows.length>take+1)throw new TypeError('PROJECT_PAGE_RESULT_INVALID');
  return Object.freeze({
    items:rows.slice(0,take).map(row=>serializeProjectRecord(row,tenantId)),
    pagination:Object.freeze({take,skip,hasMore:rows.length>take,
      nextSkip:rows.length>take?skip+take:null})
  });
}
