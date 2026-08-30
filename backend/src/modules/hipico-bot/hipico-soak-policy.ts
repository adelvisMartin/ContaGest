export type SoakThresholds={
  maxRssGrowthMbPerHour:number;
  maxHeapGrowthMbPerHour:number;
  maxEventLoopP95Ms:number;
  maxBacklogAgeSeconds:number;
  maxUnexpectedDuplicateResponses:number;
  maxLostDecisions:number;
  maxContextLeaks:number;
  maxHealthFailureRate:number;
};
export type SoakSummaryInput={
  candidateSha:string;
  durationMs:number;
  samples:number;
  rssStartMb:number;
  rssEndMb:number;
  heapStartMb:number;
  heapEndMb:number;
  eventLoopP95Ms:number;
  maxBacklogAgeSeconds:number;
  unexpectedDuplicateResponses:number;
  lostDecisions:number;
  contextLeaks:number;
  healthChecks:number;
  healthFailures:number;
  sourceReadOnly:'PASS'|'FAIL'|'BLOCKED'|'NOT_EXECUTED';
  labOnlyWriteDestination:'PASS'|'FAIL'|'BLOCKED'|'NOT_EXECUTED';
  drills:Record<string,'PASS'|'FAIL'|'BLOCKED'|'NOT_EXECUTED'>;
};
export type SoakEvaluation={
  status:'PASS'|'FAIL'|'BLOCKED'|'SMOKE_ONLY'|'NOT_EXECUTED';
  violations:string[];
  blocked:string[];
  durationHours:number;
  rssGrowthMbPerHour:number;
  heapGrowthMbPerHour:number;
  healthFailureRate:number;
};

export function evaluateSoak(input:SoakSummaryInput,policy:{releaseMinimumHours:number;requiredDrills:string[];thresholds:SoakThresholds}):SoakEvaluation{
  const durationHours=input.durationMs/3_600_000;
  const divisor=Math.max(durationHours,1/3600);
  const rssGrowthMbPerHour=(input.rssEndMb-input.rssStartMb)/divisor;
  const heapGrowthMbPerHour=(input.heapEndMb-input.heapStartMb)/divisor;
  const healthFailureRate=input.healthChecks?input.healthFailures/input.healthChecks:0;
  const violations:string[]=[];const blocked:string[]=[];
  if(!/^[a-f0-9]{40}$/i.test(input.candidateSha))blocked.push('CANDIDATE_SHA_UNBOUND');
  if(input.sourceReadOnly!=='PASS')blocked.push(`SOURCE_READ_ONLY_${input.sourceReadOnly}`);
  if(input.labOnlyWriteDestination!=='PASS')blocked.push(`LAB_ONLY_WRITE_${input.labOnlyWriteDestination}`);
  for(const drill of policy.requiredDrills){const state=input.drills[drill]||'NOT_EXECUTED';if(state==='FAIL')violations.push(`DRILL_${drill}_FAIL`);else if(state!=='PASS')blocked.push(`DRILL_${drill}_${state}`);}
  if(rssGrowthMbPerHour>policy.thresholds.maxRssGrowthMbPerHour)violations.push('RSS_GROWTH');
  if(heapGrowthMbPerHour>policy.thresholds.maxHeapGrowthMbPerHour)violations.push('HEAP_GROWTH');
  if(input.eventLoopP95Ms>policy.thresholds.maxEventLoopP95Ms)violations.push('EVENT_LOOP_P95');
  if(input.maxBacklogAgeSeconds>policy.thresholds.maxBacklogAgeSeconds)violations.push('BACKLOG_AGE');
  if(input.unexpectedDuplicateResponses>policy.thresholds.maxUnexpectedDuplicateResponses)violations.push('DUPLICATE_RESPONSE');
  if(input.lostDecisions>policy.thresholds.maxLostDecisions)violations.push('LOST_DECISION');
  if(input.contextLeaks>policy.thresholds.maxContextLeaks)violations.push('CONTEXT_LEAK');
  if(healthFailureRate>policy.thresholds.maxHealthFailureRate)violations.push('HEALTH_FAILURE_RATE');
  let status:SoakEvaluation['status']='PASS';
  if(violations.length)status='FAIL';
  else if(blocked.length)status='BLOCKED';
  else if(durationHours<policy.releaseMinimumHours)status='SMOKE_ONLY';
  if(input.samples===0)status='NOT_EXECUTED';
  return{status,violations,blocked,durationHours,rssGrowthMbPerHour,heapGrowthMbPerHour,healthFailureRate};
}
