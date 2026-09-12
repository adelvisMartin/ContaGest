import crypto from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import { AUTOMATION_STATES, canPromoteAutomation, type AgentCandidate, type AutomationMetrics, type AutomationState } from './hipico-automation-policy.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GROUP_RE=/^[A-Za-z0-9._:-]{3,120}$/;
const GROUP_ID_RE=/^[A-Za-z0-9@._:-]{3,220}$/;
const REQUEST_ID_RE=/^[A-Za-z0-9._:-]{8,120}$/;
function assertScope(ownerId:string,groupKey:string,groupId:string){if(!UUID_RE.test(ownerId))throw new Error('HIPICO_OWNER_INVALID');if(!GROUP_RE.test(groupKey))throw new Error('HIPICO_GROUP_INVALID');if(!GROUP_ID_RE.test(groupId))throw new Error('HIPICO_AUTOMATION_GROUP_ID_INVALID');}
function defaultMode(groupId:string):AutomationState{return String(process.env.HIPICO_SOURCE_GROUP_ID||'').trim().toLowerCase()===groupId.toLowerCase()?'SHADOW':'DISABLED';}
function boundedEvidence(value:unknown){const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};const encoded=JSON.stringify(source);if(encoded.length>8000)throw new Error('HIPICO_AUTOMATION_EVIDENCE_TOO_LARGE');return encoded;}
function signature(value:unknown){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function numberMetric(value:bigint|number|null|undefined){return Number(value||0);}

async function metricsWithClient(client:any,ownerId:string,groupKey:string,groupId:string):Promise<AutomationMetrics>{
  const rows=await client.$queryRaw<Array<{reviewed:bigint|number;matched:bigint|number;highRiskFalsePositive:bigint|number;unauthorizedAction:bigint|number;conflicts:bigint|number}>>`
    SELECT count(*) FILTER (WHERE reviewed_at IS NOT NULL) AS reviewed,
      count(*) FILTER (WHERE reviewed_at IS NOT NULL AND matched=true) AS matched,
      count(*) FILTER (WHERE reviewed_at IS NOT NULL AND high_risk_false_positive=true) AS "highRiskFalsePositive",
      count(*) FILTER (WHERE reviewed_at IS NOT NULL AND unauthorized_action=true) AS "unauthorizedAction",
      count(*) FILTER (WHERE reviewed_at IS NOT NULL AND conflict=true) AS conflicts
    FROM public.hipico_agent_evaluations
    WHERE owner_id=${ownerId}::uuid AND group_key=${groupKey} AND group_id=${groupId}`;
  const row=rows[0];return{reviewed:numberMetric(row?.reviewed),matched:numberMetric(row?.matched),highRiskFalsePositive:numberMetric(row?.highRiskFalsePositive),unauthorizedAction:numberMetric(row?.unauthorizedAction),conflicts:numberMetric(row?.conflicts)};
}

export class HipicoAutomationStore {
  async readiness(){const rows=await prisma.$queryRaw<Array<{automation:string|null;evaluations:string|null;transitions:string|null}>>`SELECT to_regclass('public.hipico_group_automation')::text AS automation,to_regclass('public.hipico_agent_evaluations')::text AS evaluations,to_regclass('public.hipico_automation_transitions')::text AS transitions`;return{ready:Boolean(rows[0]?.automation&&rows[0]?.evaluations&&rows[0]?.transitions)};}
  async metrics(ownerId:string,groupKey:string,groupId:string){assertScope(ownerId,groupKey,groupId);return metricsWithClient(prisma,ownerId,groupKey,groupId);}
  async get(ownerId:string,groupKey:string,groupId:string){
    assertScope(ownerId,groupKey,groupId);const mode=defaultMode(groupId);
    await prisma.$executeRaw`INSERT INTO public.hipico_group_automation(id,owner_id,group_key,group_id,mode,updated_by) VALUES(${crypto.randomUUID()}::uuid,${ownerId}::uuid,${groupKey},${groupId},${mode},'system-default') ON CONFLICT(owner_id,group_key,group_id) DO NOTHING`;
    const rows=await prisma.$queryRaw<Array<{mode:AutomationState;updatedAt:Date|string;updatedBy:string|null}>>`SELECT mode,updated_at AS "updatedAt",updated_by AS "updatedBy" FROM public.hipico_group_automation WHERE owner_id=${ownerId}::uuid AND group_key=${groupKey} AND group_id=${groupId} LIMIT 1`;
    if(!rows[0])throw new Error('HIPICO_AUTOMATION_STATE_NOT_FOUND');return rows[0];
  }
  async transition(input:{ownerId:string;groupKey:string;groupId:string;target:AutomationState;operatorRef:string;ownerApproved:boolean;requestId:string;reason:string}){
    assertScope(input.ownerId,input.groupKey,input.groupId);if(!(AUTOMATION_STATES as readonly string[]).includes(input.target))throw new Error('HIPICO_AUTOMATION_STATE_INVALID');if(!REQUEST_ID_RE.test(input.requestId))throw new Error('HIPICO_AUTOMATION_IDEMPOTENCY_KEY_INVALID');
    const reason=String(input.reason||'').trim().slice(0,500);if(reason.length<5)throw new Error('HIPICO_AUTOMATION_REASON_REQUIRED');const operatorRef=String(input.operatorRef||'').trim().slice(0,220);if(!operatorRef)throw new Error('HIPICO_AUTOMATION_OPERATOR_REQUIRED');await this.get(input.ownerId,input.groupKey,input.groupId);
    const inputSignature=signature({ownerId:input.ownerId,groupKey:input.groupKey,groupId:input.groupId,target:input.target,operatorRef,ownerApproved:Boolean(input.ownerApproved),reason});
    return prisma.$transaction(async(tx)=>{
      const prior=await tx.$queryRaw<Array<{inputSignature:string;fromMode:AutomationState;toMode:AutomationState;decisionAllowed:boolean;decisionReason:string;metrics:any}>>`SELECT input_signature AS "inputSignature",from_mode AS "fromMode",to_mode AS "toMode",decision_allowed AS "decisionAllowed",decision_reason AS "decisionReason",metrics FROM public.hipico_automation_transitions WHERE owner_id=${input.ownerId}::uuid AND group_key=${input.groupKey} AND group_id=${input.groupId} AND request_id=${input.requestId} LIMIT 1`;
      if(prior[0]){if(prior[0].inputSignature!==inputSignature)throw Object.assign(new Error('HIPICO_AUTOMATION_IDEMPOTENCY_CONFLICT'),{code:'HIPICO_AUTOMATION_IDEMPOTENCY_CONFLICT'});return{replayed:true,previous:prior[0].fromMode,current:prior[0].decisionAllowed?prior[0].toMode:prior[0].fromMode,decision:{allowed:prior[0].decisionAllowed,reason:prior[0].decisionReason,metrics:{accuracy:Number(prior[0].metrics?.accuracy||0),conflictRate:Number(prior[0].metrics?.conflictRate||0)}},metrics:prior[0].metrics};}
      const stateRows=await tx.$queryRaw<Array<{mode:AutomationState}>>`SELECT mode FROM public.hipico_group_automation WHERE owner_id=${input.ownerId}::uuid AND group_key=${input.groupKey} AND group_id=${input.groupId} LIMIT 1 FOR UPDATE`;
      const current=stateRows[0]?.mode||defaultMode(input.groupId);const metrics=await metricsWithClient(tx,input.ownerId,input.groupKey,input.groupId);const decision=canPromoteAutomation(current,input.target,metrics,input.ownerApproved);const auditMetrics={...metrics,...decision.metrics};
      await tx.$executeRaw`INSERT INTO public.hipico_automation_transitions(id,owner_id,group_key,group_id,request_id,input_signature,from_mode,to_mode,operator_ref,owner_approved,decision_allowed,decision_reason,reason,metrics) VALUES(${crypto.randomUUID()}::uuid,${input.ownerId}::uuid,${input.groupKey},${input.groupId},${input.requestId},${inputSignature},${current},${input.target},${operatorRef},${Boolean(input.ownerApproved)},${decision.allowed},${decision.reason},${reason},${JSON.stringify(auditMetrics)}::jsonb)`;
      if(decision.allowed&&current!==input.target)await tx.$executeRaw`UPDATE public.hipico_group_automation SET mode=${input.target},updated_by=${operatorRef},updated_at=now() WHERE owner_id=${input.ownerId}::uuid AND group_key=${input.groupKey} AND group_id=${input.groupId}`;
      return{replayed:false,previous:current,current:decision.allowed?input.target:current,decision,metrics};
    });
  }
  async recordEvaluation(input:{ownerId:string;groupKey:string;groupId:string;text:string;expectedIntent?:string|null;candidate:AgentCandidate;canAct:boolean;evidence?:unknown}){
    assertScope(input.ownerId,input.groupKey,input.groupId);await this.get(input.ownerId,input.groupKey,input.groupId);const id=crypto.randomUUID();const messageHash=crypto.createHash('sha256').update(input.text).digest('hex');const expectedIntent=String(input.expectedIntent||'').trim().slice(0,120)||null;const evidence=boundedEvidence(input.evidence);
    await prisma.$executeRaw`INSERT INTO public.hipico_agent_evaluations(id,owner_id,group_key,group_id,message_hash,expected_intent,predicted_intent,confidence,risk,tool,can_act,model_version,evidence) VALUES(${id}::uuid,${input.ownerId}::uuid,${input.groupKey},${input.groupId},${messageHash},${expectedIntent},${input.candidate.intent},${input.candidate.confidence},${input.candidate.risk},${input.candidate.tool||null},${input.canAct},${input.candidate.modelVersion||input.candidate.source},${evidence}::jsonb)`;return{id,messageHash};
  }
  async review(input:{ownerId:string;groupKey:string;groupId:string;evaluationId:string;actualIntent:string;operatorRef:string;highRiskFalsePositive?:boolean;unauthorizedAction?:boolean;conflict?:boolean}){
    assertScope(input.ownerId,input.groupKey,input.groupId);if(!UUID_RE.test(input.evaluationId))throw new Error('HIPICO_AGENT_EVALUATION_ID_INVALID');const actualIntent=String(input.actualIntent||'').trim().slice(0,120);if(!actualIntent)throw new Error('HIPICO_AGENT_ACTUAL_INTENT_REQUIRED');
    const rows=await prisma.$queryRaw<Array<{predictedIntent:string}>>`SELECT predicted_intent AS "predictedIntent" FROM public.hipico_agent_evaluations WHERE id=${input.evaluationId}::uuid AND owner_id=${input.ownerId}::uuid AND group_key=${input.groupKey} AND group_id=${input.groupId} LIMIT 1`;if(!rows[0])throw Object.assign(new Error('HIPICO_AGENT_EVALUATION_NOT_FOUND'),{code:'HIPICO_AGENT_EVALUATION_NOT_FOUND'});const matched=rows[0].predictedIntent===actualIntent;
    await prisma.$executeRaw`UPDATE public.hipico_agent_evaluations SET actual_intent=${actualIntent},matched=${matched},high_risk_false_positive=${Boolean(input.highRiskFalsePositive)},unauthorized_action=${Boolean(input.unauthorizedAction)},conflict=${Boolean(input.conflict)},reviewed_by=${String(input.operatorRef).slice(0,220)},reviewed_at=now() WHERE id=${input.evaluationId}::uuid AND owner_id=${input.ownerId}::uuid AND group_key=${input.groupKey} AND group_id=${input.groupId}`;return{matched};
  }
  async evaluations(ownerId:string,groupKey:string,groupId:string,limit=100){assertScope(ownerId,groupKey,groupId);const bounded=Math.min(500,Math.max(1,Math.trunc(limit)||100));return prisma.$queryRaw<any[]>`SELECT id,message_hash AS "messageHash",expected_intent AS "expectedIntent",predicted_intent AS "predictedIntent",actual_intent AS "actualIntent",confidence,risk,tool,can_act AS "canAct",model_version AS "modelVersion",matched,high_risk_false_positive AS "highRiskFalsePositive",unauthorized_action AS "unauthorizedAction",conflict,evidence,created_at AS "createdAt",reviewed_at AS "reviewedAt",reviewed_by AS "reviewedBy" FROM public.hipico_agent_evaluations WHERE owner_id=${ownerId}::uuid AND group_key=${groupKey} AND group_id=${groupId} ORDER BY created_at DESC,id DESC LIMIT ${bounded}`;}
  async transitions(ownerId:string,groupKey:string,groupId:string,limit=100){assertScope(ownerId,groupKey,groupId);const bounded=Math.min(500,Math.max(1,Math.trunc(limit)||100));return prisma.$queryRaw<any[]>`SELECT id,request_id AS "requestId",from_mode AS "fromMode",to_mode AS "toMode",operator_ref AS "operatorRef",owner_approved AS "ownerApproved",decision_allowed AS "decisionAllowed",decision_reason AS "decisionReason",reason,metrics,created_at AS "createdAt" FROM public.hipico_automation_transitions WHERE owner_id=${ownerId}::uuid AND group_key=${groupKey} AND group_id=${groupId} ORDER BY created_at DESC,id DESC LIMIT ${bounded}`;}
}
export const __test__={defaultMode,signature};
