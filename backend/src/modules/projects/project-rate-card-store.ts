import { createHash } from 'node:crypto';

/** Immutable pricing records, not billable invoice authority. Feature flag remains OFF. */
export const PROJECT_RATE_CARD_SLUG = 'project-rate-card-v761';
const PROJECT_SLUG = 'project-workspace-v761';
const TASK_SLUG = 'project-task-v761';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONEY = /^([0-9]{1,12})\.([0-9]{2})$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_REVISION = 1024;

export class ProjectRateCardNotFound extends Error { constructor(){super('PROJECT_RATE_CARD_NOT_FOUND');} }
export class ProjectRateCardForbidden extends Error { constructor(){super('PROJECT_RATE_CARD_MANAGER_REQUIRED');} }
export class ProjectRateCardConflict extends Error { constructor(){super('PROJECT_RATE_CARD_VERSION_CONFLICT');} }

function uuid(value:unknown,label:string):asserts value is string {
  if(typeof value!=='string'||!UUID.test(value))throw new TypeError(label);
}
function utcTimestamp(value:unknown):asserts value is string {
  if(typeof value!=='string'||!UTC.test(value)||!Number.isFinite(Date.parse(value))||
     new Date(value).toISOString()!==value)throw new TypeError('PROJECT_RATE_CARD_UTC_INVALID');
}
export function validateProjectRateCardDraft(raw:unknown){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new TypeError('PROJECT_RATE_CARD_DRAFT_INVALID');
  const obj=raw as Record<string,unknown>;
  if(Object.keys(obj).some(key=>!['memberId','hourlyRateExact','currency','effectiveFromUtc','expectedRevision'].includes(key))){
    throw new TypeError('PROJECT_RATE_CARD_UNKNOWN_FIELD');
  }
  uuid(obj.memberId,'PROJECT_RATE_CARD_MEMBER_INVALID');
  const match=typeof obj.hourlyRateExact==='string'?MONEY.exec(obj.hourlyRateExact):null;
  if(!match || (BigInt(match[1])*100n+BigInt(match[2]))<=0n){
    throw new TypeError('PROJECT_RATE_CARD_DECIMAL_INVALID');
  }
  if(typeof obj.currency!=='string'||!/^[A-Z]{3}$/.test(obj.currency)){
    throw new TypeError('PROJECT_RATE_CARD_CURRENCY_INVALID');
  }
  utcTimestamp(obj.effectiveFromUtc);
  if(!Number.isSafeInteger(obj.expectedRevision)||(obj.expectedRevision as number)<0||
     (obj.expectedRevision as number)>=MAX_REVISION){
    throw new TypeError('PROJECT_RATE_CARD_REVISION_INVALID');
  }
  return Object.freeze({memberId:obj.memberId,hourlyRateExact:`${BigInt(match[1])}.${match[2]}`,
    currency:obj.currency,effectiveFromUtc:obj.effectiveFromUtc,
    expectedRevision:obj.expectedRevision as number});
}

/** Stable primary key enforces unique (tenant,project,member,revision) across requests. */
export function projectRateCardId(tenantId:string,projectId:string,memberId:string,revision:number){
  uuid(tenantId,'PROJECT_RATE_CARD_TENANT_INVALID');
  uuid(projectId,'PROJECT_RATE_CARD_PROJECT_INVALID');
  uuid(memberId,'PROJECT_RATE_CARD_MEMBER_INVALID');
  if(!Number.isSafeInteger(revision)||revision<1||revision>MAX_REVISION){
    throw new TypeError('PROJECT_RATE_CARD_REVISION_INVALID');
  }
  const bytes=createHash('sha256').update('contagest:project-rate-card:v761\0')
    .update(tenantId.toLowerCase()).update('\0').update(projectId.toLowerCase())
    .update('\0').update(memberId.toLowerCase()).update('\0').update(String(revision))
    .digest().subarray(0,16);
  bytes[6]=(bytes[6]&0x0f)|0x50;
  bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function projectScope(row:any,tenantId:string,projectId:string){
  if(!row)throw new ProjectRateCardNotFound();
  const p=row.payload;
  if(row.id!==projectId||row.tenantId!==tenantId||row.moduleSlug!==PROJECT_SLUG||
     !['active','archived','planning'].includes(row.status)||!p||typeof p!=='object'||
     Array.isArray(p)||p.schemaVersion!==1||!UUID.test(p.managerId||'')||!UUID.test(p.clientId||'')){
    throw new TypeError('PROJECT_RATE_CARD_PROJECT_SCOPE_INVALID');
  }
  return p as {managerId:string;clientId:string};
}
export function serializeProjectRateCard(row:any,tenantId:string,projectId:string,memberId:string,clientId:string){
  const p=row?.payload;
  if(!row||row.tenantId!==tenantId||row.moduleSlug!==PROJECT_RATE_CARD_SLUG||row.status!=='fixed'||
     !p||typeof p!=='object'||Array.isArray(p)||p.schemaVersion!==1||p.projectId!==projectId||
     p.memberId!==memberId||p.clientId!==clientId||
     row.id!==projectRateCardId(tenantId,projectId,memberId,p.revision)){
    throw new TypeError('PROJECT_RATE_CARD_STORED_SCOPE_INVALID');
  }
  const accepted=validateProjectRateCardDraft({expectedRevision:p.revision-1,
    memberId:p.memberId,hourlyRateExact:p.hourlyRateExact,currency:p.currency,effectiveFromUtc:p.effectiveFromUtc});
  // Validation above must receive only canonical draft fields, not stored metadata.
  return Object.freeze({id:row.id,projectId,memberId,clientId,revision:p.revision,
    hourlyRateExact:accepted.hourlyRateExact,currency:accepted.currency,
    effectiveFromUtc:accepted.effectiveFromUtc,status:'fixed' as const,
    createdAt:row.createdAt,invoiceAuthorized:false as const,billableAuthorized:false as const});
}

export async function createProjectRateCard({db,tenantId,actorId,projectId,draft,ipAddress,userAgent}:{
  db:any;tenantId:string;actorId:string;projectId:string;draft:unknown;
  ipAddress?:string;userAgent?:string|string[];
}){
  uuid(tenantId,'PROJECT_RATE_CARD_TENANT_INVALID');
  uuid(actorId,'PROJECT_RATE_CARD_ACTOR_INVALID');
  uuid(projectId,'PROJECT_RATE_CARD_PROJECT_INVALID');
  const input=validateProjectRateCardDraft(draft);
  if(typeof db?.$transaction!=='function')throw new TypeError('PROJECT_RATE_CARD_TX_REQUIRED');
  const revision=input.expectedRevision+1;
  const id=projectRateCardId(tenantId,projectId,input.memberId,revision);
  try{
    return await db.$transaction(async(tx:any)=>{
      if(!tx.moduleRecord?.findFirst||!tx.moduleRecord?.create||!tx.userProfile?.findFirst||
         !tx.client?.findFirst||!tx.auditLog?.create){
        throw new TypeError('PROJECT_RATE_CARD_DB_AUTHORITY_REQUIRED');
      }
      const project=await tx.moduleRecord.findFirst({where:{id:projectId,tenantId,moduleSlug:PROJECT_SLUG}});
      const owner=projectScope(project,tenantId,projectId);
      if(project.status!=='active')throw new ProjectRateCardConflict();
      if(owner.managerId!==actorId)throw new ProjectRateCardForbidden();
      const [manager,member,client,task]=await Promise.all([
        tx.userProfile.findFirst({where:{id:actorId,tenantId,status:'active'},select:{id:true,tenantId:true}}),
        tx.userProfile.findFirst({where:{id:input.memberId,tenantId,status:'active'},select:{id:true,tenantId:true}}),
        tx.client.findFirst({where:{id:owner.clientId,tenantId,active:true},select:{id:true,tenantId:true}}),
        tx.moduleRecord.findFirst({where:{tenantId,moduleSlug:TASK_SLUG,
          AND:[{payload:{path:['projectId'],equals:projectId}},
               {payload:{path:['assigneeId'],equals:input.memberId}}]}})
      ]);
      if(!manager||manager.id!==actorId||manager.tenantId!==tenantId)throw new ProjectRateCardForbidden();
      if(!member||member.id!==input.memberId||member.tenantId!==tenantId||
         !client||client.id!==owner.clientId||client.tenantId!==tenantId)throw new ProjectRateCardNotFound();
      if(!task||task.tenantId!==tenantId||task.moduleSlug!==TASK_SLUG||
         !['todo','in_progress','done'].includes(task.status)||task.payload?.schemaVersion!==1||
         task.payload?.projectId!==projectId||task.payload?.assigneeId!==input.memberId||
         task.payload?.clientId!==owner.clientId)throw new ProjectRateCardNotFound();
      if(revision>1){
        const previous=await tx.moduleRecord.findFirst({where:{id:projectRateCardId(tenantId,projectId,input.memberId,revision-1),
          tenantId,moduleSlug:PROJECT_RATE_CARD_SLUG}});
        if(!previous)throw new ProjectRateCardConflict();
        const prior=serializeProjectRateCard(previous,tenantId,projectId,input.memberId,owner.clientId);
        if(prior.revision!==input.expectedRevision||prior.effectiveFromUtc>=input.effectiveFromUtc){
          throw new ProjectRateCardConflict();
        }
      }
      const saved=await tx.moduleRecord.create({data:{id,tenantId,moduleSlug:PROJECT_RATE_CARD_SLUG,
        title:'Tarifa de proyecto',status:'fixed',payload:{schemaVersion:1,projectId,
          clientId:owner.clientId,memberId:input.memberId,revision,
          hourlyRateExact:input.hourlyRateExact,currency:input.currency,
          effectiveFromUtc:input.effectiveFromUtc}}});
      await tx.auditLog.create({data:{tenantId,userId:actorId,action:'project.rate-card.version.create',
        entity:'ModuleRecord',entityId:id,
        after:{moduleSlug:PROJECT_RATE_CARD_SLUG,projectId,memberId:input.memberId,
          revision,currency:input.currency,effectiveFromUtc:input.effectiveFromUtc},
        ipAddress:ipAddress||null,userAgent:typeof userAgent==='string'?userAgent:null}});
      return serializeProjectRateCard(saved,tenantId,projectId,input.memberId,owner.clientId);
    },{isolationLevel:'Serializable'});
  }catch(error:any){
    if(error?.code==='P2002'||error?.code==='P2034')throw new ProjectRateCardConflict();
    throw error;
  }
}
export async function listProjectRateCards({db,tenantId,actorId,projectId,memberId,take=50,skip=0}:{
  db:any;tenantId:string;actorId:string;projectId:string;memberId:string;take?:number;skip?:number;
}){
  uuid(tenantId,'PROJECT_RATE_CARD_TENANT_INVALID');
  uuid(actorId,'PROJECT_RATE_CARD_ACTOR_INVALID');
  uuid(projectId,'PROJECT_RATE_CARD_PROJECT_INVALID');
  uuid(memberId,'PROJECT_RATE_CARD_MEMBER_INVALID');
  if(!Number.isSafeInteger(take)||take<1||take>100||!Number.isSafeInteger(skip)||skip<0||skip>10000){
    throw new TypeError('PROJECT_RATE_CARD_PAGE_INVALID');
  }
  if(typeof db?.$transaction!=='function')throw new TypeError('PROJECT_RATE_CARD_TX_REQUIRED');
  return db.$transaction(async(tx:any)=>{
    if(!tx.moduleRecord?.findFirst||!tx.moduleRecord?.findMany||!tx.userProfile?.findFirst){
      throw new TypeError('PROJECT_RATE_CARD_DB_AUTHORITY_REQUIRED');
    }
    const project=await tx.moduleRecord.findFirst({where:{id:projectId,tenantId,moduleSlug:PROJECT_SLUG}});
    const scope=projectScope(project,tenantId,projectId);
    if(scope.managerId!==actorId)throw new ProjectRateCardForbidden();
    const profile=await tx.userProfile.findFirst({where:{id:actorId,tenantId,status:'active'},select:{id:true,tenantId:true}});
    if(!profile||profile.id!==actorId||profile.tenantId!==tenantId)throw new ProjectRateCardForbidden();
    const rows=await tx.moduleRecord.findMany({where:{tenantId,moduleSlug:PROJECT_RATE_CARD_SLUG,
      AND:[{payload:{path:['projectId'],equals:projectId}},
           {payload:{path:['memberId'],equals:memberId}}]},take:take+1,skip,
      orderBy:[{createdAt:'desc'},{id:'desc'}]});
    if(!Array.isArray(rows)||rows.length>take+1)throw new TypeError('PROJECT_RATE_CARD_PAGE_RESULT_INVALID');
    return Object.freeze({items:rows.slice(0,take).map((row:any)=>
      serializeProjectRateCard(row,tenantId,projectId,memberId,scope.clientId)),
      pagination:Object.freeze({take,skip,hasMore:rows.length>take,
        nextSkip:rows.length>take?skip+take:null})});
  },{isolationLevel:'Serializable'});
}
