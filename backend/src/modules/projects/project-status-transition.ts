import { PROJECT_RECORD_SLUG, serializeProjectRecord } from './project-record-store.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CANONICAL_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export class ProjectStatusNotFound extends Error {
  constructor(){super('PROJECT_STATUS_NOT_FOUND');}
}
export class ProjectStatusConflict extends Error {
  constructor(){super('PROJECT_STATUS_STALE_REVISION');}
}
export class ProjectStatusForbidden extends Error {
  constructor(){super('PROJECT_STATUS_MANAGER_REQUIRED');}
}
export class ProjectStatusTransitionRejected extends Error {
  constructor(){super('PROJECT_STATUS_TRANSITION_INVALID');}
}

/** The caller supplies the authenticated server context, never browser-owned IDs. */
export function planProjectStatusChange(from: 'planning'|'active'|'archived', to: 'active'|'archived', expectedUpdatedAt: string){
  if(typeof expectedUpdatedAt!=='string'||!CANONICAL_UTC.test(expectedUpdatedAt)||
     !Number.isFinite(Date.parse(expectedUpdatedAt))||
     new Date(expectedUpdatedAt).toISOString()!==expectedUpdatedAt){
    throw new TypeError('PROJECT_STATUS_REVISION_REQUIRED');
  }
  if(!((from==='planning' && to==='active') ||
       (from==='active' && to==='archived'))){
    throw new ProjectStatusTransitionRejected();
  }
  return Object.freeze({from,to,expectedUpdatedAt});
}

/**
 * Changes a single Project status with tenant-scoped optimistic concurrency.
 * Both the guarded update and its minimum-PII audit must commit together.
 * No timesheet, invoice or ledger write is performed.
 */
export async function transitionProjectStatus({db,tenantId,actorId,projectId,nextStatus,
  expectedUpdatedAt,ipAddress,userAgent}: {
  db:any;tenantId:string;actorId:string;projectId:string;
  nextStatus:'active'|'archived';expectedUpdatedAt:string;
  ipAddress?:string;userAgent?:string|string[];
}){
  if(typeof tenantId!=='string'||!tenantId.trim()||tenantId.length>128){
    throw new TypeError('PROJECT_STATUS_TENANT_REQUIRED');
  }
  if(typeof actorId!=='string'||!actorId.trim()||actorId.length>128){
    throw new TypeError('PROJECT_STATUS_ACTOR_REQUIRED');
  }
  if(typeof projectId!=='string'||!UUID.test(projectId)){
    throw new TypeError('PROJECT_STATUS_ID_INVALID');
  }
  if(nextStatus!=='active'&&nextStatus!=='archived'){
    throw new ProjectStatusTransitionRejected();
  }
  // Parse the canonical timestamp before acquiring a database connection.
  planProjectStatusChange(nextStatus==='active'?'planning':'active',nextStatus,expectedUpdatedAt);
  if(!db||typeof db.$transaction!=='function')throw new TypeError('PROJECT_STATUS_TRANSACTION_REQUIRED');
  return db.$transaction(async (tx:any)=>{
    if(!tx.moduleRecord?.findFirst||!tx.moduleRecord?.updateMany||
       !tx.userProfile?.findFirst||!tx.auditLog?.create){
      throw new TypeError('PROJECT_STATUS_AUTHORITY_REQUIRED');
    }
    const where={id:projectId,tenantId,moduleSlug:PROJECT_RECORD_SLUG};
    const before=await tx.moduleRecord.findFirst({where,
      select:{id:true,tenantId:true,moduleSlug:true,title:true,status:true,
        payload:true,createdAt:true,updatedAt:true}});
    if(!before)throw new ProjectStatusNotFound();
    const project=serializeProjectRecord(before,tenantId);
    if(!(before.updatedAt instanceof Date)||
       !Number.isFinite(before.updatedAt.getTime())){
      throw new TypeError('PROJECT_STATUS_STORED_REVISION_INVALID');
    }
    if(before.updatedAt.toISOString()!==expectedUpdatedAt){
      throw new ProjectStatusConflict();
    }
    if(project.managerId!==actorId)throw new ProjectStatusForbidden();
    const actor=await tx.userProfile.findFirst({
      where:{id:actorId,tenantId,status:'active'},select:{id:true,tenantId:true}
    });
    if(!actor||actor.id!==actorId||actor.tenantId!==tenantId){
      throw new ProjectStatusForbidden();
    }
    const intent=planProjectStatusChange(before.status,nextStatus,expectedUpdatedAt);
    const updated=await tx.moduleRecord.updateMany({
      where:{...where,status:intent.from,updatedAt:new Date(expectedUpdatedAt)},
      data:{status:intent.to}
    });
    if(updated?.count!==1)throw new ProjectStatusConflict();
    await tx.auditLog.create({data:{
      tenantId,userId:actorId,action:'project.status.change',
      entity:'ModuleRecord',entityId:projectId,
      before:{moduleSlug:PROJECT_RECORD_SLUG,status:intent.from},
      after:{moduleSlug:PROJECT_RECORD_SLUG,status:intent.to},
      ipAddress:ipAddress||null,userAgent:typeof userAgent==='string'?userAgent:null
    }});
    const after=await tx.moduleRecord.findFirst({where,
      select:{id:true,tenantId:true,moduleSlug:true,title:true,status:true,
        payload:true,createdAt:true,updatedAt:true}});
    if(!after||after.status!==intent.to||!(after.updatedAt instanceof Date)){
      throw new Error('PROJECT_STATUS_POST_WRITE_INVALID');
    }
    const record=serializeProjectRecord(after,tenantId);
    return Object.freeze({id:record.id,status:record.status,
      updatedAt:after.updatedAt.toISOString()});
  });
}
