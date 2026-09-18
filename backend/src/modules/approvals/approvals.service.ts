import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { HttpError } from '../../shared/http.js';
import { money, serializeDecimal, type DecimalInput } from '../../shared/financial/decimal.js';

export const APPROVAL_CAPABILITIES = [
  'purchases.issue',
  'purchases.cancel',
  'banking.payment',
  'banking.reverse',
  'banking.correct',
  'inventory.adjust',
  'inventory.reverse',
  'fiscal.reopen',
  'accounting.post',
  'accounting.reverse',
  'financial.recovery'
] as const;

export type ApprovalCapability = typeof APPROVAL_CAPABILITIES[number];
type Db = typeof prisma | Prisma.TransactionClient;

export type ApprovalPolicyRecord = {
  id:string; tenantId:string; capability:string; version:number; enabled:boolean;
  thresholdAmount:Prisma.Decimal|null; currency:string|null; requiredApprovals:number;
  selfApprovalAllowed:boolean; approverPermissions:unknown; approverRoles:unknown;
  expiresMinutes:number; createdBy:string|null; createdAt:Date; updatedAt:Date;
};
export type ApprovalRequestRecord = {
  id:string; tenantId:string; capability:string; requesterId:string; policyId:string; policyVersion:number;
  status:string; revision:number; payload:unknown; payloadHash:string; amount:Prisma.Decimal|null; currency:string|null;
  requiredApprovals:number; approvedCount:number; reasonCode:string|null; comment:string|null; expiresAt:Date;
  executedAt:Date|null; executionResourceType:string|null; executionResourceId:string|null; createdAt:Date; updatedAt:Date;
};

const stringArray=(value:unknown)=>Array.isArray(value)?value.filter((item):item is string=>typeof item==='string'&&item.trim().length>0).map((item)=>item.trim()):[];
const stable=(value:any):any=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'&&!Buffer.isBuffer(value)?Object.fromEntries(Object.keys(value).sort().map((key)=>[key,stable(value[key])])):value;
export const canonicalApprovalPayload=(value:unknown)=>JSON.stringify(stable(value));
export const approvalPayloadHash=(value:unknown)=>createHash('sha256').update(canonicalApprovalPayload(value)).digest('hex');

export function assertKnownCapability(value:string): asserts value is ApprovalCapability {
  if(!(APPROVAL_CAPABILITIES as readonly string[]).includes(value)) throw new HttpError(422,'Capability de aprobación no soportada.',{code:'APPROVAL_CAPABILITY_UNSUPPORTED',capability:value});
}

export async function getActiveApprovalPolicy(tenantId:string,capability:string,db:Db=prisma){
  assertKnownCapability(capability);
  const rows=await db.$queryRaw<ApprovalPolicyRecord[]>(Prisma.sql`
    SELECT * FROM "ApprovalPolicy"
    WHERE "tenantId"=${tenantId} AND "capability"=${capability} AND "enabled"=true
    ORDER BY "version" DESC LIMIT 1
  `);
  return rows[0]||null;
}

export function approvalPolicyApplies(policy:ApprovalPolicyRecord|null, amount?:DecimalInput|null, currency?:string|null){
  if(!policy?.enabled)return false;
  if(policy.currency&&currency&&policy.currency!==currency) throw new HttpError(409,'La moneda no coincide con la política de aprobación.',{code:'APPROVAL_POLICY_CURRENCY_MISMATCH',expected:policy.currency,received:currency});
  if(policy.thresholdAmount===null)return true;
  if(amount===undefined||amount===null)return true;
  return money(amount).gte(policy.thresholdAmount);
}

async function actorSnapshot(db:Db,tenantId:string,userId:string){
  const user=await db.userProfile.findFirst({where:{id:userId,tenantId,status:'active'},select:{id:true,status:true}});
  if(!user)return null;
  const memberships=await db.userRole.findMany({where:{userId,role:{tenantId}},include:{role:{include:{permissions:{include:{permission:true}}}}}});
  return {
    userId,
    roles:new Set(memberships.map((row)=>row.role.name)),
    permissions:new Set(memberships.flatMap((row)=>row.role.permissions.map((item)=>item.permission.key)))
  };
}

async function directlyQualifies(db:Db,policy:ApprovalPolicyRecord,tenantId:string,userId:string){
  const snapshot=await actorSnapshot(db,tenantId,userId);
  if(!snapshot)return false;
  const allowedPermissions=stringArray(policy.approverPermissions);
  const allowedRoles=stringArray(policy.approverRoles);
  if(!allowedPermissions.length&&!allowedRoles.length)return snapshot.permissions.has('admin.manage');
  return allowedPermissions.some((key)=>snapshot.permissions.has(key))||allowedRoles.some((role)=>snapshot.roles.has(role));
}

async function qualifiedViaDelegation(db:Db,policy:ApprovalPolicyRecord,tenantId:string,userId:string,capability:string){
  const delegations=await db.$queryRaw<Array<{delegatorId:string}>>(Prisma.sql`
    SELECT "delegatorId" FROM "ApprovalDelegation"
    WHERE "tenantId"=${tenantId} AND "delegateId"=${userId} AND "active"=true
      AND "startsAt"<=now() AND "endsAt">now() AND ("capability"=${capability} OR "capability"='*')
  `);
  for(const delegation of delegations){
    if(await directlyQualifies(db,policy,tenantId,delegation.delegatorId))return true;
  }
  return false;
}

export async function assertApproverQualified(db:Db,policy:ApprovalPolicyRecord,tenantId:string,userId:string,capability:string){
  if(await directlyQualifies(db,policy,tenantId,userId))return;
  if(await qualifiedViaDelegation(db,policy,tenantId,userId,capability))return;
  throw new HttpError(403,'El usuario no tiene un rol, permiso o delegación vigente para aprobar esta operación.',{code:'APPROVAL_APPROVER_NOT_QUALIFIED'});
}

export async function createApprovalPolicy(input:{tenantId:string;capability:string;thresholdAmount?:DecimalInput|null;currency?:string|null;requiredApprovals?:number;selfApprovalAllowed?:boolean;approverPermissions?:string[];approverRoles?:string[];expiresMinutes?:number;createdBy?:string|null}){
  assertKnownCapability(input.capability);
  const next=await prisma.$queryRaw<Array<{version:number}>>(Prisma.sql`SELECT COALESCE(MAX("version"),0)+1 AS version FROM "ApprovalPolicy" WHERE "tenantId"=${input.tenantId} AND "capability"=${input.capability}`);
  const version=Number(next[0]?.version||1);
  const id=randomUUID();
  const threshold=input.thresholdAmount===undefined||input.thresholdAmount===null?null:money(input.thresholdAmount);
  const rows=await prisma.$queryRaw<ApprovalPolicyRecord[]>(Prisma.sql`
    INSERT INTO "ApprovalPolicy" ("id","tenantId","capability","version","enabled","thresholdAmount","currency","requiredApprovals","selfApprovalAllowed","approverPermissions","approverRoles","expiresMinutes","createdBy")
    VALUES (${id},${input.tenantId},${input.capability},${version},true,${threshold},${input.currency||null},${input.requiredApprovals||1},${Boolean(input.selfApprovalAllowed)},${JSON.stringify(input.approverPermissions||[])}::jsonb,${JSON.stringify(input.approverRoles||[])}::jsonb,${input.expiresMinutes||1440},${input.createdBy||null})
    RETURNING *
  `);
  return rows[0];
}

export async function createApprovalRequest(input:{tenantId:string;requesterId:string;capability:string;payload:unknown;amount?:DecimalInput|null;currency?:string|null;reasonCode?:string|null;comment?:string|null}){
  const policy=await getActiveApprovalPolicy(input.tenantId,input.capability);
  if(!policy)throw new HttpError(409,'No existe una política activa para esta capability.',{code:'APPROVAL_POLICY_NOT_CONFIGURED',capability:input.capability});
  const amount=input.amount===undefined||input.amount===null?null:money(input.amount);
  if(!approvalPolicyApplies(policy,amount,input.currency))throw new HttpError(409,'La operación no alcanza el umbral configurado y no requiere aprobación.',{code:'APPROVAL_NOT_REQUIRED',capability:input.capability});
  const requester=await prisma.userProfile.findFirst({where:{id:input.requesterId,tenantId:input.tenantId,status:'active'},select:{id:true}});
  if(!requester)throw new HttpError(401,'Solicitante no válido para el tenant activo.');
  const id=randomUUID();const hash=approvalPayloadHash(input.payload);const expiresAt=new Date(Date.now()+policy.expiresMinutes*60_000);
  const rows=await prisma.$queryRaw<ApprovalRequestRecord[]>(Prisma.sql`
    INSERT INTO "ApprovalRequest" ("id","tenantId","capability","requesterId","policyId","policyVersion","status","revision","payload","payloadHash","amount","currency","requiredApprovals","approvedCount","reasonCode","comment","expiresAt")
    VALUES (${id},${input.tenantId},${input.capability},${input.requesterId},${policy.id},${policy.version},'pending',1,${JSON.stringify(input.payload)}::jsonb,${hash},${amount},${input.currency||policy.currency||null},${policy.requiredApprovals},0,${input.reasonCode||null},${input.comment||null},${expiresAt}) RETURNING *
  `);
  await prisma.notificationLog.create({data:{tenantId:input.tenantId,userId:input.requesterId,channel:'in_app',recipient:`approval:${input.capability}`,subject:'Aprobación requerida',message:`Solicitud ${id} esperando aprobación`,status:'queued',payload:{approvalRequestId:id,capability:input.capability}}});
  return rows[0];
}

async function lockRequest(tx:Prisma.TransactionClient,tenantId:string,id:string){
  const rows=await tx.$queryRaw<ApprovalRequestRecord[]>(Prisma.sql`SELECT * FROM "ApprovalRequest" WHERE "tenantId"=${tenantId} AND "id"=${id} FOR UPDATE`);
  if(!rows[0])throw new HttpError(404,'Solicitud de aprobación no encontrada.');
  return rows[0];
}

async function requestPolicy(db:Db,request:ApprovalRequestRecord){
  const rows=await db.$queryRaw<ApprovalPolicyRecord[]>(Prisma.sql`SELECT * FROM "ApprovalPolicy" WHERE "tenantId"=${request.tenantId} AND "id"=${request.policyId} LIMIT 1`);
  if(!rows[0])throw new HttpError(409,'La política asociada ya no está disponible.',{code:'APPROVAL_POLICY_MISSING'});
  return rows[0];
}

const approvalExpiredError=()=>new HttpError(409,'La solicitud de aprobación expiró.',{code:'APPROVAL_EXPIRED'});

function assertRequestNotExpired(request:ApprovalRequestRecord){
  if(request.status==='expired'||request.expiresAt.getTime()<=Date.now())throw approvalExpiredError();
}

export async function materializeExpiredApprovalRequests(tenantId:string,requestId?:string|null,db:Db=prisma){
  const changed=requestId
    ? await db.$executeRaw(Prisma.sql`UPDATE "ApprovalRequest" SET "status"='expired',"updatedAt"=now() WHERE "tenantId"=${tenantId} AND "id"=${requestId} AND "status" IN ('pending','approved') AND "expiresAt"<=now()`)
    : await db.$executeRaw(Prisma.sql`UPDATE "ApprovalRequest" SET "status"='expired',"updatedAt"=now() WHERE "tenantId"=${tenantId} AND "status" IN ('pending','approved') AND "expiresAt"<=now()`);
  return Number(changed);
}

export async function reviseApprovalRequest(input:{tenantId:string;requesterId:string;requestId:string;payload:unknown;amount?:DecimalInput|null;currency?:string|null;comment?:string|null}){
  await materializeExpiredApprovalRequests(input.tenantId,input.requestId);
  return prisma.$transaction(async(tx)=>{
    const request=await lockRequest(tx,input.tenantId,input.requestId);
    if(request.requesterId!==input.requesterId)throw new HttpError(403,'Sólo el solicitante puede modificar su solicitud.');
    assertRequestNotExpired(request);
    if(['executing','executed','cancelled','rejected'].includes(request.status))throw new HttpError(409,'La solicitud ya no puede modificarse.',{code:'APPROVAL_REVISION_NOT_ALLOWED',status:request.status});
    const policy=await requestPolicy(tx,request);const nextAmount=input.amount===undefined||input.amount===null?request.amount:money(input.amount);
    if(!approvalPolicyApplies(policy,nextAmount,input.currency||request.currency))throw new HttpError(409,'La revisión queda fuera del umbral de aprobación.',{code:'APPROVAL_NOT_REQUIRED'});
    const hash=approvalPayloadHash(input.payload);const revision=request.revision+1;
    const rows=await tx.$queryRaw<ApprovalRequestRecord[]>(Prisma.sql`
      UPDATE "ApprovalRequest" SET "payload"=${JSON.stringify(input.payload)}::jsonb,"payloadHash"=${hash},"revision"=${revision},"amount"=${nextAmount},"currency"=${input.currency||request.currency},"comment"=${input.comment||request.comment},"status"='pending',"approvedCount"=0,"updatedAt"=now(),"expiresAt"=${new Date(Date.now()+policy.expiresMinutes*60_000)}
      WHERE "id"=${request.id} AND "tenantId"=${input.tenantId} RETURNING *
    `);
    return rows[0];
  });
}

export async function decideApprovalRequest(input:{tenantId:string;approverId:string;requestId:string;decision:'approved'|'rejected';reasonCode?:string|null;comment?:string|null}){
  await materializeExpiredApprovalRequests(input.tenantId,input.requestId);
  return prisma.$transaction(async(tx)=>{
    const request=await lockRequest(tx,input.tenantId,input.requestId);
    assertRequestNotExpired(request);
    if(!['pending','approved'].includes(request.status))throw new HttpError(409,'La solicitud no acepta nuevas decisiones.',{code:'APPROVAL_DECISION_NOT_ALLOWED',status:request.status});
    const policy=await requestPolicy(tx,request);
    if(!policy.selfApprovalAllowed&&request.requesterId===input.approverId)throw new HttpError(403,'Maker-checker impide aprobar la propia solicitud.',{code:'APPROVAL_SELF_APPROVAL_FORBIDDEN'});
    await assertApproverQualified(tx,policy,input.tenantId,input.approverId,request.capability);
    const existing=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "ApprovalDecision" WHERE "requestId"=${request.id} AND "approverId"=${input.approverId} AND "revision"=${request.revision} LIMIT 1`);
    if(existing.length)throw new HttpError(409,'El aprobador ya decidió esta revisión.',{code:'APPROVAL_DUPLICATE_DECISION'});
    await tx.$executeRaw(Prisma.sql`INSERT INTO "ApprovalDecision" ("id","tenantId","requestId","approverId","decision","reasonCode","comment","payloadHash","revision") VALUES (${randomUUID()},${input.tenantId},${request.id},${input.approverId},${input.decision},${input.reasonCode||null},${input.comment||null},${request.payloadHash},${request.revision})`);
    if(input.decision==='rejected'){
      const rows=await tx.$queryRaw<ApprovalRequestRecord[]>(Prisma.sql`UPDATE "ApprovalRequest" SET "status"='rejected',"updatedAt"=now() WHERE "id"=${request.id} RETURNING *`);return rows[0];
    }
    const countRows=await tx.$queryRaw<Array<{count:bigint}>>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "ApprovalDecision" WHERE "requestId"=${request.id} AND "revision"=${request.revision} AND "decision" IN ('approved','break_glass') AND "payloadHash"=${request.payloadHash}`);
    const count=Number(countRows[0]?.count||0);const status=count>=request.requiredApprovals?'approved':'pending';
    const rows=await tx.$queryRaw<ApprovalRequestRecord[]>(Prisma.sql`UPDATE "ApprovalRequest" SET "approvedCount"=${count},"status"=${status},"updatedAt"=now() WHERE "id"=${request.id} RETURNING *`);return rows[0];
  });
}

export async function breakGlassApproval(input:{tenantId:string;actorId:string;requestId:string;reasonCode:string;comment:string}){
  await materializeExpiredApprovalRequests(input.tenantId,input.requestId);
  return prisma.$transaction(async(tx)=>{
    const request=await lockRequest(tx,input.tenantId,input.requestId);assertRequestNotExpired(request);
    const actor=await actorSnapshot(tx,input.tenantId,input.actorId);if(!actor?.permissions.has('admin.manage'))throw new HttpError(403,'Break-glass requiere admin.manage.',{code:'APPROVAL_BREAK_GLASS_FORBIDDEN'});
    await tx.$executeRaw(Prisma.sql`INSERT INTO "ApprovalDecision" ("id","tenantId","requestId","approverId","decision","reasonCode","comment","payloadHash","revision") VALUES (${randomUUID()},${input.tenantId},${request.id},${input.actorId},'break_glass',${input.reasonCode},${input.comment},${request.payloadHash},${request.revision})`);
    const rows=await tx.$queryRaw<ApprovalRequestRecord[]>(Prisma.sql`UPDATE "ApprovalRequest" SET "approvedCount"="requiredApprovals","status"='approved',"updatedAt"=now() WHERE "id"=${request.id} RETURNING *`);
    await tx.auditLog.create({data:{tenantId:input.tenantId,userId:input.actorId,action:'approval.break-glass',entity:'ApprovalRequest',entityId:request.id,before:{status:request.status},after:{status:'approved',reasonCode:input.reasonCode,comment:input.comment,payloadHash:request.payloadHash}}});
    return rows[0];
  });
}

export async function cancelApprovalRequest(input:{tenantId:string;actorId:string;requestId:string}){
  await materializeExpiredApprovalRequests(input.tenantId,input.requestId);
  return prisma.$transaction(async(tx)=>{
    const request=await lockRequest(tx,input.tenantId,input.requestId);if(request.requesterId!==input.actorId)throw new HttpError(403,'Sólo el solicitante puede cancelar.');
    assertRequestNotExpired(request);
    if(!['pending','approved'].includes(request.status))throw new HttpError(409,'La solicitud no puede cancelarse.',{code:'APPROVAL_CANCEL_NOT_ALLOWED'});
    const rows=await tx.$queryRaw<ApprovalRequestRecord[]>(Prisma.sql`UPDATE "ApprovalRequest" SET "status"='cancelled',"updatedAt"=now() WHERE "id"=${request.id} RETURNING *`);return rows[0];
  });
}

export async function guardApprovalTx(tx:Prisma.TransactionClient,input:{tenantId:string;actorId?:string;approvalRequestId?:string|null;capability:string;payload:unknown;amount?:DecimalInput|null;currency?:string|null}){
  const policy=await getActiveApprovalPolicy(input.tenantId,input.capability,tx);if(!approvalPolicyApplies(policy,input.amount,input.currency))return null;
  if(!input.approvalRequestId)throw new HttpError(428,'La operación requiere aprobación antes de ejecutarse.',{code:'APPROVAL_REQUIRED',capability:input.capability});
  const request=await lockRequest(tx,input.tenantId,input.approvalRequestId);assertRequestNotExpired(request);
  if(request.capability!==input.capability)throw new HttpError(409,'La aprobación pertenece a otra capability.',{code:'APPROVAL_CAPABILITY_MISMATCH'});
  if(request.status!=='approved')throw new HttpError(409,'La solicitud aún no está aprobada.',{code:'APPROVAL_NOT_APPROVED',status:request.status});
  const hash=approvalPayloadHash(input.payload);if(hash!==request.payloadHash)throw new HttpError(409,'El payload cambió después de la aprobación; solicita una nueva revisión.',{code:'APPROVAL_PAYLOAD_CHANGED',approvedHash:request.payloadHash,currentHash:hash});
  if(input.amount!==undefined&&input.amount!==null&&request.amount!==null&&!money(input.amount).eq(request.amount))throw new HttpError(409,'El monto ejecutado difiere del monto aprobado.',{code:'APPROVAL_AMOUNT_CHANGED'});
  if(input.currency&&request.currency&&input.currency!==request.currency)throw new HttpError(409,'La moneda ejecutada difiere de la aprobada.',{code:'APPROVAL_CURRENCY_CHANGED'});
  return request;
}

export async function consumeApprovalTx(tx:Prisma.TransactionClient,request:ApprovalRequestRecord|null,resourceType:string,resourceId:string){
  if(!request)return;
  const changed=await tx.$executeRaw(Prisma.sql`UPDATE "ApprovalRequest" SET "status"='executed',"executedAt"=now(),"executionResourceType"=${resourceType},"executionResourceId"=${resourceId},"updatedAt"=now() WHERE "id"=${request.id} AND "tenantId"=${request.tenantId} AND "status"='approved'`);
  if(Number(changed)!==1)throw new HttpError(409,'La aprobación ya fue consumida por otra ejecución.',{code:'APPROVAL_ALREADY_CONSUMED'});
}

export async function claimApproval(input:{tenantId:string;approvalRequestId?:string|null;capability:string;payload:unknown;amount?:DecimalInput|null;currency?:string|null}){
  if(input.approvalRequestId)await materializeExpiredApprovalRequests(input.tenantId,input.approvalRequestId);
  return prisma.$transaction(async(tx)=>{
    const request=await guardApprovalTx(tx,input);if(!request)return null;
    const changed=await tx.$executeRaw(Prisma.sql`UPDATE "ApprovalRequest" SET "status"='executing',"updatedAt"=now() WHERE "id"=${request.id} AND "status"='approved'`);
    if(Number(changed)!==1)throw new HttpError(409,'La aprobación ya está siendo ejecutada.',{code:'APPROVAL_EXECUTION_IN_PROGRESS'});return request;
  });
}
export async function finishApprovalClaim(request:ApprovalRequestRecord|null,resourceType:string,resourceId:string){if(!request)return;await prisma.$executeRaw(Prisma.sql`UPDATE "ApprovalRequest" SET "status"='executed',"executedAt"=now(),"executionResourceType"=${resourceType},"executionResourceId"=${resourceId},"updatedAt"=now() WHERE "id"=${request.id} AND "status"='executing'`);}
export async function releaseApprovalClaim(request:ApprovalRequestRecord|null){if(!request)return;await prisma.$executeRaw(Prisma.sql`UPDATE "ApprovalRequest" SET "status"='approved',"updatedAt"=now() WHERE "id"=${request.id} AND "status"='executing'`);}

export async function createDelegation(input:{tenantId:string;delegatorId:string;delegateId:string;capability?:string;startsAt:Date;endsAt:Date;reason:string}){
  if(input.capability&&input.capability!=='*')assertKnownCapability(input.capability);if(input.delegatorId===input.delegateId)throw new HttpError(422,'No se permite delegar en el mismo usuario.');
  const users=await prisma.userProfile.count({where:{tenantId:input.tenantId,id:{in:[input.delegatorId,input.delegateId]},status:'active'}});if(users!==2)throw new HttpError(422,'Delegador y delegado deben ser usuarios activos del tenant.');
  const id=randomUUID();const rows=await prisma.$queryRaw<Array<any>>(Prisma.sql`INSERT INTO "ApprovalDelegation" ("id","tenantId","delegatorId","delegateId","capability","startsAt","endsAt","active","reason") VALUES (${id},${input.tenantId},${input.delegatorId},${input.delegateId},${input.capability||'*'},${input.startsAt},${input.endsAt},true,${input.reason}) RETURNING *`);return rows[0];
}

export async function listApprovalInbox(tenantId:string,userId:string){
  await materializeExpiredApprovalRequests(tenantId);
  const rows=await prisma.$queryRaw<ApprovalRequestRecord[]>(Prisma.sql`SELECT * FROM "ApprovalRequest" WHERE "tenantId"=${tenantId} AND "status" IN ('pending','approved') AND "expiresAt">now() ORDER BY "createdAt" ASC LIMIT 250`);
  const output=[] as ApprovalRequestRecord[];for(const row of rows){const policy=await requestPolicy(prisma,row);if(row.requesterId===userId&&!policy.selfApprovalAllowed)continue;try{await assertApproverQualified(prisma,policy,tenantId,userId,row.capability);output.push(row);}catch{}}
  return output;
}
export async function listMyApprovalRequests(tenantId:string,userId:string){await materializeExpiredApprovalRequests(tenantId);return prisma.$queryRaw<ApprovalRequestRecord[]>(Prisma.sql`SELECT * FROM "ApprovalRequest" WHERE "tenantId"=${tenantId} AND "requesterId"=${userId} ORDER BY "createdAt" DESC LIMIT 250`);}
export async function approvalReport(tenantId:string){
  await materializeExpiredApprovalRequests(tenantId);
  const rows=await prisma.$queryRaw<Array<{capability:string;status:string;count:bigint;avgAgeHours:number|null}>>(Prisma.sql`SELECT "capability","status",COUNT(*)::bigint AS count,AVG(EXTRACT(EPOCH FROM (now()-"createdAt"))/3600)::float AS "avgAgeHours" FROM "ApprovalRequest" WHERE "tenantId"=${tenantId} GROUP BY "capability","status" ORDER BY "capability","status"`);
  return rows.map((row)=>({...row,count:Number(row.count),avgAgeHours:row.avgAgeHours===null?null:Number(row.avgAgeHours.toFixed(2))}));
}
export async function listApprovalPolicies(tenantId:string){return prisma.$queryRaw<ApprovalPolicyRecord[]>(Prisma.sql`SELECT * FROM "ApprovalPolicy" WHERE "tenantId"=${tenantId} ORDER BY "capability","version" DESC`);}
export function serializeApprovalAmount(value:Prisma.Decimal|null){return value===null?null:serializeDecimal(value,2);}
