// Exact-SHA release validation must distrust self-reported soak numbers.
// Does not access operator credentials, data files, database or WhatsApp.
const FLOAT_FIELDS=[
  'durationMs','rssStartMb','rssEndMb','heapStartMb','heapEndMb',
  'eventLoopP95Ms','maxBacklogAgeSeconds','maxSpoolBytes',
  'unexpectedDuplicateResponses','lostDecisions','contextLeaks',
  'samples','healthChecks','healthFailures','spoolChecks','spoolAvailableChecks'
];
const COUNT_FIELDS=[
  'samples','healthChecks','healthFailures','spoolChecks','spoolAvailableChecks',
  'unexpectedDuplicateResponses','lostDecisions','contextLeaks','maxSpoolBytes'
];
const DERIVED_FIELDS=[
  'durationHours','rssGrowthMbPerHour','heapGrowthMbPerHour',
  'healthFailureRate','healthCoverageRatio','spoolCoverageRatio'
];
const close=(actual,expected)=>typeof actual==='number'
  && Number.isFinite(actual) && Math.abs(actual-expected)<=1e-9*Math.max(1,Math.abs(expected));

export function validSoakMetricEvidence(data,minimumHours=24,sampleSeconds=30){
  const s=data?.summaryInput, e=data?.evaluation;
  if(!s||!e||!Number.isFinite(minimumHours)||minimumHours<=0||
     !Number.isFinite(sampleSeconds)||sampleSeconds<1)return false;
  if(FLOAT_FIELDS.some(key=>typeof s[key]!=='number'||!Number.isFinite(s[key])||s[key]<0))return false;
  if(COUNT_FIELDS.some(key=>!Number.isSafeInteger(s[key])))return false;
  // A reported 24h wall clock with a handful of samples cannot prove soak.
  // Require at least 90% of the policy's configured sample cadence.
  if(s.samples<Math.floor(s.durationMs/(sampleSeconds*1000)*0.9))return false;
  if(s.samples===0 || s.healthChecks>s.samples || s.spoolChecks>s.samples ||
     s.healthFailures>s.healthChecks || s.spoolAvailableChecks>s.spoolChecks)return false;
  const start=Date.parse(data.startedAt),end=Date.parse(data.completedAt);
  if(!Number.isFinite(start)||!Number.isFinite(end)||
     end-start<minimumHours*3600000||
     Math.abs((end-start)-s.durationMs)>60000)return false;
  const hours=s.durationMs/3600000,divisor=Math.max(hours,1/3600);
  const derived={
    durationHours:hours,
    rssGrowthMbPerHour:(s.rssEndMb-s.rssStartMb)/divisor,
    heapGrowthMbPerHour:(s.heapEndMb-s.heapStartMb)/divisor,
    healthFailureRate:s.healthChecks?s.healthFailures/s.healthChecks:0,
    healthCoverageRatio:s.samples?s.healthChecks/s.samples:0,
    spoolCoverageRatio:s.spoolChecks?s.spoolAvailableChecks/s.spoolChecks:0
  };
  return DERIVED_FIELDS.every(key=>close(e[key],derived[key]));
}
