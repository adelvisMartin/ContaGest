import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { hipicoError } from './hipico-domain.js';
import { classifyRaceQueryIntent, RACE_COMMANDS, RACE_LIFECYCLE_STATES, type RaceCommandInput } from './race-lifecycle.js';
import { RaceLifecycleStore } from './race.store.js';
import { operatorTokenValid } from '../hipico-bot/hipico-operator-security.js';

const router=Router();const store=new RaceLifecycleStore();
const uuid=z.string().uuid();const group=z.string().trim().min(3).max(120).regex(/^[A-Za-z0-9._:-]+$/);
const evidenceSchema=z.object({source:z.string().trim().min(1).max(160),authority:z.enum(['official','trusted','operator','group_evidence','unknown']),confidence:z.number().min(0).max(1),reference:z.string().max(320).nullable().optional()});
const commandSchema=z.object({command:z.enum(RACE_COMMANDS),expectedState:z.enum(RACE_LIFECYCLE_STATES),requestId:z.string().min(8).max(120),actorId:z.string().min(1).max(220),correlationId:z.string().min(8).max(120),evidence:z.array(evidenceSchema).max(20).default([]),payload:z.record(z.string(),z.unknown()).default({})});
const meetingSchema=z.object({name:z.string().trim().min(1).max(220),meetingDate:z.string().datetime({offset:true}).nullable().optional(),venue:z.string().trim().max(220).nullable().optional(),externalRef:z.string().trim().max(220).nullable().optional()});
const raceSchema=z.object({number:z.number().int().min(1).max(99),name:z.string().trim().min(1).max(220),scheduledAt:z.string().datetime({offset:true}).nullable().optional(),externalRef:z.string().trim().max(220).nullable().optional()});

function requestId(req:Request){return String((req as any).requestId||'').trim()||null;}
function ownerId(){const value=String(process.env.HIPICO_OWNER_ID||'').trim();if(!uuid.safeParse(value).success)throw Object.assign(new Error('HIPICO_OWNER_NOT_CONFIGURED'),{code:'HIPICO_OWNER_NOT_CONFIGURED'});return value;}
function groupKey(req:Request){const parsed=group.safeParse(req.header('x-hipico-group-key')||req.query.groupKey);if(!parsed.success)throw Object.assign(new Error('HIPICO_GROUP_INVALID'),{code:'HIPICO_GROUP_INVALID'});return parsed.data;}
function status(code:string){if(code.includes('NOT_FOUND'))return 404;if(code.includes('IDEMPOTENCY')||code==='RACE_STATE_CONFLICT'||code==='EXPECTED_STATE_MISMATCH'||code==='INVALID_TRANSITION'||code.includes('REQUIRES_'))return 409;if(code==='HIPICO_OWNER_NOT_CONFIGURED')return 503;return 400;}
function sendError(req:Request,res:Response,error:any){const code=String(error?.code||error?.message||'HIPICO_RACE_ERROR').slice(0,120);return res.status(status(code)).json(hipicoError({code,message:'No se pudo aplicar la operación de carrera.',requestId:requestId(req),retryable:code==='RACE_STATE_CONFLICT'}));}

router.use((req,res,next)=>{res.setHeader('Cache-Control','no-store, max-age=0');if(!operatorTokenValid(req.header('x-hipico-operator-token')||undefined))return res.status(401).json(hipicoError({code:'HIPICO_OPERATOR_UNAUTHORIZED',message:'Operador no autenticado.',requestId:requestId(req)}));next();});

router.get('/meetings',async(req,res)=>{try{return res.json({ok:true,data:await store.listMeetings(ownerId(),groupKey(req),Number(req.query.limit)||50)});}catch(error){return sendError(req,res,error);}});
router.post('/meetings',async(req,res)=>{try{const body=meetingSchema.parse(req.body);return res.status(201).json({ok:true,data:await store.createMeeting({ownerId:ownerId(),groupKey:groupKey(req),...body})});}catch(error){return sendError(req,res,error);}});
router.get('/meetings/:id',async(req,res)=>{try{const owner=ownerId(),g=groupKey(req),id=uuid.parse(req.params.id);const meeting=await store.getMeeting(owner,g,id);if(!meeting)throw Object.assign(new Error('HIPICO_MEETING_NOT_FOUND'),{code:'HIPICO_MEETING_NOT_FOUND'});return res.json({ok:true,data:{...meeting,races:await store.listRaces(owner,g,id)}});}catch(error){return sendError(req,res,error);}});
router.post('/meetings/:id/races',async(req,res)=>{try{const body=raceSchema.parse(req.body);return res.status(201).json({ok:true,data:await store.createRace({ownerId:ownerId(),groupKey:groupKey(req),meetingId:uuid.parse(req.params.id),...body})});}catch(error){return sendError(req,res,error);}});

router.get('/races',async(req,res)=>{try{const meetingId=req.query.meetingId?uuid.parse(req.query.meetingId):null;return res.json({ok:true,data:await store.listRaces(ownerId(),groupKey(req),meetingId,Number(req.query.limit)||100)});}catch(error){return sendError(req,res,error);}});
router.get('/races/:id/history',async(req,res)=>{try{return res.json({ok:true,data:await store.history(ownerId(),groupKey(req),uuid.parse(req.params.id))});}catch(error){return sendError(req,res,error);}});
router.post('/races/:id/commands',async(req,res)=>{
  try{
    const body=commandSchema.parse(req.body);
    const input:RaceCommandInput={...body,actorType:'operator'};
    const result=await store.command(ownerId(),groupKey(req),uuid.parse(req.params.id),input);
    if(!result.transition.allowed&&!result.duplicate)return res.status(409).json(hipicoError({code:result.transition.reason,message:'La transición de carrera fue rechazada por el estado o la evidencia.',requestId:requestId(req)}));
    return res.status(result.duplicate?200:202).json({ok:true,data:result});
  }catch(error){return sendError(req,res,error);}
});
router.get('/races/:id',async(req,res)=>{try{const race=await store.getRace(ownerId(),groupKey(req),uuid.parse(req.params.id));if(!race)throw Object.assign(new Error('HIPICO_RACE_NOT_FOUND'),{code:'HIPICO_RACE_NOT_FOUND'});return res.json({ok:true,data:race});}catch(error){return sendError(req,res,error);}});

router.get('/queries/races',async(req,res)=>{
  try{
    const text=z.string().trim().min(1).max(500).parse(req.query.text);const intent=classifyRaceQueryIntent(text);const races=await store.listRaces(ownerId(),groupKey(req),null,200);
    let answer:any=null;
    if(intent==='ACTIVE_RACE')answer=races.find((race:any)=>race.state==='OPEN'||race.state==='CLOSING')||null;
    else if(intent==='NEXT_RACE')answer=[...races].filter((race:any)=>race.state==='DISCOVERED'||race.state==='ANNOUNCED').sort((a:any,b:any)=>Date.parse(a.scheduledAt||'9999-12-31')-Date.parse(b.scheduledAt||'9999-12-31'))[0]||null;
    else if(intent==='LAST_RESULT')answer=races.find((race:any)=>['PROVISIONAL_RESULT','OFFICIAL_RESULT','ARCHIVED'].includes(race.state))||null;
    else if(intent==='SCHEDULE')answer=races;
    else if(intent==='STATUS')answer=races.length===1?races[0]:{requiresRaceSelection:true,candidates:races.slice(0,20).map((race:any)=>({id:race.id,number:race.number,name:race.name,state:race.state}))};
    else if(intent==='SCRATCHES')answer={known:false,reason:'SCRATCHES_REQUIRE_CANONICAL_PROVIDER_OR_DOCUMENT_EVIDENCE'};
    else answer={known:false,reason:'QUERY_INTENT_UNKNOWN'};
    return res.json({ok:true,data:{intent,answer}});
  }catch(error){return sendError(req,res,error);}
});

router.use((error:any,req:Request,res:Response,_next:any)=>sendError(req,res,error));
export default router;
