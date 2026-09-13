import crypto from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import { evaluateRaceCommand, normalizeRaceCommandInput, raceCommandMutatesState, type RaceCommandInput, type RaceLifecycleState, type RaceResultStage } from './race-lifecycle.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GROUP_RE=/^[A-Za-z0-9._:-]{3,120}$/;
function scope(ownerId:string,groupKey:string){if(!UUID_RE.test(ownerId))throw Object.assign(new Error('HIPICO_OWNER_INVALID'),{code:'HIPICO_OWNER_INVALID'});if(!GROUP_RE.test(groupKey))throw Object.assign(new Error('HIPICO_GROUP_INVALID'),{code:'HIPICO_GROUP_INVALID'});}
function stable(value:unknown):string{if(value===null||value===undefined)return'null';if(Array.isArray(value))return`[${value.map(stable).join(',')}]`;if(typeof value==='object'){const row=value as Record<string,unknown>;return`{${Object.keys(row).sort().map((key)=>`${JSON.stringify(key)}:${stable(row[key])}`).join(',')}}`;}return JSON.stringify(value);}
function signature(input:RaceCommandInput){const {requestId:_requestId,idempotencyKey:_idempotencyKey,...semantic}=input;return crypto.createHash('sha256').update(stable(semantic)).digest('hex');}

export class RaceLifecycleStore {
  async createMeeting(input:{ownerId:string;groupKey:string;name:string;meetingDate?:string|null;venue?:string|null;externalRef?:string|null}){
    scope(input.ownerId,input.groupKey);const id=crypto.randomUUID();const rows=await prisma.$queryRaw<any[]>`
      INSERT INTO public.hipico_meetings(id,owner_id,group_key,name,meeting_date,venue,external_ref)
      VALUES(${id}::uuid,${input.ownerId}::uuid,${input.groupKey},${input.name},${input.meetingDate?new Date(input.meetingDate):null},${input.venue||null},${input.externalRef||null})
      RETURNING id,name,meeting_date AS "meetingDate",venue,external_ref AS "externalRef",created_at AS "createdAt"`;return rows[0];
  }
  async listMeetings(ownerId:string,groupKey:string,limit=50){scope(ownerId,groupKey);const bounded=Math.min(100,Math.max(1,Math.trunc(limit)||50));return prisma.$queryRaw<any[]>`SELECT id,name,meeting_date AS "meetingDate",venue,external_ref AS "externalRef",created_at AS "createdAt" FROM public.hipico_meetings WHERE owner_id=${ownerId}::uuid AND group_key=${groupKey} ORDER BY meeting_date DESC NULLS LAST,created_at DESC LIMIT ${bounded}`;}
  async getMeeting(ownerId:string,groupKey:string,id:string){scope(ownerId,groupKey);const rows=await prisma.$queryRaw<any[]>`SELECT id,name,meeting_date AS "meetingDate",venue,external_ref AS "externalRef",created_at AS "createdAt" FROM public.hipico_meetings WHERE id=${id}::uuid AND owner_id=${ownerId}::uuid AND group_key=${groupKey} LIMIT 1`;return rows[0]||null;}
  async createRace(input:{ownerId:string;groupKey:string;meetingId:string;number:number;name:string;scheduledAt?:string|null;externalRef?:string|null}){
    scope(input.ownerId,input.groupKey);const id=crypto.randomUUID();const rows=await prisma.$queryRaw<any[]>`
      INSERT INTO public.hipico_races(id,owner_id,group_key,meeting_id,race_number,name,scheduled_at,external_ref,state,result_stage,state_version)
      SELECT ${id}::uuid,${input.ownerId}::uuid,${input.groupKey},m.id,${input.number},${input.name},${input.scheduledAt?new Date(input.scheduledAt):null},${input.externalRef||null},'DISCOVERED','none',0
      FROM public.hipico_meetings m WHERE m.id=${input.meetingId}::uuid AND m.owner_id=${input.ownerId}::uuid AND m.group_key=${input.groupKey}
      RETURNING id,meeting_id AS "meetingId",race_number AS "number",name,scheduled_at AS "scheduledAt",external_ref AS "externalRef",state,result_stage AS "resultStage",state_version AS "stateVersion"`;
    if(!rows[0])throw Object.assign(new Error('HIPICO_MEETING_NOT_FOUND'),{code:'HIPICO_MEETING_NOT_FOUND'});return rows[0];
  }
  async listRaces(ownerId:string,groupKey:string,meetingId?:string|null,limit=100){scope(ownerId,groupKey);const bounded=Math.min(200,Math.max(1,Math.trunc(limit)||100));if(meetingId)return prisma.$queryRaw<any[]>`SELECT id,meeting_id AS "meetingId",race_number AS "number",name,scheduled_at AS "scheduledAt",external_ref AS "externalRef",state,result_stage AS "resultStage",state_version AS "stateVersion",result_data AS "resultData" FROM public.hipico_races WHERE owner_id=${ownerId}::uuid AND group_key=${groupKey} AND meeting_id=${meetingId}::uuid ORDER BY race_number ASC LIMIT ${bounded}`;return prisma.$queryRaw<any[]>`SELECT id,meeting_id AS "meetingId",race_number AS "number",name,scheduled_at AS "scheduledAt",external_ref AS "externalRef",state,result_stage AS "resultStage",state_version AS "stateVersion",result_data AS "resultData" FROM public.hipico_races WHERE owner_id=${ownerId}::uuid AND group_key=${groupKey} ORDER BY scheduled_at DESC NULLS LAST,race_number ASC LIMIT ${bounded}`;}
  async getRace(ownerId:string,groupKey:string,id:string){scope(ownerId,groupKey);const rows=await prisma.$queryRaw<any[]>`SELECT id,meeting_id AS "meetingId",race_number AS "number",name,scheduled_at AS "scheduledAt",external_ref AS "externalRef",state,result_stage AS "resultStage",state_version AS "stateVersion",result_data AS "resultData",created_at AS "createdAt",updated_at AS "updatedAt" FROM public.hipico_races WHERE id=${id}::uuid AND owner_id=${ownerId}::uuid AND group_key=${groupKey} LIMIT 1`;return rows[0]||null;}
  async history(ownerId:string,groupKey:string,raceId:string){scope(ownerId,groupKey);return prisma.$queryRaw<any[]>`SELECT id,request_id AS "requestId",idempotency_key AS "idempotencyKey",command,actor_id AS "actorId",actor_type AS "actorType",correlation_id AS "correlationId",from_state AS "fromState",to_state AS "toState",from_result_stage AS "fromResultStage",to_result_stage AS "toResultStage",disposition,reason,evidence,payload,created_at AS "createdAt" FROM public.hipico_race_events WHERE owner_id=${ownerId}::uuid AND group_key=${groupKey} AND race_id=${raceId}::uuid ORDER BY created_at ASC,id ASC`;}
  async command(ownerId:string,groupKey:string,raceId:string,raw:RaceCommandInput){
    scope(ownerId,groupKey);const input=normalizeRaceCommandInput(raw),inputSignature=signature(input),idempotencyKey=String(input.idempotencyKey);
    return prisma.$transaction(async(tx)=>{
      const races=await tx.$queryRaw<Array<{state:RaceLifecycleState;stateVersion:number;resultStage:RaceResultStage}>>`SELECT state,state_version AS "stateVersion",result_stage AS "resultStage" FROM public.hipico_races WHERE id=${raceId}::uuid AND owner_id=${ownerId}::uuid AND group_key=${groupKey} LIMIT 1 FOR UPDATE`;
      if(!races[0])throw Object.assign(new Error('HIPICO_RACE_NOT_FOUND'),{code:'HIPICO_RACE_NOT_FOUND'});
      const previous=await tx.$queryRaw<Array<{id:string;inputSignature:string;fromState:RaceLifecycleState;toState:RaceLifecycleState;fromResultStage:RaceResultStage|null;toResultStage:RaceResultStage|null;disposition:string;reason:string}>>`
        SELECT id::text AS id,input_signature AS "inputSignature",from_state AS "fromState",to_state AS "toState",from_result_stage AS "fromResultStage",to_result_stage AS "toResultStage",disposition,reason
        FROM public.hipico_race_events WHERE owner_id=${ownerId}::uuid AND group_key=${groupKey} AND race_id=${raceId}::uuid AND (idempotency_key=${idempotencyKey} OR request_id=${input.requestId}) ORDER BY created_at ASC LIMIT 1`;
      if(previous[0]){
        if(previous[0].inputSignature!==inputSignature)throw Object.assign(new Error('RACE_COMMAND_IDEMPOTENCY_MISMATCH'),{code:'RACE_COMMAND_IDEMPOTENCY_MISMATCH'});
        const replay=previous[0],fallback=evaluateRaceCommand(replay.fromState,input,replay.fromResultStage||undefined);
        return{duplicate:true,eventId:replay.id,transition:{allowed:replay.disposition==='applied',from:replay.fromState,to:replay.toState,reason:replay.reason,resultStage:replay.toResultStage||fallback.resultStage}};
      }
      const current=races[0],transition=evaluateRaceCommand(current.state,input,current.resultStage),eventId=crypto.randomUUID();
      await tx.$executeRaw`INSERT INTO public.hipico_race_events(id,owner_id,group_key,race_id,request_id,idempotency_key,input_signature,command,actor_id,actor_type,correlation_id,from_state,to_state,from_result_stage,to_result_stage,disposition,reason,evidence,payload)
        VALUES(${eventId}::uuid,${ownerId}::uuid,${groupKey},${raceId}::uuid,${input.requestId},${idempotencyKey},${inputSignature},${input.command},${input.actorId},${input.actorType},${input.correlationId},${transition.from},${transition.to},${current.resultStage},${transition.resultStage},${transition.allowed?'applied':'rejected'},${transition.reason},${JSON.stringify(input.evidence||[])}::jsonb,${JSON.stringify(input.payload||{})}::jsonb)`;
      if(transition.allowed&&raceCommandMutatesState(input.command)){
        const resultCommands=new Set(['RECORD_OBSERVED_ARRIVAL','RECORD_PROVISIONAL_RESULT','MARK_VERIFIED_RESULT','MARK_OFFICIAL_RESULT']),payload=input.payload||{};
        const resultPayload=resultCommands.has(input.command)&&Object.keys(payload).length?JSON.stringify(payload):null;
        const affected=await tx.$executeRaw`UPDATE public.hipico_races SET state=${transition.to},result_stage=${transition.resultStage},state_version=state_version+1,result_data=CASE WHEN ${resultPayload}::text IS NULL THEN result_data ELSE ${resultPayload}::jsonb END,updated_at=now() WHERE id=${raceId}::uuid AND owner_id=${ownerId}::uuid AND group_key=${groupKey} AND state_version=${current.stateVersion}`;
        if(affected!==1)throw Object.assign(new Error('RACE_STATE_CONFLICT'),{code:'RACE_STATE_CONFLICT'});
      }
      return{duplicate:false,eventId,transition};
    });
  }
}
