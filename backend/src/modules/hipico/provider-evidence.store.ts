import crypto from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import type { RacingData, RacingDataProvider, RacingProviderCapability } from './racing-provider.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GROUP_RE=/^[A-Za-z0-9._:-]{3,120}$/;
const EXTERNAL_RE=/^[A-Za-z0-9:@._-]{0,220}$/;

function scope(ownerId:string,groupKey:string){
  if(!UUID_RE.test(ownerId))throw Object.assign(new Error('HIPICO_OWNER_INVALID'),{code:'HIPICO_OWNER_INVALID'});
  if(!GROUP_RE.test(groupKey))throw Object.assign(new Error('HIPICO_GROUP_INVALID'),{code:'HIPICO_GROUP_INVALID'});
}

function stable(value:unknown):string{
  if(value===null)return 'null';
  if(value===undefined)return 'null';
  if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;
  if(typeof value==='object'){
    const row=value as Record<string,unknown>;
    return `{${Object.keys(row).sort().map((key)=>`${JSON.stringify(key)}:${stable(row[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function payloadHash(data:unknown){return crypto.createHash('sha256').update(stable(data)).digest('hex');}
function confidenceFor(officiality:string){
  if(officiality==='official')return 1;
  if(officiality==='verified')return .95;
  if(officiality==='provisional')return .75;
  if(officiality==='observed')return .6;
  return null;
}

export class ProviderEvidenceStore{
  async record<T>(input:{ownerId:string;groupKey:string;capability:RacingProviderCapability;externalId?:string|null;record:RacingData<T>}){
    scope(input.ownerId,input.groupKey);
    const externalId=String(input.externalId||'').trim();
    if(!EXTERNAL_RE.test(externalId))throw Object.assign(new Error('HIPICO_PROVIDER_EXTERNAL_ID_INVALID'),{code:'HIPICO_PROVIDER_EXTERNAL_ID_INVALID'});
    const provenance=input.record.provenance;
    if(provenance.financialAuthority!==false)throw Object.assign(new Error('HIPICO_PROVIDER_FINANCIAL_AUTHORITY_FORBIDDEN'),{code:'HIPICO_PROVIDER_FINANCIAL_AUTHORITY_FORBIDDEN'});
    const fetchedAt=new Date(provenance.fetchedAt);
    if(!Number.isFinite(fetchedAt.getTime()))throw Object.assign(new Error('HIPICO_PROVIDER_FETCHED_AT_INVALID'),{code:'HIPICO_PROVIDER_FETCHED_AT_INVALID'});
    const sourceTimestamp=provenance.sourceTimestamp?new Date(provenance.sourceTimestamp):null;
    if(sourceTimestamp&&!Number.isFinite(sourceTimestamp.getTime()))throw Object.assign(new Error('HIPICO_PROVIDER_SOURCE_TIMESTAMP_INVALID'),{code:'HIPICO_PROVIDER_SOURCE_TIMESTAMP_INVALID'});
    const hash=payloadHash(input.record.data);
    const normalized=JSON.stringify(input.record.data);
    const provenanceJson=JSON.stringify(provenance);
    const confidence=confidenceFor(provenance.officiality);
    const rows=await prisma.$queryRaw<any[]>`
      INSERT INTO public.hipico_provider_evidence(
        owner_id,group_key,provider_id,capability,external_id,source,source_provider,source_timestamp,fetched_at,
        freshness,officiality,authority,confidence,financial_authority,payload_hash,normalized,provenance)
      VALUES(
        ${input.ownerId}::uuid,${input.groupKey},${provenance.provider},${input.capability},${externalId},${provenance.source},${provenance.provider},
        ${sourceTimestamp},${fetchedAt},${provenance.freshness},${provenance.officiality},'external_provider',${confidence},false,${hash},
        ${normalized}::jsonb,${provenanceJson}::jsonb)
      ON CONFLICT(owner_id,group_key,provider_id,capability,external_id,payload_hash,fetched_at)
      DO UPDATE SET provenance=EXCLUDED.provenance
      RETURNING id::text AS id,provider_id AS "providerId",capability,external_id AS "externalId",source_provider AS "sourceProvider",
        source_timestamp AS "sourceTimestamp",fetched_at AS "fetchedAt",freshness,officiality,authority,confidence,
        financial_authority AS "financialAuthority",payload_hash AS "payloadHash",created_at AS "createdAt"`;
    return rows[0];
  }

  async recent(ownerId:string,groupKey:string,limit=50){
    scope(ownerId,groupKey);const bounded=Math.min(200,Math.max(1,Math.trunc(limit)||50));
    return prisma.$queryRaw<any[]>`
      SELECT id::text AS id,provider_id AS "providerId",capability,external_id AS "externalId",source,source_provider AS "sourceProvider",
        source_timestamp AS "sourceTimestamp",fetched_at AS "fetchedAt",freshness,officiality,authority,confidence,
        financial_authority AS "financialAuthority",payload_hash AS "payloadHash",normalized,provenance,created_at AS "createdAt"
      FROM public.hipico_provider_evidence
      WHERE owner_id=${ownerId}::uuid AND group_key=${groupKey}
      ORDER BY created_at DESC,id DESC LIMIT ${bounded}`;
  }
}

export async function fetchAndRecordProviderData<T>(input:{
  store:ProviderEvidenceStore;
  provider:RacingDataProvider;
  ownerId:string;
  groupKey:string;
  capability:RacingProviderCapability;
  externalId?:string|null;
  load:()=>Promise<RacingData<T>>;
}){
  const record=await input.load();
  const evidence=await input.store.record({ownerId:input.ownerId,groupKey:input.groupKey,capability:input.capability,externalId:input.externalId,record});
  return{...record,evidence:{id:evidence.id,payloadHash:evidence.payloadHash,createdAt:evidence.createdAt}};
}
