import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { hipicoError } from './hipico-domain.js';
import { OPERATOR_EVIDENCE_AUTHORITIES } from './race-evidence-policy.js';
import { RACE_COMMANDS, RACE_LIFECYCLE_STATES, type RaceCommandInput } from './race-lifecycle.js';
import { RaceLifecycleStore } from './race.store.js';
import { RaceQueryService } from './race-query.service.js';
import { operatorActorRef, operatorTokenValid } from '../hipico-bot/hipico-operator-security.js';

const router=Router(),store=new RaceLifecycleStore(),queryService=new RaceQueryService(store);
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
function optionalUuid(value:unknown){const text=String(value||'').trim();return text?uuid.parse(text):null;}
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
    const data=await queryService.execute({
      ownerId:ownerId(),
      groupKey:groupKey(req),
      text:z.string().trim().min(1).max(500).parse(req.query.text),
      meetingId:optionalUuid(req.query.meetingId),
      raceId:optionalUuid(req.query.raceId)
    });
    return res.json({ok:true,data});
  }catch(error){return sendError(req,res,error);}
});
router.use((error:any,req:Request,res:Response,_next:any)=>sendError(req,res,error));
export default router;
