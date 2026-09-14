import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const policy=JSON.parse(fs.readFileSync('products/erp/performance-policy-v157.json','utf8'));
const sha=String(process.env.CANDIDATE_SHA||process.argv.find((arg)=>arg.startsWith('--sha='))?.split('=')[1]||'').trim();
const command=process.argv[2]||'status';
if(!/^[a-f0-9]{40}$/i.test(sha))throw new Error('CANDIDATE_SHA_REQUIRED_40_HEX');
const root=path.resolve('artifacts/qa/erp-performance-v157',sha);
const file=path.join(root,'measurements.json');

const processTemplate=()=>Object.fromEntries(policy.heavyProcesses.required.map((name)=>[
  name,
  Object.fromEntries(policy.heavyProcesses.requiredOutcomes.map((outcome)=>[outcome,'NOT_EXECUTED']))
]));
const template={
  schemaVersion:2,
  issue:157,
  candidateSha:sha,
  measuredAt:null,
  environment:{runtime:'NOT_EXECUTED',device:'NOT_EXECUTED',network:'NOT_EXECUTED',sanitizedFixtures:false},
  workload:{
    expectedPeakConcurrentUsers:null,
    profileCoverage:Object.fromEntries(policy.workloadModel.profiles.map((p)=>[p,'NOT_EXECUTED'])),
    loadFactors:Object.fromEntries(policy.workloadModel.requiredLoadFactors.map((factor)=>[`${factor}x`,'NOT_EXECUTED']))
  },
  profiles:Object.fromEntries(policy.profiles.map((p)=>[p,'NOT_EXECUTED'])),
  heavyProcesses:processTemplate(),
  degradation:Object.fromEntries(policy.degradationScenarios.map((scenario)=>[scenario,'NOT_EXECUTED'])),
  metrics:{},
  profilingEvidence:[],
  notes:''
};
if(command==='init'){
  fs.mkdirSync(root,{recursive:true});
  if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify(template,null,2)+'\n');
  console.log(file);
  process.exit(0);
}
if(!fs.existsSync(file))throw new Error('PERFORMANCE_EVIDENCE_NOT_FOUND');
const evidence=JSON.parse(fs.readFileSync(file,'utf8'));
if(evidence.schemaVersion!==2)throw new Error('PERFORMANCE_EVIDENCE_SCHEMA_V2_REQUIRED_REINITIALIZE');
if(evidence.candidateSha!==sha)throw new Error('PERFORMANCE_SHA_MISMATCH');

const required={
  'frontend.startupP95Ms':policy.frontend.startupP95Ms,
  'frontend.routeSwitchP95Ms':policy.frontend.routeSwitchP95Ms,
  'frontend.saveP95Ms':policy.frontend.saveP95Ms,
  'frontend.import1000RowsP95Ms':policy.frontend.import1000RowsP95Ms,
  'frontend.table100P95Ms':policy.frontend.tableRender['100RowsP95Ms'],
  'frontend.table1000P95Ms':policy.frontend.tableRender['1000RowsP95Ms'],
  'frontend.table10000P95Ms':policy.frontend.tableRender['10000RowsP95Ms'],
  'frontend.longSessionHeapGrowthPct':policy.frontend.longSessionHeapGrowthPctMax,
  'frontend.longTaskCountPerMinute':policy.frontend.longTaskCountPerMinuteMax,
  'backend.apiP50Ms':policy.backend.apiP50Ms,
  'backend.apiP95Ms':policy.backend.apiP95Ms,
  'backend.apiP99Ms':policy.backend.apiP99Ms,
  'backend.errorRatePct':policy.backend.errorRatePctMax,
  'backend.dbQueryP95Ms':policy.backend.dbQueryP95Ms,
  'backend.poolSaturationPct':policy.backend.poolSaturationPctMax,
  'backend.slowQueryCount':policy.backend.slowQueryCountMax,
  'backend.nPlusOneFindingCount':policy.backend.nPlusOneFindingCountMax,
  'backend.deadlockCount':policy.backend.deadlockCountMax,
  'backend.crossTenantLeakCount':policy.backend.crossTenantLeakCountMax
};
const metricNumber=(raw)=>typeof raw === 'number' && Number.isFinite(raw)?raw:null;
const checks=[];
for(const [key,budget] of Object.entries(required)){
  const value=metricNumber(evidence.metrics?.[key]);
  checks.push({key,value,budget,pass:value!==null&&value<=budget,direction:'max'});
}
const throughput=metricNumber(evidence.metrics?.['backend.throughputRps']);
checks.push({key:'backend.throughputRps',value:throughput,budget:policy.backend.throughputRpsMin,pass:throughput!==null&&throughput>=policy.backend.throughputRpsMin,direction:'min'});

const profilesComplete=policy.profiles.every((p)=>evidence.profiles?.[p]==='MEASURED');
const workloadProfilesComplete=policy.workloadModel.profiles.every((p)=>evidence.workload?.profileCoverage?.[p]==='MEASURED');
const expectedPeak=evidence.workload?.expectedPeakConcurrentUsers;
const expectedPeakDeclared=Number.isInteger(expectedPeak)&&expectedPeak>0&&expectedPeak<=250;
const loadFactorsComplete=policy.workloadModel.requiredLoadFactors.every((factor)=>evidence.workload?.loadFactors?.[`${factor}x`]==='MEASURED');
const heavyProcessesComplete=policy.heavyProcesses.required.every((name)=>
  policy.heavyProcesses.requiredOutcomes.every((outcome)=>evidence.heavyProcesses?.[name]?.[outcome]==='MEASURED')
);
const degradationComplete=policy.degradationScenarios.every((scenario)=>evidence.degradation?.[scenario]==='MEASURED');
const sanitizedFixtures=evidence.environment?.sanitizedFixtures===true;
const profilingEvidenceComplete=Array.isArray(evidence.profilingEvidence)&&evidence.profilingEvidence.length>0;

let verdict='PASS';
if(checks.some((c)=>c.value!==null&&!c.pass))verdict='FAIL';
else if(!profilesComplete||!workloadProfilesComplete||!expectedPeakDeclared||!loadFactorsComplete||!heavyProcessesComplete||!degradationComplete||!sanitizedFixtures||!profilingEvidenceComplete||checks.some((c)=>c.value===null))verdict='NOT_EXECUTED';
if(verdict==='PASS'&&policy.targetsAreProvisionalUntilMeasured)verdict='MEASURED_PROVISIONAL';

const completion={
  profilesComplete,
  workloadProfilesComplete,
  expectedPeakDeclared,
  loadFactorsComplete,
  heavyProcessesComplete,
  degradationComplete,
  sanitizedFixtures,
  profilingEvidenceComplete
};
const summary={
  issue:157,
  schemaVersion:2,
  candidateSha:sha,
  verdict,
  completion,
  checks,
  policyVersion:policy.version,
  measurementHash:crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex'),
  checkedAt:new Date().toISOString()
};
fs.mkdirSync(root,{recursive:true});
fs.writeFileSync(path.join(root,'summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));
if(command==='check'&&!['PASS','MEASURED_PROVISIONAL'].includes(verdict))process.exitCode=2;
