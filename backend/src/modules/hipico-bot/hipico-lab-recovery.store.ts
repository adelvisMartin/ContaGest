import crypto from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import { RaceQueryService, formatRaceQueryResponse } from '../hipico/race-query.service.js';
import { canonicalBridgeReadScope } from './hipico-canonical-shadow.store.js';
import {
  labReplayCandidate, labReplayEligible, labReplaySnapshotValid, LAB_REPLY_REPLAY_TTL_MS,
  type LabReplayScope
} from './hipico-lab-recovery-policy.js';
import type { SafeResponsePlan } from './hipico-response-safety.js';

type ReplyPlan = SafeResponsePlan & {readModelDigest?:string|null};
type SnapshotRow={
  id:string;intent:string;responseHash:string|null;status:string;
  scopeHash:string|null;text:string|null;kind:string|null;policy:string|null;
  readDigest:string|null;expiresAt:Date|null;
};

const digest=(value:string)=>crypto.createHash('sha256').update(value).digest('hex');

/**
 * Store the entire authorized, bounded LAB reply in the existing response receipt.
 * A transport replay does not regenerate domain mutations or change this snapshot.
 * The original receipt and the source event must be persistent before calling.
 */
export async function persistLabReplayCandidate(input:{
  receiptId:string;scope:LabReplayScope;plan:ReplyPlan;now?:Date
}):Promise<void>{
  const candidate=labReplayCandidate(input.scope,input.plan);
  if(!candidate)return;
  const expiresAt=new Date((input.now||new Date()).getTime()+LAB_REPLY_REPLAY_TTL_MS);
  const hash=digest(candidate.text);
  const rows=await prisma.$queryRaw<Array<{id:string}>>`
    UPDATE public."HipicoResponseReceipt"
    SET "labReplayScopeHash"=${candidate.fingerprint},
        "labReplayText"=${candidate.text},
        "labReplayKind"=${candidate.kind},
        "labReplayPolicy"=${candidate.policy},
        "labReplayReadDigest"=${candidate.readDigest},
        "labReplayExpiresAt"=${expiresAt}
    WHERE "id"=${input.receiptId}
      AND "idempotencyKey"=${input.plan.responseIdempotencyKey}
      AND "sourceMessageId"=${input.scope.sourceMessageId}
      AND "responseHash"=${hash}
      AND "confirmationVerified"=false
      AND "status"='planned'
      AND "labReplayText" IS NULL
    RETURNING "id"`;
  if(rows.length===1)return;
  // Another concurrent request could have written the same immutable snapshot.
  const current=await prisma.$queryRaw<Array<SnapshotRow>>`
    SELECT "id","intent","responseHash","status",
      "labReplayScopeHash" AS "scopeHash","labReplayText" AS "text",
      "labReplayKind" AS "kind","labReplayPolicy" AS "policy",
      "labReplayReadDigest" AS "readDigest","labReplayExpiresAt" AS "expiresAt"
    FROM public."HipicoResponseReceipt"
    WHERE "id"=${input.receiptId} AND "idempotencyKey"=${input.plan.responseIdempotencyKey}
    LIMIT 2`;
  if(current.length!==1 || current[0].scopeHash!==candidate.fingerprint
    || current[0].text!==candidate.text || current[0].kind!==candidate.kind
    || current[0].policy!==candidate.policy || current[0].readDigest!==candidate.readDigest
    || current[0].status!=='planned' || current[0].responseHash!==hash){
    throw Object.assign(new Error('LAB_REPLY_SNAPSHOT_CONFLICT'),{code:'LAB_REPLY_SNAPSHOT_CONFLICT'});
  }
}

/** Returns null (manual review/no reply) when any permission, freshness or integrity check fails. */
export async function recoverLabReplayCandidate(input:{
  scope:LabReplayScope;duplicatePlan:ReplyPlan;now?:Date
}):Promise<SafeResponsePlan|null>{
  if(!labReplayEligible(input.scope))return null;
  const rows=await prisma.$queryRaw<Array<SnapshotRow>>`
    SELECT "id","intent","responseHash","status",
      "labReplayScopeHash" AS "scopeHash","labReplayText" AS "text",
      "labReplayKind" AS "kind","labReplayPolicy" AS "policy",
      "labReplayReadDigest" AS "readDigest","labReplayExpiresAt" AS "expiresAt"
    FROM public."HipicoResponseReceipt"
    WHERE "idempotencyKey"=${input.duplicatePlan.responseIdempotencyKey}
      AND "sourceMessageId"=${input.scope.sourceMessageId}
    LIMIT 2`;
  if(rows.length!==1)return null;
  const row=rows[0];
  if(row.status!=='planned' || row.intent==='CONFIRMED' || row.intent==='NONE'
    || !row.scopeHash || !row.kind || !row.policy || !row.text || !row.expiresAt
    || !labReplaySnapshotValid({
      scopeHash:row.scopeHash,policy:row.policy,kind:row.kind,text:row.text,
      readDigest:row.readDigest,expiresAt:row.expiresAt,responseHash:row.responseHash
    },input.scope,(input.now||new Date()).getTime()))return null;
  if(row.kind==='race_query'){
    try{
      const scope=await canonicalBridgeReadScope(input.scope.channelId,input.scope.groupKey);
      const result=await new RaceQueryService().execute({
        ownerId:scope.ownerId,groupKey:scope.groupKey,text:input.scope.messageText
      });
      const freshHash=digest(JSON.stringify(result));
      const freshText=formatRaceQueryResponse(result).slice(0,3000);
      if(freshHash!==row.readDigest || freshText!==row.text)return null;
    }catch{return null;}
  }
  // The local LAB acknowledgement journal is the only send/delivery authority.
  return{
    ...input.duplicatePlan,
    intent:row.intent as SafeResponsePlan['intent'],
    text:row.text,
    canSend:true,
    confirmationVerified:false,
    evidence:null,
    handoffRequired:false,
    reason:'LAB_RECEIPT_RECOVERED_REVALIDATED'
  };
}
