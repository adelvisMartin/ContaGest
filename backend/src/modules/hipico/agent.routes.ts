import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { AUTOMATION_STATES } from './agent-policy.js';
import { createDefaultHipicoAgentEngine } from './agent-engine.js';
import { AutomationStore } from './automation.store.js';
import { hipicoError } from './hipico-domain.js';
import { operatorTokenValid } from '../hipico-bot/hipico-operator-security.js';

const router=Router();const store=new AutomationStore();const engine=createDefaultHipicoAgentEngine();
const uuid=z.string().uuid();const group=z.string().trim().min(3).max(120).regex(/^[A-Za-z0-9._:-]+$/);const groupId=z.string().trim().min(3).max(220).regex(/^[A-Za-z0-9@._:-]+$/);
const modeSchema=z.object({target:z.enum(AUTOMATION_STATES),operatorId:z.string().trim().min(1).max(220),ownerApproved:z.boolean().default(false)});
const evaluateSchema=z.object({text:z.string().trim().min(1).max(4000),expectedIntent:z.string().trim().max(120).nullable().optional(),evidence:z.record(z.string(),z.unknown()).optional()});
const reviewSchema=z.object({actualIntent:z.string().trim().min(1).max(120),operatorId:z.string().trim().min(1).max(220),highRiskFalsePositive:z.boolean().default(false),unauthorizedAction:z.boolean().default(false),conflict:z.boolean().default(false)});

function requestId(req:Request){return String((req as any).requestId||'').trim()||null;}
function ownerId(){const value=String(process.env.HIPICO_OWNER_ID||'').trim();if(!uuid.safeParse(value).success)throw Object.assign(new Error('HIPICO_OWNER_NOT_CONFIGURED'),{code:'HIPICO_OWNER_NOT_CONFIGURED'});return value;}
function groupKey(req:Request){const parsed=group.safeParse(req.header('x-hipico-group-key')||req.query.groupKey);if(!parsed.success)throw Object.assign(new Error('HIPICO_GROUP_INVALID'),{code:'HIPICO_GROUP_INVALID'});return parsed.data;}
function parsedGroupId(req:Request){return groupId.parse(req.params.groupId);}
function status(code:string){if(code.includes('NOT_FOUND'))return 404;if(code.includes('METRICS_INSUFFICIENT')||code==='OWNER_APPROVAL_REQUIRED'||code==='INVALID_PROMOTION_PATH')return 409;if(code==='HIPICO_OWNER_NOT_CONFIGURED')return 503;return 400;}
function sendError(req:Request,res:Response,error:any){const code=String(error?.code||error?.message||'HIPICO_AUTOMATION_ERROR').slice(0,120);return res.status(status(code)).json(hipicoError({code,message:'No se pudo aplicar la política de automatización.',requestId:requestId(req),retryable:false}));}

router.use((req,res,next)=>{res.setHeader('Cache-Control','no-store, max-age=0');if(!operatorTokenValid(req.header('x-hipico-operator-token')||undefined))return res.status(401).json(hipicoError({code:'HIPICO_OPERATOR_UNAUTHORIZED',message:'Operador no autenticado.',requestId:requestId(req)}));next();});

router.get('/groups/:groupId/automation',async(req,res)=>{try{const owner=ownerId(),g=groupKey(req),gid=parsedGroupId(req);const config=await store.get(owner,g,gid);const metrics=await store.metrics(owner,g,gid);return res.json({ok:true,data:{...config,metrics,agent:{generatorConfigured:false,tools:['queryRaceStatus','queryNextRace','queryLastResult','querySchedule','queryScratches','proposeRaceCommand']}}});}catch(error){return sendError(req,res,error);}});
router.post('/groups/:groupId/automation',async(req,res)=>{try{const body=modeSchema.parse(req.body);return res.json({ok:true,data:await store.setMode({ownerId:ownerId(),groupKey:groupKey(req),groupId:parsedGroupId(req),...body})});}catch(error){return sendError(req,res,error);}});
router.get('/groups/:groupId/automation/evaluations',async(req,res)=>{try{return res.json({ok:true,data:await store.evaluations(ownerId(),groupKey(req),parsedGroupId(req),Number(req.query.limit)||100)});}catch(error){return sendError(req,res,error);}});
router.post('/groups/:groupId/automation/evaluate',async(req,res)=>{
  try{
    const body=evaluateSchema.parse(req.body);const owner=ownerId(),g=groupKey(req),gid=parsedGroupId(req);const config=await store.get(owner,g,gid);const evaluation=await engine.evaluate(body.text,config.mode);
    const receipt=await store.recordEvaluation({ownerId:owner,groupKey:g,groupId:gid,text:body.text,expectedIntent:body.expectedIntent,candidate:evaluation.candidate,canAct:evaluation.canAct,evidence:body.evidence});
    return res.status(202).json({ok:true,data:{...evaluation,receipt,actions:[]}});
  }catch(error){return sendError(req,res,error);}
});
router.post('/groups/:groupId/automation/evaluations/:id/review',async(req,res)=>{try{const body=reviewSchema.parse(req.body);return res.json({ok:true,data:await store.review({ownerId:ownerId(),groupKey:groupKey(req),groupId:parsedGroupId(req),id:uuid.parse(req.params.id),...body})});}catch(error){return sendError(req,res,error);}});

router.use((error:any,req:Request,res:Response,_next:any)=>sendError(req,res,error));
export default router;
