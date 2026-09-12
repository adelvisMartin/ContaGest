import { Router } from 'express';
import { z } from 'zod';
import { createDefaultHipicoAutomationEngine } from './hipico-automation-engine.js';
import { HipicoAutomationStore } from './hipico-automation.store.js';
import { AUTOMATION_STATES } from './hipico-automation-policy.js';
import { operatorActorRef, operatorTokenValid, ownerApprovalTokenValid } from './hipico-operator-security.js';

const router=Router();
const store=new HipicoAutomationStore();
const engine=createDefaultHipicoAutomationEngine();
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GROUP_KEY_RE=/^[A-Za-z0-9._:-]{3,120}$/;
const scopeSchema=z.object({groupKey:z.string().trim().min(3).max(120).regex(GROUP_KEY_RE)}).strict();
const evaluationSchema=scopeSchema.extend({text:z.string().trim().min(1).max(4000),expectedIntent:z.string().trim().min(1).max(120).nullable().optional()}).strict();
const reviewSchema=scopeSchema.extend({actualIntent:z.string().trim().min(1).max(120),highRiskFalsePositive:z.boolean().optional(),unauthorizedAction:z.boolean().optional(),conflict:z.boolean().optional()}).strict();
const transitionSchema=scopeSchema.extend({target:z.enum(AUTOMATION_STATES),reason:z.string().trim().min(5).max(500)}).strict();

function ownerId(){const value=String(process.env.HIPICO_OWNER_ID||'').trim();if(!UUID_RE.test(value))throw new Error('HIPICO_OWNER_ID_NOT_CONFIGURED');return value;}
function groupId(req:any){const value=String(req.params?.groupId||'').trim();if(value.length<3||value.length>220||!/^[A-Za-z0-9@._:-]+$/.test(value))throw new Error('HIPICO_AUTOMATION_GROUP_ID_INVALID');return value;}
function operatorAuth(req:any){const token=req.header('x-hipico-operator-token')||undefined;if(!operatorTokenValid(token))return null;return operatorActorRef(token);}
function parseLimit(value:unknown){const parsed=Number(value);return Number.isFinite(parsed)?Math.min(500,Math.max(1,Math.trunc(parsed))):100;}
function fail(res:any,error:unknown){const code=String((error as any)?.code||(error as any)?.message||'HIPICO_AUTOMATION_ERROR');if(code==='HIPICO_AGENT_EVALUATION_NOT_FOUND')return res.status(404).json({ok:false,error:code});if(code==='HIPICO_AUTOMATION_IDEMPOTENCY_CONFLICT')return res.status(409).json({ok:false,error:code});if(code.includes('NOT_CONFIGURED'))return res.status(503).json({ok:false,error:code});if(code.startsWith('HIPICO_'))return res.status(400).json({ok:false,error:code});console.error('[hipico-automation] request failed',{error:(error as any)?.message||String(error)});return res.status(503).json({ok:false,error:'HIPICO_AUTOMATION_UNAVAILABLE',retryable:true});}

router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store, max-age=0');next();});
router.use('/groups/:groupId/automation',(req,res,next)=>{const actor=operatorAuth(req);if(!actor)return res.status(401).json({ok:false,error:'HIPICO_OPERATOR_AUTH_REQUIRED'});(req as any).hipicoOperatorRef=actor;next();});

router.get('/groups/:groupId/automation/health',async(_req,res)=>{try{const readiness=await store.readiness();return res.status(readiness.ready?200:503).json({ok:readiness.ready,...readiness,policy:{rawSql:false,shell:false,universalAdmin:false,monetaryWrite:false,directDatabaseWrite:false}});}catch(error){return fail(res,error);}});

router.get('/groups/:groupId/automation',async(req,res)=>{const parsed=scopeSchema.safeParse(req.query);if(!parsed.success)return res.status(400).json({ok:false,error:'HIPICO_AUTOMATION_SCOPE_INVALID'});try{const scope={ownerId:ownerId(),groupKey:parsed.data.groupKey,groupId:groupId(req)};const [state,metrics]=await Promise.all([store.get(scope.ownerId,scope.groupKey,scope.groupId),store.metrics(scope.ownerId,scope.groupKey,scope.groupId)]);return res.json({ok:true,scope:{groupKey:scope.groupKey,groupId:scope.groupId},state,metrics,sourceWrite:false,monetaryWrite:false});}catch(error){return fail(res,error);}});

router.post('/groups/:groupId/automation/evaluations',async(req,res)=>{const parsed=evaluationSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'HIPICO_AUTOMATION_EVALUATION_INVALID'});try{const scope={ownerId:ownerId(),groupKey:parsed.data.groupKey,groupId:groupId(req)};const state=await store.get(scope.ownerId,scope.groupKey,scope.groupId);const result=await engine.evaluate(parsed.data.text,state.mode,scope);const persisted=await store.recordEvaluation({...scope,text:parsed.data.text,expectedIntent:parsed.data.expectedIntent,candidate:result.candidate,canAct:result.canAct,evidence:{parser:'deterministic-first',modelRejected:result.modelRejected,tool:result.toolRequest?.tool||null,automaticEligibility:result.canAct,executed:false}});return res.status(201).json({ok:true,evaluationId:persisted.id,messageHash:persisted.messageHash,mode:state.mode,prediction:result.candidate,toolRequest:result.toolRequest,automaticEligibility:result.canAct,executed:false,actions:[],humanReviewRequired:!result.canAct||result.candidate.risk!=='safe',sourceWrite:false,monetaryWrite:false});}catch(error){return fail(res,error);}});

router.post('/groups/:groupId/automation/evaluations/:evaluationId/review',async(req,res)=>{const parsed=reviewSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'HIPICO_AUTOMATION_REVIEW_INVALID'});try{const result=await store.review({ownerId:ownerId(),groupKey:parsed.data.groupKey,groupId:groupId(req),evaluationId:String(req.params.evaluationId||''),actualIntent:parsed.data.actualIntent,operatorRef:String((req as any).hipicoOperatorRef),highRiskFalsePositive:parsed.data.highRiskFalsePositive,unauthorizedAction:parsed.data.unauthorizedAction,conflict:parsed.data.conflict});return res.json({ok:true,...result});}catch(error){return fail(res,error);}});

router.get('/groups/:groupId/automation/evaluations',async(req,res)=>{const parsed=scopeSchema.safeParse({groupKey:req.query.groupKey});if(!parsed.success)return res.status(400).json({ok:false,error:'HIPICO_AUTOMATION_SCOPE_INVALID'});try{const data=await store.evaluations(ownerId(),parsed.data.groupKey,groupId(req),parseLimit(req.query.limit));return res.json({ok:true,data});}catch(error){return fail(res,error);}});
router.get('/groups/:groupId/automation/transitions',async(req,res)=>{const parsed=scopeSchema.safeParse({groupKey:req.query.groupKey});if(!parsed.success)return res.status(400).json({ok:false,error:'HIPICO_AUTOMATION_SCOPE_INVALID'});try{const data=await store.transitions(ownerId(),parsed.data.groupKey,groupId(req),parseLimit(req.query.limit));return res.json({ok:true,data});}catch(error){return fail(res,error);}});

router.post('/groups/:groupId/automation/transitions',async(req,res)=>{const parsed=transitionSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({ok:false,error:'HIPICO_AUTOMATION_TRANSITION_INVALID'});const requestId=String(req.header('idempotency-key')||'').trim();if(!/^[A-Za-z0-9._:-]{8,120}$/.test(requestId))return res.status(400).json({ok:false,error:'HIPICO_AUTOMATION_IDEMPOTENCY_KEY_REQUIRED'});try{const target=parsed.data.target;const ownerApproved=target==='AUTOMATIC'?ownerApprovalTokenValid(req.header('x-hipico-owner-approval-token')||undefined):false;const result=await store.transition({ownerId:ownerId(),groupKey:parsed.data.groupKey,groupId:groupId(req),target,operatorRef:String((req as any).hipicoOperatorRef),ownerApproved,requestId,reason:parsed.data.reason});if(!result.decision.allowed)return res.status(409).json({ok:false,error:result.decision.reason,audited:true,...result});return res.json({ok:true,audited:true,...result,sourceWrite:false,monetaryWrite:false});}catch(error){return fail(res,error);}});

export default router;
export const __test__={ownerId,parseLimit};
