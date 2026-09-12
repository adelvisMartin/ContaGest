export type RacingProviderCapability = 'listMeetings'|'getMeeting'|'getRace'|'getEntries'|'getScratches'|'getResult';
export type RacingFreshness = 'LIVE'|'FRESH'|'STALE'|'OFFLINE';
export type RacingOfficiality = 'official'|'verified'|'provisional'|'observed'|'unofficial';

export type RacingProvenance = {
  provider:string;
  source:string;
  sourceTimestamp:string|null;
  fetchedAt:string;
  freshness:RacingFreshness;
  officiality:RacingOfficiality;
  authority:'external_provider';
  confidence:number|null;
  financialAuthority:false;
};
export type NormalizedRunner={id:string;name:string;number:string|null;status:'declared'|'scratched'|'unknown'};
export type NormalizedMeeting={id:string;name:string;scheduledDate:string|null;venue:string|null};
export type NormalizedRaceResult={raceId:string;status:string;positions:Array<{position:number;runnerId:string;runnerName:string|null}>};
export type NormalizedRace={id:string;meetingId:string|null;name:string;scheduledAt:string|null;status:string;runners:NormalizedRunner[];result:NormalizedRaceResult|null};
export type RacingData<T>={data:T;provenance:RacingProvenance};
export type RacingProviderHealth={id:string;configured:boolean;state:'ready'|'not_configured'|'degraded'|'offline';reason:string|null;capabilities:RacingProviderCapability[];financialAuthority:false};
export interface RacingDataProvider{
  id:string;capabilities():RacingProviderCapability[];health():Promise<RacingProviderHealth>;
  listMeetings():Promise<RacingData<NormalizedMeeting[]>>;getMeeting(id:string):Promise<RacingData<NormalizedMeeting>>;getRace(id:string):Promise<RacingData<NormalizedRace>>;getEntries(id:string):Promise<RacingData<NormalizedRunner[]>>;getScratches(id:string):Promise<RacingData<NormalizedRunner[]>>;getResult(id:string):Promise<RacingData<NormalizedRaceResult>>;
}
export class ProviderCapabilityUnsupportedError extends Error{readonly code='PROVIDER_CAPABILITY_UNSUPPORTED';constructor(public readonly providerId:string,public readonly capability:RacingProviderCapability){super(`${providerId} does not support ${capability}`);this.name='ProviderCapabilityUnsupportedError';}}
export class RacingDataConflictError extends Error{readonly code='DATA_CONFLICT';constructor(public readonly evidence:Array<{source:string;signature:string}>){super('Conflicting racing evidence requires operator review.');this.name='RacingDataConflictError';}}
export function freshnessFrom(sourceTimestamp:string|null,fetchedAt:string,now=Date.now()):RacingFreshness{const source=sourceTimestamp?Date.parse(sourceTimestamp):NaN,fetched=Date.parse(fetchedAt),basis=Number.isFinite(source)?source:fetched;if(!Number.isFinite(basis))return'OFFLINE';const age=Math.max(0,now-basis);if(age<=30_000)return'LIVE';if(age<=5*60_000)return'FRESH';if(age<=60*60_000)return'STALE';return'OFFLINE';}
function resultSignature(result:NormalizedRaceResult){return JSON.stringify([result.raceId,result.status,result.positions.map((row)=>[row.position,row.runnerId])]);}
export function resolveResultEvidence(records:Array<RacingData<NormalizedRaceResult>>){if(!records.length)return null;const signatures=new Map<string,RacingData<NormalizedRaceResult>[]>();for(const record of records){const signature=resultSignature(record.data),group=signatures.get(signature)||[];group.push(record);signatures.set(signature,group);}if(signatures.size>1)throw new RacingDataConflictError(records.map((record)=>({source:record.provenance.source,signature:resultSignature(record.data)})));return records[0];}
export const EVIDENCE_FALLBACK_ORDER=['official_api','authorized_provider','official_feed_document','uploaded_official_pdf','operator','group_evidence'] as const;
export function evidenceRank(source:typeof EVIDENCE_FALLBACK_ORDER[number]){return EVIDENCE_FALLBACK_ORDER.indexOf(source);}
