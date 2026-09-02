import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { runLabScenario } from '../src/modules/hipico-bot/hipico-lab-simulator.js';
import { labScenarioById } from '../src/modules/hipico-bot/hipico-lab-scenarios.js';
import { evaluateSoak, type EvidenceStatus, type SoakDrillEvidence, type SoakSummaryInput } from '../src/modules/hipico-bot/hipico-soak-policy.js';

const backendDir=path.basename(process.cwd())==='backend'?process.cwd():path.join(process.cwd(),'backend');
const root=path.resolve(backendDir,'..');
const policy=JSON.parse(fs.readFileSync(path.join(root,'products/hipico-control/soak-policy-v120.json'),'utf8'));
const arg=(name:string,fallback:string)=>process.argv.find((value)=>value.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const durationMinutes=Math.max(0.05,Number(arg('duration-minutes','1440')));
const sampleSeconds=Math.max(1,Number(arg('sample-seconds',String(policy.sampleSeconds||30))));
const healthUrl=arg('health-url','');
const spoolPath=arg('spool-path','');
const drillEvidencePath=arg('drill-evidence','');
const candidateSha=String(process.env.GITHUB_SHA||process.env.GIT_SHA||process.env.VERCEL_GIT_COMMIT_SHA||arg('sha','UNBOUND')).trim();
const sourceReadOnly=(arg('source-read-only','NOT_EXECUTED')) as EvidenceStatus;
const labOnlyWriteDestination=(arg('lab-only-write','NOT_EXECUTED')) as EvidenceStatus;
const artifactKey=/^[a-f0-9]{40}$/i.test(candidateSha)?candidateSha:'UNBOUND';
const outDir=path.join(root,'artifacts','qa','hipico-v120',artifactKey);fs.mkdirSync(outDir,{recursive:true});
const samplesFile=path.join(outDir,'samples.jsonl');
const scenario=labScenarioById('pre-close-load');if(!scenario)throw new Error('Falta scenario pre-close-load de #151.');
const eventLoop=monitorEventLoopDelay({resolution:20});eventLoop.enable();
const cpuStart=process.cpuUsage();const memoryStart=process.memoryUsage();const start=Date.now();
let healthChecks=0,healthFailures=0,spoolChecks=0,spoolAvailableChecks=0,decisions=0,lostDecisions=0,duplicateResponses=0,contextLeaks=0,maxBacklogAgeSeconds=0,maxSpoolBytes=0;

function loadDrills():Record<string,SoakDrillEvidence>{
  const fallback=Object.fromEntries(policy.requiredDrills.map((id:string)=>[
    id,
    {status:(arg(`drill-${id}`,'NOT_EXECUTED') as EvidenceStatus),at:null,evidence:[]}
  ]));
  if(!drillEvidencePath)return fallback;
  const full=path.resolve(drillEvidencePath);
  if(!fs.existsSync(full))throw new Error(`DRILL_EVIDENCE_NOT_FOUND:${full}`);
  const parsed=JSON.parse(fs.readFileSync(full,'utf8'));
  if(parsed.candidateSha!==candidateSha)throw new Error('DRILL_EVIDENCE_SHA_MISMATCH');
  const drills:Record<string,SoakDrillEvidence>={};
  for(const id of policy.requiredDrills){
    const row=parsed.drills?.[id]||{status:'NOT_EXECUTED'};
    drills[id]={status:row.status as EvidenceStatus,at:row.at||null,evidence:Array.isArray(row.evidence)?row.evidence:[]};
  }
  return drills;
}
const drills=loadDrills();

type FileStats={files:number;bytes:number;oldestMtimeMs:number|null};
function recursiveFileStats(target:string):FileStats{
  if(!target||!fs.existsSync(target))return{files:0,bytes:0,oldestMtimeMs:null};
  const stack=[target];let files=0,bytes=0,oldestMtimeMs:number|null=null;
  while(stack.length){
    const current=stack.pop()!;
    for(const entry of fs.readdirSync(current,{withFileTypes:true})){
      const full=path.join(current,entry.name);
      if(entry.isDirectory()){stack.push(full);continue;}
      if(!entry.isFile())continue;
      const stat=fs.statSync(full);
      files+=1;bytes+=stat.size;
      oldestMtimeMs=oldestMtimeMs===null?stat.mtimeMs:Math.min(oldestMtimeMs,stat.mtimeMs);
    }
  }
  return{files,bytes,oldestMtimeMs};
}
function spoolStats(target:string){
  spoolChecks+=1;
  if(!target||!fs.existsSync(target))return{available:false,files:0,bytes:0,activeFiles:0,oldestAgeSeconds:0};
  const queuedDir=path.join(target,'queued');
  const failedDir=path.join(target,'failed');
  const available=fs.existsSync(queuedDir)&&fs.existsSync(failedDir);
  if(available)spoolAvailableChecks+=1;
  const total=recursiveFileStats(target);
  const queued=recursiveFileStats(queuedDir);
  const failed=recursiveFileStats(failedDir);
  const oldestCandidates=[queued.oldestMtimeMs,failed.oldestMtimeMs].filter((value):value is number=>value!==null);
  const oldestActive=oldestCandidates.length?Math.min(...oldestCandidates):null;
  return{
    available,
    files:total.files,
    bytes:total.bytes,
    activeFiles:queued.files+failed.files,
    queuedFiles:queued.files,
    failedFiles:failed.files,
    oldestAgeSeconds:oldestActive===null?0:Math.max(0,(Date.now()-oldestActive)/1000)
  };
}
async function health(){
  if(!healthUrl)return null;healthChecks+=1;
  const started=performance.now();
  try{
    const response=await fetch(healthUrl,{headers:process.env.HIPICO_BRIDGE_TOKEN?{'x-hipico-bridge-token':process.env.HIPICO_BRIDGE_TOKEN}:{},signal:AbortSignal.timeout(5000)});
    if(!response.ok)healthFailures+=1;
    return{status:response.status,ok:response.ok,latencyMs:performance.now()-started};
  }catch(error){
    healthFailures+=1;
    return{status:0,ok:false,latencyMs:performance.now()-started,error:error instanceof Error?error.message:String(error)};
  }
}
function append(row:unknown){fs.appendFileSync(samplesFile,`${JSON.stringify(row)}\n`);}

const endAt=start+durationMinutes*60_000;
while(Date.now()<endAt){
  const run=runLabScenario(scenario);
  decisions+=run.transcript.length;
  lostDecisions+=run.summary.lostDecisions;
  duplicateResponses+=run.summary.duplicateResponses;
  contextLeaks+=run.summary.contextLeaks;
  const spool=spoolStats(spoolPath);
  maxBacklogAgeSeconds=Math.max(maxBacklogAgeSeconds,spool.oldestAgeSeconds);
  maxSpoolBytes=Math.max(maxSpoolBytes,spool.bytes);
  const mem=process.memoryUsage();const cpu=process.cpuUsage(cpuStart);const healthState=await health();
  append({at:new Date().toISOString(),elapsedMs:Date.now()-start,rssMb:mem.rss/1048576,heapUsedMb:mem.heapUsed/1048576,externalMb:mem.external/1048576,cpuUserMs:cpu.user/1000,cpuSystemMs:cpu.system/1000,eventLoopP95Ms:eventLoop.percentile(95)/1e6,spool,health:healthState,decisions,duplicateResponses,lostDecisions,contextLeaks});
  const remaining=endAt-Date.now();if(remaining<=0)break;
  await new Promise((resolve)=>setTimeout(resolve,Math.min(sampleSeconds*1000,remaining)));
}
const eventLoopP95Ms=eventLoop.percentile(95)/1e6;eventLoop.disable();
const memoryEnd=process.memoryUsage();const durationMs=Date.now()-start;
const rawLines=fs.existsSync(samplesFile)?fs.readFileSync(samplesFile,'utf8').trim().split('\n').filter(Boolean):[];
const summaryInput:SoakSummaryInput={
  candidateSha,durationMs,samples:rawLines.length,
  rssStartMb:memoryStart.rss/1048576,rssEndMb:memoryEnd.rss/1048576,
  heapStartMb:memoryStart.heapUsed/1048576,heapEndMb:memoryEnd.heapUsed/1048576,
  eventLoopP95Ms,maxBacklogAgeSeconds,maxSpoolBytes,
  unexpectedDuplicateResponses:duplicateResponses,lostDecisions,contextLeaks,
  healthConfigured:Boolean(healthUrl),spoolConfigured:Boolean(spoolPath),
  healthChecks,healthFailures,spoolChecks,spoolAvailableChecks,
  sourceReadOnly,labOnlyWriteDestination,drills
};
const evaluation=evaluateSoak(summaryInput,policy);
const final={
  schemaVersion:2,product:'control-hipico',candidateSha,
  startedAt:new Date(start).toISOString(),completedAt:new Date().toISOString(),
  durationRequestedMinutes:durationMinutes,sampleSeconds,
  healthUrlConfigured:Boolean(healthUrl),spoolPathConfigured:Boolean(spoolPath),
  drillEvidenceConfigured:Boolean(drillEvidencePath),
  replayScenario:scenario.id,decisions,summaryInput,evaluation,policyVersion:policy.version
};
fs.writeFileSync(path.join(outDir,'summary.json'),`${JSON.stringify(final,null,2)}\n`);
console.log(JSON.stringify(final,null,2));
if(evaluation.status==='FAIL')process.exitCode=1;else if(evaluation.status!=='PASS')process.exitCode=3;
