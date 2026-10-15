import { prepareProjectTimeReviewIntent, type ProjectTimeReviewAction } from './time-entry-review-intent.js';
import { PROJECT_TIME_ENTRY_SLUG, serializeTimeEntry } from './time-entry-record-store.js';

const PROJECT_SLUG='project-workspace-v761';
const TASK_SLUG='project-task-v761';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class TimeReviewMissing extends Error { constructor(){super('PROJECT_TIME_REVIEW_NOT_FOUND');} }
export class TimeReviewForbidden extends Error { constructor(){super('PROJECT_TIME_REVIEW_FORBIDDEN');} }
export class TimeReviewConflict extends Error { constructor(){super('PROJECT_TIME_REVIEW_CONFLICT');} }
export class TimeReviewStateError extends Error { constructor(){super('PROJECT_TIME_REVIEW_TRANSITION_INVALID');} }

function validId(value:unknown,label:string):asserts value is string {
  if(typeof value!=='string'||!UUID.test(value))throw new TypeError(label);
}

/**
 * Persist a time-review transition atomically. This service receives tenant and
 * actor IDs ONLY from server-authenticated request context. The reviewer grant
 * comes from a same-tenant active Project.managerId lookup, never client JSON.
 * Even an approved entry remains billable=false, with no pricing or ledger effect.
 */
export async function transitionTimeEntryReview({db,tenantId,actorId,projectId,taskId,
  entryId,action,expectedRevision,ipAddress,userAgent}: {
  db:any;tenantId:string;actorId:string;projectId:string;taskId:string;entryId:string;
  action:ProjectTimeReviewAction;expectedRevision:number;ipAddress?:string;userAgent?:string|string[];
}) {
  validId(tenantId,'PROJECT_TIME_REVIEW_TENANT_INVALID');
  validId(actorId,'PROJECT_TIME_REVIEW_ACTOR_INVALID');
  validId(projectId,'PROJECT_TIME_REVIEW_PROJECT_INVALID');
  validId(taskId,'PROJECT_TIME_REVIEW_TASK_INVALID');
  validId(entryId,'PROJECT_TIME_REVIEW_ENTRY_INVALID');
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1||expectedRevision>=Number.MAX_SAFE_INTEGER){
    throw new TypeError('PROJECT_TIME_REVIEW_REVISION_INVALID');
  }
  if(!['submit','withdraw','revise','reject','approve'].includes(action)){
    throw new TimeReviewStateError();
  }
  if(typeof db?.$transaction!=='function')throw new TypeError('PROJECT_TIME_REVIEW_TRANSACTION_REQUIRED');
  try{
    return await db.$transaction(async(tx:any)=>{
      if(!tx.moduleRecord?.findFirst||!tx.moduleRecord?.updateMany||
         !tx.userProfile?.findFirst||!tx.client?.findFirst||!tx.auditLog?.create){
        throw new TypeError('PROJECT_TIME_REVIEW_DB_AUTHORITY_REQUIRED');
      }
      const project=await tx.moduleRecord.findFirst({where:{id:projectId,tenantId,moduleSlug:PROJECT_SLUG}});
      const task=await tx.moduleRecord.findFirst({where:{id:taskId,tenantId,moduleSlug:TASK_SLUG}});
      if(!project||!task)throw new TimeReviewMissing();
      const pp=project.payload, tp=task.payload;
      if(project.id!==projectId||task.id!==taskId||project.tenantId!==tenantId||task.tenantId!==tenantId||
         project.moduleSlug!==PROJECT_SLUG||task.moduleSlug!==TASK_SLUG||
         !pp||typeof pp!=='object'||Array.isArray(pp)||pp.schemaVersion!==1||
         !tp||typeof tp!=='object'||Array.isArray(tp)||tp.schemaVersion!==1||
         !UUID.test(pp.clientId||'')||!UUID.test(pp.managerId||'')||
         !UUID.test(tp.assigneeId||'')||tp.projectId!==projectId||tp.clientId!==pp.clientId){
        throw new TypeError('PROJECT_TIME_REVIEW_PARENT_SCOPE_INVALID');
      }
      if(project.status!=='active'||!['in_progress','done'].includes(task.status)){
        throw new TimeReviewConflict();
      }
      const actor=await tx.userProfile.findFirst({where:{id:actorId,tenantId,status:'active'},select:{id:true,tenantId:true}});
      const client=await tx.client.findFirst({where:{id:pp.clientId,tenantId,active:true},select:{id:true,tenantId:true}});
      if(!actor||actor.id!==actorId||actor.tenantId!==tenantId)throw new TimeReviewForbidden();
      if(!client||client.id!==pp.clientId||client.tenantId!==tenantId)throw new TimeReviewMissing();
      const where={id:entryId,tenantId,moduleSlug:PROJECT_TIME_ENTRY_SLUG};
      const before=await tx.moduleRecord.findFirst({where});
      if(!before)throw new TimeReviewMissing();
      const entry=serializeTimeEntry(before,tenantId,projectId,taskId,pp.clientId);
      if(entry.memberId!==tp.assigneeId)throw new TypeError('PROJECT_TIME_REVIEW_MEMBER_SCOPE_INVALID');
      if(!(before.updatedAt instanceof Date)||!Number.isFinite(before.updatedAt.getTime())){
        throw new TypeError('PROJECT_TIME_REVIEW_STORED_TIMESTAMP_INVALID');
      }
      if(entry.revision!==expectedRevision)throw new TimeReviewConflict();
      const decision=prepareProjectTimeReviewIntent({
        tenantId,actor:{id:actorId,tenantId,canReviewTime:actorId===pp.managerId},
        entry:{id:entryId,tenantId,projectId,memberId:entry.memberId,
          state:entry.status,revision:entry.revision,linkedInvoiceId:null},
        action,expectedRevision
      });
      // Preserve every immutable field. Finance authority is ALWAYS false.
      const approved=decision.proposedState==='approved';
      const timestamp=approved?new Date():null;
      const payload={...before.payload,revision:decision.proposedRevision,
        billable:false,linkedInvoiceId:null,approvedAt:approved?timestamp!.toISOString():null,
        approvedBy:approved?actorId:null};
      const updated=await tx.moduleRecord.updateMany({where:{...where,status:decision.previousState,
        updatedAt:before.updatedAt,AND:[
          {payload:{path:['revision'],equals:expectedRevision}},
          {payload:{path:['projectId'],equals:projectId}},
          {payload:{path:['taskId'],equals:taskId}},
          {payload:{path:['memberId'],equals:entry.memberId}}
        ]},data:{status:decision.proposedState,payload}});
      if(updated?.count!==1)throw new TimeReviewConflict();
      await tx.auditLog.create({data:{tenantId,userId:actorId,
        action:'project.time-entry.review.'+action,entity:'ModuleRecord',entityId:entryId,
        before:{moduleSlug:PROJECT_TIME_ENTRY_SLUG,projectId,taskId,
          status:decision.previousState,revision:expectedRevision},
        after:{moduleSlug:PROJECT_TIME_ENTRY_SLUG,projectId,taskId,
          status:decision.proposedState,revision:decision.proposedRevision,
          billable:false},ipAddress:ipAddress||null,
        userAgent:typeof userAgent==='string'?userAgent:null}});
      const after=await tx.moduleRecord.findFirst({where});
      if(!after||after.status!==decision.proposedState||
         after.payload?.revision!==decision.proposedRevision){
        throw new Error('PROJECT_TIME_REVIEW_POST_WRITE_INVALID');
      }
      const output=serializeTimeEntry(after,tenantId,projectId,taskId,pp.clientId);
      if(output.memberId!==entry.memberId||output.billable!==false){
        throw new Error('PROJECT_TIME_REVIEW_POST_WRITE_INVALID');
      }
      return output;
    },{isolationLevel:'Serializable'});
  }catch(error:any){
    if(error instanceof TypeError&&error.message==='PROJECT_TIME_REVIEW_FORBIDDEN')throw new TimeReviewForbidden();
    if(error instanceof TypeError&&error.message==='PROJECT_TIME_REVIEW_TRANSITION_INVALID')throw new TimeReviewStateError();
    if(error?.code==='P2034')throw new TimeReviewConflict();
    if(error instanceof TypeError&&(/PROJECT_TIME_REVIEW_(?:TRANSITION_INVALID|STALE_REVISION)/).test(error.message)){
      throw new TimeReviewConflict();
    }
    throw error;
  }
}
