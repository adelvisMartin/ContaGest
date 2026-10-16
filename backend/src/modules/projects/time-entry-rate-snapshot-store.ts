import { createHash } from 'node:crypto';
import { serializeTimeEntry } from './time-entry-record-store.js';
import { serializeProjectRateCard, PROJECT_RATE_CARD_SLUG } from './project-rate-card-store.js';
import { selectEffectiveRateForApprovedTime } from './project-effective-rate-selection.js';

export const PROJECT_TIME_RATE_SNAPSHOT_SLUG = 'project-time-rate-snapshot-v761';
const PROJECT_SLUG = 'project-workspace-v761';
const TASK_SLUG = 'project-task-v761';
const ENTRY_SLUG = 'project-time-entry-v761';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class SnapshotNotFound extends Error { constructor(){super('PROJECT_SNAPSHOT_NOT_FOUND');} }
export class SnapshotForbidden extends Error { constructor(){super('PROJECT_SNAPSHOT_MANAGER_REQUIRED');} }
export class SnapshotConflict extends Error { constructor(){super('PROJECT_SNAPSHOT_ALREADY_CAPTURED_OR_CHANGED');} }
function validId(v:unknown,label:string): asserts v is string {
  if(typeof v!=='string'||!UUID.test(v))throw new TypeError(label);
}
export function projectTimeSnapshotId(tenantId:string, entryId:string) {
  validId(tenantId,'PROJECT_SNAPSHOT_TENANT_INVALID');
  validId(entryId,'PROJECT_SNAPSHOT_ENTRY_INVALID');
  const b=createHash('sha256').update('contagest:project-time-snapshot:v761\0')
    .update(tenantId.toLowerCase()).update('\0').update(entryId.toLowerCase()).digest().subarray(0,16);
  b[6]=(b[6]&15)|80;b[8]=(b[8]&63)|128;
  const h=b.toString('hex');
  return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
}
export function serializeTimeRateSnapshot(row:any,tenantId:string,projectId:string,taskId:string,entryId:string,clientId:string,memberId:string){
  const p=row?.payload;
  if(!row||row.tenantId!==tenantId||row.moduleSlug!==PROJECT_TIME_RATE_SNAPSHOT_SLUG||
     row.id!==projectTimeSnapshotId(tenantId,entryId)||row.status!=='captured'||
     !p||typeof p!=='object'||Array.isArray(p)||p.schemaVersion!==1||
     p.projectId!==projectId||p.taskId!==taskId||p.entryId!==entryId||
     p.clientId!==clientId||p.memberId!==memberId||
     typeof p.rateCardId!=='string'||!UUID.test(p.rateCardId)||
     !Number.isSafeInteger(p.rateCardRevision)||p.rateCardRevision<1||
     !Number.isSafeInteger(p.entryRevision)||p.entryRevision<2||
     typeof p.hourlyRateExact!=='string'||!/^\d{1,12}\.\d{2}$/.test(p.hourlyRateExact)||
     typeof p.currency!=='string'||!/^[A-Z]{3}$/.test(p.currency)||
     typeof p.effectiveFromUtc!=='string'||
     p.billableAuthorized!==false||p.invoiceAuthorized!==false||p.linkedInvoiceId!==null){
    throw new TypeError('PROJECT_SNAPSHOT_STORED_SCOPE_INVALID');
  }
  return Object.freeze({id:row.id,projectId,taskId,entryId,entryRevision:p.entryRevision,
    memberId,rateCardId:p.rateCardId,rateCardRevision:p.rateCardRevision,
    hourlyRateExact:p.hourlyRateExact,currency:p.currency,effectiveFromUtc:p.effectiveFromUtc,
    status:'captured' as const,billableAuthorized:false as const,invoiceAuthorized:false as const,
    createdAt:row.createdAt});
}
/** Snapshot only: no status change to approved time, no money posting or invoice linkage. */
export async function captureApprovedTimeRateSnapshot({db,tenantId,actorId,projectId,taskId,
  entryId,expectedRevision,ipAddress,userAgent}:{db:any;tenantId:string;actorId:string;
  projectId:string;taskId:string;entryId:string;expectedRevision:number;
  ipAddress?:string;userAgent?:string|string[]}){
  for(const [value,label] of [[tenantId,'TENANT'],[actorId,'ACTOR'],[projectId,'PROJECT'],
    [taskId,'TASK'],[entryId,'ENTRY']] as const)validId(value,`PROJECT_SNAPSHOT_${label}_INVALID`);
  if(!Number.isSafeInteger(expectedRevision)||expectedRevision<2)throw new TypeError('PROJECT_SNAPSHOT_REVISION_INVALID');
  if(typeof db?.$transaction!=='function')throw new TypeError('PROJECT_SNAPSHOT_TX_REQUIRED');
  const id=projectTimeSnapshotId(tenantId,entryId);
  try{
    return await db.$transaction(async (tx:any)=>{
      if(!tx.moduleRecord?.findFirst||!tx.moduleRecord?.findMany||!tx.moduleRecord?.create||
         !tx.userProfile?.findFirst||!tx.client?.findFirst||!tx.auditLog?.create){
        throw new TypeError('PROJECT_SNAPSHOT_AUTHORITY_REQUIRED');
      }
      const where=(rowId:string,slug:string)=>({id:rowId,tenantId,moduleSlug:slug});
      const project=await tx.moduleRecord.findFirst({where:where(projectId,PROJECT_SLUG)});
      const task=await tx.moduleRecord.findFirst({where:where(taskId,TASK_SLUG)});
      if(!project||!task)throw new SnapshotNotFound();
      const pp=project.payload,tp=task.payload;
      if(project.tenantId!==tenantId||project.id!==projectId||project.moduleSlug!==PROJECT_SLUG||
         project.status!=='active'||!pp||pp.schemaVersion!==1||!UUID.test(pp.clientId||'')||
         !UUID.test(pp.managerId||'')||task.tenantId!==tenantId||task.id!==taskId||
         task.moduleSlug!==TASK_SLUG||!['in_progress','done'].includes(task.status)||
         !tp||tp.schemaVersion!==1||tp.projectId!==projectId||tp.clientId!==pp.clientId||
         !UUID.test(tp.assigneeId||''))throw new SnapshotNotFound();
      if(pp.managerId!==actorId||tp.assigneeId===actorId)throw new SnapshotForbidden();
      const [manager,member,client]=await Promise.all([
        tx.userProfile.findFirst({where:{id:actorId,tenantId,status:'active'},select:{id:true,tenantId:true}}),
        tx.userProfile.findFirst({where:{id:tp.assigneeId,tenantId,status:'active'},select:{id:true,tenantId:true}}),
        tx.client.findFirst({where:{id:pp.clientId,tenantId,active:true},select:{id:true,tenantId:true}})
      ]);
      if(!manager||manager.id!==actorId||manager.tenantId!==tenantId)throw new SnapshotForbidden();
      if(!member||member.id!==tp.assigneeId||member.tenantId!==tenantId||
         !client||client.id!==pp.clientId||client.tenantId!==tenantId)throw new SnapshotNotFound();
      const row=await tx.moduleRecord.findFirst({where:where(entryId,ENTRY_SLUG)});
      if(!row)throw new SnapshotNotFound();
      const entry=serializeTimeEntry(row,tenantId,projectId,taskId,pp.clientId);
      if(entry.memberId!==tp.assigneeId||entry.status!=='approved'||entry.revision!==expectedRevision||
         row.payload?.approvedBy!==actorId)throw new SnapshotConflict();
      const rates=await tx.moduleRecord.findMany({where:{tenantId,moduleSlug:PROJECT_RATE_CARD_SLUG,
        AND:[{payload:{path:['projectId'],equals:projectId}},
             {payload:{path:['memberId'],equals:entry.memberId}}]},take:1025,
        orderBy:[{createdAt:'asc'},{id:'asc'}]});
      if(!Array.isArray(rates)||rates.length>1024)throw new SnapshotConflict();
      const cards=rates.map((r:any)=>serializeProjectRateCard(r,tenantId,projectId,entry.memberId,pp.clientId)
        ).map((r:any)=>({...r,tenantId,clientId:pp.clientId}));
      const selected=selectEffectiveRateForApprovedTime({tenantId,
        entry:{id:entryId,tenantId,projectId,clientId:pp.clientId,memberId:entry.memberId,
          status:'approved',revision:entry.revision,startedAtUtc:entry.startedAtUtc,
          endedAtUtc:entry.endedAtUtc,billable:false,linkedInvoiceId:null},cards});
      const saved=await tx.moduleRecord.create({data:{id,tenantId,
        moduleSlug:PROJECT_TIME_RATE_SNAPSHOT_SLUG,title:'Snapshot de tarifa horaria',status:'captured',
        payload:{schemaVersion:1,projectId,taskId,entryId,entryRevision:entry.revision,
          clientId:pp.clientId,memberId:entry.memberId,rateCardId:selected.rateCardId,
          rateCardRevision:selected.rateCardRevision,hourlyRateExact:selected.hourlyRateExact,
          currency:selected.currency,effectiveFromUtc:selected.rateEffectiveFromUtc,
          billableAuthorized:false,invoiceAuthorized:false,linkedInvoiceId:null}}});
      await tx.auditLog.create({data:{tenantId,userId:actorId,
        action:'project.time-entry.rate-snapshot.capture',entity:'ModuleRecord',entityId:id,
        after:{moduleSlug:PROJECT_TIME_RATE_SNAPSHOT_SLUG,projectId,taskId,entryId,
          entryRevision:entry.revision,rateCardId:selected.rateCardId,
          rateCardRevision:selected.rateCardRevision,currency:selected.currency,
          billableAuthorized:false,invoiceAuthorized:false},
        ipAddress:ipAddress||null,userAgent:typeof userAgent==='string'?userAgent:null}});
      return serializeTimeRateSnapshot(saved,tenantId,projectId,taskId,entryId,pp.clientId,entry.memberId);
    },{isolationLevel:'Serializable'});
  }catch(error:any){
    if(error?.code==='P2002'||error?.code==='P2034')throw new SnapshotConflict();
    throw error;
  }
}
