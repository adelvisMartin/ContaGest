export type EvidenceStatus='PASS'|'FAIL'|'BLOCKED'|'NOT_EXECUTED';
export type SoakDrillEvidence={status:EvidenceStatus;at?:string|null;evidence?:string[]};
export type SoakThresholds={
  maxRssGrowthMbPerHour:number;
  maxHeapGrowthMbPerHour:number;
  maxEventLoopP95Ms:number;
  maxBacklogAgeSeconds:number;
  maxSpoolBytes:number;
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
  maxSpoolBytes:number;
  unexpectedDuplicateResponses:number;
  lostDecisions:number;
  contextLeaks:number;
  healthConfigured:boolean;
  spoolConfigured:boolean;
  healthChecks:number;
  healthFailures:number;
  spoolChecks:number;
  spoolAvailableChecks:number;
  operatorPresent:boolean;
  physicalEvidenceComplete:boolean;
  sourceReadOnly:EvidenceStatus;
  labOnlyWriteDestination:EvidenceStatus;
  sessionFallbackSafe:EvidenceStatus;
  invariantEvidenceComplete:boolean;
  drillMaterialEvidenceComplete:boolean;
  drills:Record<string,SoakDrillEvidence>;
};
export type SoakEvaluation={
  status:'PASS'|'FAIL'|'BLOCKED'|'SMOKE_ONLY'|'NOT_EXECUTED';
  violations:string[];
  blocked:string[];
  durationHours:number;
  rssGrowthMbPerHour:number;
  heapGrowthMbPerHour:number;
  healthFailureRate:number;
  healthCoverageRatio:number;
  spoolCoverageRatio:number;
};
export type SoakPolicy={
  releaseMinimumHours:number;
  requiredDrills:string[];
  minimumHealthCoverageRatio:number;
  minimumSpoolCoverageRatio:number;
  drillEvidenceRequired:boolean;
  drillMaterialEvidenceRequiredForRelease:boolean;
  physicalEvidenceRequiredForRelease:boolean;
  healthEndpointRequiredForRelease:boolean;
  spoolPathRequiredForRelease:boolean;
  invariantEvidenceRequiredForRelease:boolean;
  thresholds:SoakThresholds;
};
export type SoakMaterialHash={artifact:string;sha256:string;label?:string;reference?:string};
export type SoakEvidenceIntegrity={
  samplesSha256:string;
  physicalEvidenceSha256:string|null;
  safetyEvidenceSha256:string|null;
  drillEvidenceSha256:string|null;
  physicalVerifiedFiles:number;
  safetyMaterial:SoakMaterialHash[];
  drillMaterial:SoakMaterialHash[];
};
export type SoakReleaseEvidenceInput={
  candidateSha:string;
  attemptId:string;
  operatorId:string|null;
  startedAt:string;
  completedAt:string;
  durationRequestedMinutes:number;
  policyVersion:number;
  summaryInput:SoakSummaryInput;
  evaluation:SoakEvaluation;
  evidenceIntegrity:SoakEvidenceIntegrity;
};
export type SoakReleaseEvidence={
  schema:'hipico-soak-evidence.v120';
  candidateSha:string;
  status:'PASS';
  attemptId:string;
  operatorId:string;
  startedAt:string;
  completedAt:string;
  durationRequestedMinutes:number;
  policyVersion:number;
  summaryInput:SoakSummaryInput;
  evaluation:SoakEvaluation;
  evidenceIntegrity:SoakEvidenceIntegrity;
};

export function createSoakReleaseEvidence(input:SoakReleaseEvidenceInput,policy:SoakPolicy):SoakReleaseEvidence|null{
  const candidateSha=String(input.candidateSha||'').trim().toLowerCase();
  const summarySha=String(input.summaryInput?.candidateSha||'').trim().toLowerCase();
  const operatorId=String(input.operatorId||'').trim();
  const minimumMinutes=policy.releaseMinimumHours*60;
  const releasePass=input.evaluation?.status==='PASS'
    && input.evaluation.durationHours>=policy.releaseMinimumHours
    && input.durationRequestedMinutes>=minimumMinutes;
  if(!releasePass||!/^[a-f0-9]{40}$/i.test(candidateSha)||summarySha!==candidateSha||!operatorId)return null;
  return{
    schema:'hipico-soak-evidence.v120',
    candidateSha,
    status:'PASS',
    attemptId:input.attemptId,
    operatorId,
    startedAt:input.startedAt,
    completedAt:input.completedAt,
    durationRequestedMinutes:input.durationRequestedMinutes,
    policyVersion:input.policyVersion,
    summaryInput:input.summaryInput,
    evaluation:input.evaluation,
    evidenceIntegrity:input.evidenceIntegrity
  };
}

export function evaluateSoak(input:SoakSummaryInput,policy:SoakPolicy):SoakEvaluation{
  const durationHours=input.durationMs/3_600_000;
  const divisor=Math.max(durationHours,1/3600);
  const rssGrowthMbPerHour=(input.rssEndMb-input.rssStartMb)/divisor;
  const heapGrowthMbPerHour=(input.heapEndMb-input.heapStartMb)/divisor;
  const healthFailureRate=input.healthChecks?input.healthFailures/input.healthChecks:0;
  const healthCoverageRatio=input.samples?input.healthChecks/input.samples:0;
  const spoolCoverageRatio=input.spoolChecks?input.spoolAvailableChecks/input.spoolChecks:0;
  const violations:string[]=[];const blocked:string[]=[];

  if(!/^[a-f0-9]{40}$/i.test(input.candidateSha))blocked.push('CANDIDATE_SHA_UNBOUND');
  if(!input.operatorPresent)blocked.push('OPERATOR_NOT_IDENTIFIED');
  if(policy.physicalEvidenceRequiredForRelease&&!input.physicalEvidenceComplete)blocked.push('PHYSICAL_QA_119_EVIDENCE_INCOMPLETE');
  if(input.sourceReadOnly!=='PASS')blocked.push(`SOURCE_READ_ONLY_${input.sourceReadOnly}`);
  if(input.labOnlyWriteDestination!=='PASS')blocked.push(`LAB_ONLY_WRITE_${input.labOnlyWriteDestination}`);
  if(input.sessionFallbackSafe!=='PASS')blocked.push(`SESSION_FALLBACK_SAFE_${input.sessionFallbackSafe}`);
  if(policy.invariantEvidenceRequiredForRelease&&!input.invariantEvidenceComplete)blocked.push('SAFETY_INVARIANT_EVIDENCE_INCOMPLETE');
  if(policy.drillMaterialEvidenceRequiredForRelease&&!input.drillMaterialEvidenceComplete)blocked.push('DRILL_MATERIAL_EVIDENCE_INCOMPLETE');
  if(policy.healthEndpointRequiredForRelease&&!input.healthConfigured)blocked.push('HEALTH_ENDPOINT_NOT_CONFIGURED');
  if(policy.spoolPathRequiredForRelease&&!input.spoolConfigured)blocked.push('SPOOL_PATH_NOT_CONFIGURED');
  if(input.healthConfigured&&healthCoverageRatio<policy.minimumHealthCoverageRatio)blocked.push('HEALTH_COVERAGE_INCOMPLETE');
  if(input.spoolConfigured&&spoolCoverageRatio<policy.minimumSpoolCoverageRatio)blocked.push('SPOOL_COVERAGE_INCOMPLETE');

  for(const drill of policy.requiredDrills){
    const evidence=input.drills[drill]||{status:'NOT_EXECUTED' as const};
    if(evidence.status==='FAIL')violations.push(`DRILL_${drill}_FAIL`);
    else if(evidence.status!=='PASS')blocked.push(`DRILL_${drill}_${evidence.status}`);
    else if(policy.drillEvidenceRequired&&(!evidence.at||!Array.isArray(evidence.evidence)||evidence.evidence.length===0))blocked.push(`DRILL_${drill}_EVIDENCE_MISSING`);
  }

  if(rssGrowthMbPerHour>policy.thresholds.maxRssGrowthMbPerHour)violations.push('RSS_GROWTH');
  if(heapGrowthMbPerHour>policy.thresholds.maxHeapGrowthMbPerHour)violations.push('HEAP_GROWTH');
  if(input.eventLoopP95Ms>policy.thresholds.maxEventLoopP95Ms)violations.push('EVENT_LOOP_P95');
  if(input.maxBacklogAgeSeconds>policy.thresholds.maxBacklogAgeSeconds)violations.push('BACKLOG_AGE');
  if(input.maxSpoolBytes>policy.thresholds.maxSpoolBytes)violations.push('SPOOL_BYTES');
  if(input.unexpectedDuplicateResponses>policy.thresholds.maxUnexpectedDuplicateResponses)violations.push('DUPLICATE_RESPONSE');
  if(input.lostDecisions>policy.thresholds.maxLostDecisions)violations.push('LOST_DECISION');
  if(input.contextLeaks>policy.thresholds.maxContextLeaks)violations.push('CONTEXT_LEAK');
  if(healthFailureRate>policy.thresholds.maxHealthFailureRate)violations.push('HEALTH_FAILURE_RATE');

  let status:SoakEvaluation['status']='PASS';
  if(violations.length)status='FAIL';
  else if(blocked.length)status='BLOCKED';
  else if(durationHours<policy.releaseMinimumHours)status='SMOKE_ONLY';
  if(input.samples===0)status='NOT_EXECUTED';
  return{status,violations,blocked,durationHours,rssGrowthMbPerHour,heapGrowthMbPerHour,healthFailureRate,healthCoverageRatio,spoolCoverageRatio};
}
