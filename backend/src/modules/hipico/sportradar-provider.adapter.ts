import { createHorseRaceProvider, type HorseRaceProviderStatus, type HorseRaceStageSummary } from '../hipico-bot/hipico-race-provider.js';
import {
  ProviderCapabilityUnsupportedError,
  freshnessFrom,
  type NormalizedRace,
  type NormalizedRaceResult,
  type NormalizedRunner,
  type RacingData,
  type RacingDataProvider,
  type RacingProviderCapability,
  type RacingProviderHealth
} from './racing-provider.js';

type Upstream = {
  status():HorseRaceProviderStatus;
  getStageSummary(stageId:string):Promise<HorseRaceStageSummary>;
};

function decodeXml(value:string){
  return String(value||'')
    .replace(/&quot;/g,'"')
    .replace(/&apos;/g,"'")
    .replace(/&lt;/g,'<')
    .replace(/&gt;/g,'>')
    .replace(/&amp;/g,'&');
}

function attrs(source:string){
  const result:Record<string,string>={};
  for(const match of source.matchAll(/([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*"([^"]*)"/g))result[match[1]]=decodeXml(match[2]);
  return result;
}

function firstTag(xml:string,name:string){
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=xml.match(new RegExp(`<${escaped}\\b([^>]*)>`,'i'));
  return match?attrs(match[1]):null;
}

function competitorTags(xml:string){
  return [...xml.matchAll(/<competitor\b([^>]*)>/gi)].map((match)=>attrs(match[1]));
}

function normalizeRunner(row:Record<string,string>):NormalizedRunner|null{
  const id=String(row.id||'').trim();const name=String(row.name||row.abbreviation||'').trim();
  if(!id||!name)return null;
  return{id,name,number:row.number||row.jersey_number||row.rotation_number||null,status:'declared'};
}

function normalizeResult(raceId:string,xml:string,runners:NormalizedRunner[]):NormalizedRaceResult{
  const statusRow=firstTag(xml,'sport_event_status')||{};
  const status=String(statusRow.status||statusRow.match_status||'unknown');
  const positions:Array<{position:number;runnerId:string;runnerName:string|null}>=[];
  for(const match of xml.matchAll(/<(?:competitor_result|result)\b([^>]*)>/gi)){
    const row=attrs(match[1]);
    const position=Number(row.position||row.rank||row.place);
    const runnerId=String(row.competitor_id||row.id||'').trim();
    if(Number.isInteger(position)&&position>0&&runnerId){
      positions.push({position,runnerId,runnerName:runners.find((runner)=>runner.id===runnerId)?.name||null});
    }
  }
  positions.sort((a,b)=>a.position-b.position||a.runnerId.localeCompare(b.runnerId));
  return{raceId,status,positions};
}

export function normalizeSportradarStage(summary:HorseRaceStageSummary):RacingData<NormalizedRace>{
  const xml=summary.xml;
  const event=firstTag(xml,'sport_event')||firstTag(xml,'stage')||{};
  const context=firstTag(xml,'sport_event_context')||{};
  const generated=(firstTag(xml,'stage_summary')||firstTag(xml,'match_summary')||firstTag(xml,'summary')||{}).generated_at||null;
  const raceId=String(event.id||`sr:stage:${summary.stageId}`);
  const runners=competitorTags(xml).map(normalizeRunner).filter(Boolean) as NormalizedRunner[];
  const result=normalizeResult(raceId,xml,runners);
  const fetchedAt=summary.fetchedAt;
  return{
    data:{
      id:raceId,
      meetingId:context.competition_id||context.tournament_id||null,
      name:String(event.name||`Stage ${summary.stageId}`),
      scheduledAt:event.scheduled||event.start_time||null,
      status:result.status,
      runners,
      result
    },
    provenance:{
      provider:'sportradar-uof',
      source:`sportradar-uof:sr:stage:${summary.stageId}`,
      sourceTimestamp:generated,
      fetchedAt,
      freshness:freshnessFrom(generated,fetchedAt),
      officiality:'verified',
      financialAuthority:false
    }
  };
}

export function createSportradarRacingProvider(upstream:Upstream=createHorseRaceProvider()):RacingDataProvider{
  const supported:RacingProviderCapability[]=['getRace','getResult'];
  const unsupported=(capability:RacingProviderCapability)=>Promise.reject(new ProviderCapabilityUnsupportedError('sportradar-uof',capability));
  return{
    id:'sportradar-uof',
    capabilities:()=>[...supported],
    async health():Promise<RacingProviderHealth>{
      const status=upstream.status();
      return{
        id:'sportradar-uof',configured:status.configured,
        state:status.configured?'ready':'not_configured',reason:status.reason,capabilities:[...supported],financialAuthority:false
      };
    },
    listMeetings:()=>unsupported('listMeetings'),
    getMeeting:()=>unsupported('getMeeting'),
    async getRace(id:string){return normalizeSportradarStage(await upstream.getStageSummary(id));},
    getEntries:()=>unsupported('getEntries'),
    getScratches:()=>unsupported('getScratches'),
    async getResult(id:string){
      const race=normalizeSportradarStage(await upstream.getStageSummary(id));
      return{data:race.data.result as NormalizedRaceResult,provenance:race.provenance};
    }
  };
}
