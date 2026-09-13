import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { hipicoError } from './hipico-domain.js';
import { OPERATOR_EVIDENCE_AUTHORITIES } from './race-evidence-policy.js';
import { classifyRaceQueryIntent, RACE_COMMANDS, RACE_LIFECYCLE_STATES, type RaceCommandInput, type RaceQueryIntent } from './race-lifecycle.js';
import { RaceLifecycleStore } from './race.store.js';
import { operatorActorRef, operatorTokenValid } from '../hipico-bot/hipico-operator-security.js';

const router=Router(),store=new RaceLifecycleStore();
const uuid=z.string().uuid(),group=z.string().trim().min(3).max(120).regex(/^[A-Za-z0-9._:-]+$/),keySchema=z.string().regex(/^[A-Za-z0-9._:-]{8,120}$/);
const evidenceSchema=z.object({source:z.string().trim().min(1).max(160),authority:z.enum(OPERATOR_EVIDENCE_AUTHORITIES),confidence:z.number().min(0).max(1),reference:z.string().max(320).nullable().optional()}).strict();
const commandSchema=z.object({command:z.enum(RACE_COMMANDS),expectedState:z.enum(RACE_LIFECYCLE_STATES),requestId:keySchema,idempotencyKey:keySchema.optional(),correlationId:keySchema,evidence:z.array(evidenceSchema).max(20).default([]),payload:z.record(z.string(),z.unknown()).default({})}).strict();
const meetingSchema=z.object({name:z.string().trim().min(1).max(220),meetingDate:z.string().datetime({offset:true}).nullable().optional(),venue:z.string().trim().max(220).nullable().optional(),externalRef:z.string().trim().max(220).nullable().optional()}).strict();
const raceSchema=z.object({number:z.number().int().min(1).max(99),name:z.string().trim().min(1).max(220),scheduledAt:z.string().datetime({offset:true}).nullable().optional(),externalRef:z.string().trim().max(220).nullable().optional()}).strict();
function requestId(req:Request){return String((req as any).requestId||'').trim()||null;}
function ownerId(){const value=String(process.env.HIPICO_OWNER_ID||'').trim();if(!uuid.safeParse(value).success)throw Object.assign(new Error('HIPICO_OWNER_NOT_CONFIGURED'),{code:'HIPICO_OWNER_NOT_CONFIGURED'});return value;}
function groupKey(req:Request){const parsed=group.safeParse(req.header('x-hipico-group-key')||req.query.groupKey);if(!parsed.success)throw Object.assign(new Error('HIPICO_GROUP_INVALID'),{code:'HIPICO_GROUP_INVALID'});return parsed.data;}
function actorRef(){const value=operatorActorRef();if(!value)throw Object.assign(new Error('HIPICO_OPERATOR_ACTOR_NOT_CONFIGURED'),{code:'HIPICO_OPERATOR_ACTOR_NOT_CONFIGURED'});return value;}
function status(code:string){if(code.includes('NOT_FOUND'))return 404;if(code.includes('IDEMPOTENCY')||code==='RACE_STATE_CONFLICT'||code==='EXPECTED_STATE_MISMATCH'||code==='INVALID_TRANSITION'||code.includes('REQUIRES_')||code.startsWith('RACE_QUERY_'))return 409;if(code==='HIPICO_OWNER_NOT_CONFIGURED'||code==='HIPICO_OPERATOR_ACTOR_NOT_CONFIGURED')return 503;return 400;}
function sendError(req:Request,res:Response,error:any){const code=String(error?.code||error?.message||'HIPICO_RACE_ERROR').slice(0,120);return res.status(status(code)).json(hipicoError({code,message:code.startsWith('RACE_QUERY_')?'La consulta requiere un contexto de carrera o reunión inequívoco.':'No se pudo aplicar la operación de carrera.',requestId:requestId(req),retryable:code==='RACE_STATE_CONFLICT'}));}
function queryError(code:string):never{throw Object.assign(new Error(code),{code});}
function optionalUuid(value:unknown){const text=String(value||'').trim();return text?uuid.parse(text):null;}
function exactRaceContext(races:any[],intent:RaceQueryIntent,raceId:string|null){if(raceId){const match=races.find((race:any)=>race.id===raceId);if(!match)queryError('HIPICO_RACE_NOT_FOUND');return match;}const resultIntent=intent==='RESULT'||intent==='OFFICIALITY';const candidates=resultIntent?races.filter((race:any)=>['PROVISIONAL_RESULT','OFFICIAL_RESULT','ARCHIVED'].includes(race.state)||race.resultStage!=='none'):races.filter((race:any)=>['OPEN','CLOSING','RUNNING'].includes(race.state));if(candidates.length===1)return candidates[0];if(candidates.length===0)queryError('RACE_QUERY_CONTEXT_REQUIRED');queryError('RACE_QUERY_AMBIGUOUS');}
router.use((req,res,next)=>{res.setHeader('Cache-Control','no-store, max-age=0');if(!operatorTokenValid(req.header('x-hipico-operator-token')||undefined))return res.status(401).json(hipicoError({code:'HIPICO_OPERATOR_UNAUTHORIZED',message:'Operador no autenticado.',requestId:requestId(req)}));next();});
router.get('/meetings',async(req,res)=>{try{return res.json({ok:true,data:await store.listMeetings(ownerId(),groupKey(req),Number(req.query.limit)||50)});}catch(error){return sendError(req,res,error);}});
router.post('/meetings',async(req,res)=>{try{const body=meetingSchema.parse(req.body);return res.status(201).json({ok:true,data:await store.createMeeting({ownerId:ownerId(),groupKey:groupKey(req),...body})});}catch(error){return sendError(req,res,error);}});
router.get('/meetings/:id',async(req,res)=>{try{const owner=ownerId(),g=groupKey(req),id=uuid.parse(req.params.id),meeting=await store.getMeeting(owner,g,id);if(!meeting)throw Object.assign(new Error('HIPICO_MEETING_NOT_FOUND'),{code:'HIPICO_MEETING_NOT_FOUND'});return res.json({ok:true,data:{...meeting,races:await store.listRaces(owner,g,id)}});}catch(error){return sendError(req,res,error);}});
router.post('/meetings/:id/races',async(req,res)=>{try{const body=raceSchema.parse(req.body);return res.status(201).json({ok:true,data:await store.createRace({ownerId:ownerId(),groupKey:groupKey(req),meetingId:uuid.parse(req.params.id),...body})});}catch(error){return sendError(req,res,error);}});
router.get('/races',async(req,res)=>{try{return res.json({ok:true,data:await store.listRaces(ownerId(),groupKey(req),optionalUuid(req.query.meetingId),Number(req.query.limit)||100)});}catch(error){return sendError(req,res,error);}});
router.get('/races/:id/history',async(req,res)=>{try{return res.json({ok:true,data:await store.history(ownerId(),groupKey(req),uuid.parse(req.params.id))});}catch(error){return sendError(req,res,error);}});
router.post('/races/:id/commands',async(req,res)=>{
  try{
    const body=commandSchema.parse(req.body),headerKey=String(req.header('idempotency-key')||'').trim(),actor=actorRef();
    if(headerKey&&!keySchema.safeParse(headerKey).success)throw Object.assign(new Error('RACE_COMMAND_IDEMPOTENCY_KEY_INVALID'),{code:'RACE_COMMAND_IDEMPOTENCY_KEY_INVALID'});
    if(headerKey&&body.idempotencyKey&&headerKey!==body.idempotencyKey)throw Object.assign(new Error('RACE_COMMAND_IDEMPOTENCY_MISMATCH'),{code:'RACE_COMMAND_IDEMPOTENCY_MISMATCH'});
    const idempotencyKey=headerKey||body.idempotencyKey||body.requestId;
    const input:RaceCommandInput={...body,idempotencyKey,actorId:actor,actorType:'operator'};
    const result=await store.command(ownerId(),groupKey(req),uuid.parse(req.params.id),input);
    if(!result.transition.allowed&&!result.duplicate)return res.status(409).json(hipicoError({code:result.transition.reason,message:'La transición de carrera fue rechazada por el estado o la evidencia.',requestId:requestId(req)}));
    return res.status(result.duplicate?200:202).json({ok:true,data:{...result,requestId:body.requestId,idempotencyKey}});
  }catch(error){return sendError(req,res,error);}
});
router.get('/races/:id',async(req,res)=>{try{const race=await store.getRace(ownerId(),groupKey(req),uuid.parse(req.params.id));if(!race)throw Object.assign(new Error('HIPICO_RACE_NOT_FOUND'),{code:'HIPICO_RACE_NOT_FOUND'});return res.json({ok:true,data:race});}catch(error){return sendError(req,res,error);}});
router.get('/queries/races',async(req,res)=>{
  try{
    const text=z.string().trim().min(1).max(500).parse(req.query.text),intent=classifyRaceQueryIntent(text),owner=ownerId(),g=groupKey(req),meetingId=optionalUuid(req.query.meetingId),raceId=optionalUuid(req.query.raceId),races=await store.listRaces(owner,g,meetingId,200);let answer:any=null;
    if(intent==='ACTIVE_RACE'){const candidates=races.filter((race:any)=>['OPEN','CLOSING','RUNNING'].includes(race.state));if(candidates.length>1)queryError('RACE_QUERY_AMBIGUOUS');answer=candidates[0]||null;}
    else if(intent==='NEXT_RACE'){const candidates=[...races].filter((race:any)=>race.state==='DISCOVERED'||race.state==='ANNOUNCED').sort((a:any,b:any)=>Date.parse(a.scheduledAt||'9999-12-31')-Date.parse(b.scheduledAt||'9999-12-31')||a.number-b.number);if(candidates.length>1&&String(candidates[0].scheduledAt||'')===String(candidates[1].scheduledAt||'')&&candidates[0].meetingId!==candidates[1].meetingId)queryError('RACE_QUERY_AMBIGUOUS');answer=candidates[0]||null;}
    else if(intent==='LAST_RESULT')answer=races.find((race:any)=>['PROVISIONAL_RESULT','OFFICIAL_RESULT','ARCHIVED'].includes(race.state)||race.resultStage!=='none')||null;
    else if(intent==='SCHEDULE')answer=races;
    else if(intent==='MEETING_STATUS'){if(meetingId){const meeting=await store.getMeeting(owner,g,meetingId);if(!meeting)queryError('HIPICO_MEETING_NOT_FOUND');answer={...meeting,races};}else{const meetings=await store.listMeetings(owner,g,20);if(meetings.length!==1)queryError(meetings.length?'RACE_QUERY_AMBIGUOUS':'RACE_QUERY_CONTEXT_REQUIRED');answer={...meetings[0],races:await store.listRaces(owner,g,meetings[0].id,200)};}}
    else if(intent==='STATUS'||intent==='SCHEDULED_TIME'||intent==='RUNNERS'||intent==='SCRATCHES'||intent==='ODDS'||intent==='RESULT'||intent==='OFFICIALITY'){
      const race=exactRaceContext(races,intent,raceId),data=race.resultData&&typeof race.resultData==='object'?race.resultData:{};
      if(intent==='STATUS')answer={id:race.id,meetingId:race.meetingId,number:race.number,name:race.name,state:race.state,resultStage:race.resultStage,scheduledAt:race.scheduledAt};
      else if(intent==='SCHEDULED_TIME')answer={raceId:race.id,known:Boolean(race.scheduledAt),scheduledAt:race.scheduledAt||null};
      else if(intent==='RESULT')answer={raceId:race.id,known:race.resultStage!=='none',resultStage:race.resultStage,result:data,state:race.state};
      else if(intent==='OFFICIALITY')answer={raceId:race.id,resultStage:race.resultStage,official:race.resultStage==='official'};
      else if(intent==='RUNNERS')answer=Array.isArray((data as any).runners)?{raceId:race.id,known:true,runners:(data as any).runners}:{raceId:race.id,known:false,reason:'RUNNERS_REQUIRE_CANONICAL_PROVIDER_OR_DOCUMENT_EVIDENCE'};
      else if(intent==='SCRATCHES')answer=Array.isArray((data as any).scratches)?{raceId:race.id,known:true,scratches:(data as any).scratches}:{raceId:race.id,known:false,reason:'SCRATCHES_REQUIRE_CANONICAL_PROVIDER_OR_DOCUMENT_EVIDENCE'};
      else answer=(data as any).odds?{raceId:race.id,known:true,odds:(data as any).odds}:{raceId:race.id,known:false,reason:'ODDS_REQUIRE_CANONICAL_PROVIDER_EVIDENCE'};
    }else answer={known:false,reason:'QUERY_INTENT_UNKNOWN'};
    return res.json({ok:true,data:{intent,answer,scope:{ownerId:owner,groupId:g,meetingId,raceId}}});
  }catch(error){return sendError(req,res,error);}
});
router.use((error:any,req:Request,res:Response,_next:any)=>sendError(req,res,error));
export default router;
