import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { runLabScenario } from '../src/modules/hipico-bot/hipico-lab-simulator.js';
import { labScenarioById } from '../src/modules/hipico-bot/hipico-lab-scenarios.js';
import { createSoakReleaseEvidence, evaluateSoak, type EvidenceStatus, type SoakDrillEvidence, type SoakSummaryInput } from '../src/modules/hipico-bot/hipico-soak-policy.js';

const backendDir=path.basename(process.cwd())==='backend'?process.cwd():path.join(process.cwd(),'backend');
const root=path.resolve(backendDir,'..');
const policy=JSON.parse(fs.readFileSync(path.join(root,'products/hipico-control/soak-policy-v120.json'),'utf8'));
const arg=(name:string,fallback:string)=>process.argv.find((value)=>value.startsWith(`--${name}=`))?.slice(name.length+3)||fallback;
const resolveUserPath=(value:string)=>value?(path.isAbsolute(value)?path.normalize(value):path.resolve(root,value)):'';
function positiveNumber(name:string,fallback:string,minimum:number){
  const raw=arg(name,fallback);const parsed=Number(raw);
  if(!Number.isFinite(parsed)||parsed<minimum)throw new Error(`${name.toUpperCase().replace(/-/g,'_')}_INVALID:${raw}`);
  return parsed;
}
const durationMinutes=positiveNumber('duration-minutes','1440',0.05);
const sampleSeconds=positiveNumber('sample-seconds',String(policy.sampleSeconds||30),1);
const healthUrl=arg('health-url','').trim();
const spoolPathArg=arg('spool-path','').trim();
const drillEvidenceArg=arg('drill-evidence','').trim();
const safetyEvidenceArg=arg('safety-evidence','').trim();
const physicalEvidenceArg=arg('physical-evidence','').trim();
const spoolPath=resolveUserPath(spoolPathArg);
const drillEvidencePath=resolveUserPath(drillEvidenceArg);
const safetyEvidencePath=resolveUserPath(safetyEvidenceArg);
const physicalEvidencePath=resolveUserPath(physicalEvidenceArg);
const operatorId=arg('operator-id','').trim();
const releaseRequested=durationMinutes>=Number(policy.releaseMinimumHours||24)*60;

function gitHead(){try{return execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim().toLowerCase();}catch{return 'UNBOUND';}}
const repoHead=gitHead();
const explicitSha=arg('sha','').trim();
const candidateSha=String(explicitSha||process.env.GITHUB_SHA||process.env.GIT_SHA||process.env.VERCEL_GIT_COMMIT_SHA||repoHead||'UNBOUND').trim().toLowerCase();
const artifactKey=/^[a-f0-9]{40}$/i.test(candidateSha)?candidateSha:'UNBOUND';
const requestedAttemptId=arg('attempt-id','').trim();
const generatedAttemptId=`${new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,17)}-${process.pid}`;
const attemptId=requestedAttemptId||generatedAttemptId;
if(!/^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/.test(attemptId))throw new Error('ATTEMPT_ID_INVALID');
const candidateDir=path.join(root,'artifacts','qa','hipico-v120',artifactKey);
const outDir=path.join(candidateDir,attemptId);
const samplesFile=path.join(outDir,'samples.jsonl');
const summaryFile=path.join(outDir,'summary.json');
const checksumsFile=path.join(outDir,'SHA256SUMS.txt');
const scenario=labScenarioById('pre-close-load');if(!scenario)throw new Error('Falta scenario pre-close-load de #151.');

type MaterialFile={label:string;reference:string;full:string;sha256:string};
type JsonInput={full:string;parsed:any;sha256:string};
type SafetyInvariantKey='sourceReadOnly'|'labOnlyWriteDestination'|'sessionFallbackSafe';
type SafetyInvariantEvidence={status:EvidenceStatus;at:string|null;evidence:string[]};
const safetyInvariantKeys:SafetyInvariantKey[]=['sourceReadOnly','labOnlyWriteDestination','sessionFallbackSafe'];

function sha256Bytes(bytes:Buffer|string){return crypto.createHash('sha256').update(bytes).digest('hex');}
function sha256File(file:string){return sha256Bytes(fs.readFileSync(file));}
function isRelativeEvidencePath(value:unknown):value is string{
  if(typeof value!=='string'||!value.trim()||value.includes('\0')||path.isAbsolute(value))return false;
  return !value.split(/[\\/]+/).includes('..');
}
function pathInside(base:string,target:string){const relative=path.relative(base,target);return relative!==''&&relative!=='..'&&!relative.startsWith(`..${path.sep}`)&&!path.isAbsolute(relative);}
function requireRegularInput(filePath:string,label:string){
  const full=path.resolve(filePath);
  if(!fs.existsSync(full))throw new Error(`${label}_NOT_FOUND:${full}`);
  const stat=fs.lstatSync(full);
  if(stat.isSymbolicLink()||!stat.isFile())throw new Error(`${label}_NOT_REGULAR_FILE:${full}`);
  return fs.realpathSync(full);
}
function readJsonInput(filePath:string,label:string):JsonInput{
  const full=requireRegularInput(filePath,label);const bytes=fs.readFileSync(full);
  try{return{full,parsed:JSON.parse(bytes.toString('utf8')),sha256:sha256Bytes(bytes)};}catch(error){throw new Error(`${label}_INVALID_JSON:${error instanceof Error?error.message:String(error)}`);}
}
function assertUnchanged(input:JsonInput,label:string){if(sha256File(input.full)!==input.sha256)throw new Error(`${label}_MANIFEST_CHANGED_DURING_RUN`);}
function resolveMaterial(manifestFull:string,reference:string,label:string,expectedSha256=''):MaterialFile{
  if(!isRelativeEvidencePath(reference))throw new Error(`${label}_INVALID_PATH:${String(reference)}`);
  const base=fs.realpathSync(path.dirname(manifestFull));
  const candidate=path.resolve(base,reference);
  if(!pathInside(base,candidate)||!fs.existsSync(candidate))throw new Error(`${label}_NOT_FOUND:${reference}`);
  const stat=fs.lstatSync(candidate);
  if(stat.isSymbolicLink()||!stat.isFile())throw new Error(`${label}_NOT_REGULAR_FILE:${reference}`);
  const real=fs.realpathSync(candidate);
  if(!pathInside(base,real))throw new Error(`${label}_PATH_ESCAPE:${reference}`);
  const sha256=sha256File(real);
  if(expectedSha256&&(!/^[a-f0-9]{64}$/i.test(expectedSha256)||sha256!==expectedSha256.toLowerCase()))throw new Error(`${label}_SHA256_MISMATCH:${reference}`);
  return{label,reference,full:real,sha256};
}
function evidenceReferences(value:unknown):Array<{path:string;sha256:string}>{
  if(!Array.isArray(value))return[];
  const rows:Array<{path:string;sha256:string}>=[];
  for(const item of value){
    if(typeof item==='string'&&item.trim())rows.push({path:item.trim(),sha256:''});
    else if(item&&typeof item==='object'&&typeof (item as any).path==='string'&&(item as any).path.trim())rows.push({path:(item as any).path.trim(),sha256:typeof (item as any).sha256==='string'?(item as any).sha256.trim().toLowerCase():''});
  }
  return rows;
}
function timestampWithinRun(value:string|null,startMs:number,endMs:number){
  if(!value)return false;const at=Date.parse(value);if(!Number.isFinite(at))return false;
  return at>=startMs-300_000&&at<=endMs+300_000;
}
function timestampNearRunEnd(value:string|null,startMs:number,endMs:number){
  if(!value)return false;const at=Date.parse(value);if(!Number.isFinite(at))return false;
  const finalWindowStart=Math.max(startMs,endMs-15*60_000);
  return at>=finalWindowStart&&at<=endMs+300_000;
}
function copyInput(input:JsonInput,name:string,label:string){
  assertUnchanged(input,label);const dest=path.join(outDir,name);
  fs.copyFileSync(input.full,dest,fs.constants.COPYFILE_EXCL);
  const copiedSha=sha256File(dest);if(copiedSha!==input.sha256)throw new Error(`${label}_COPY_SHA256_MISMATCH`);
  return dest;
}
function copyMaterials(rows:MaterialFile[],folder:string){
  const targetDir=path.join(outDir,folder);fs.mkdirSync(targetDir,{recursive:true});
  const copied:Array<{label:string;reference:string;artifact:string;sha256:string}>=[];
  rows.forEach((row,index)=>{
    const current=sha256File(row.full);if(current!==row.sha256)throw new Error(`EVIDENCE_CHANGED_DURING_RUN:${row.label}:${row.reference}`);
    const safeName=path.basename(row.reference).replace(/[^a-z0-9._-]+/gi,'_')||'evidence.bin';
    const artifact=path.join(folder,`${String(index+1).padStart(3,'0')}-${safeName}`);
    const dest=path.join(outDir,artifact);fs.copyFileSync(row.full,dest,fs.constants.COPYFILE_EXCL);
    const copiedSha=sha256File(dest);if(copiedSha!==row.sha256)throw new Error(`EVIDENCE_COPY_SHA256_MISMATCH:${artifact}`);
    copied.push({label:row.label,reference:row.reference,artifact,sha256:copiedSha});
  });
  return copied;
}
function preflightEvidenceManifest(filePath:string,label:string){
  const input=readJsonInput(filePath,label);
  if(String(input.parsed?.candidateSha||'').toLowerCase()!==candidateSha)throw new Error(`${label}_SHA_MISMATCH`);
  return input;
}
function assertSpoolTopology(target:string){
  const full=path.resolve(target);
  if(!fs.existsSync(full))throw new Error('SPOOL_PATH_NOT_FOUND');
  const rootStat=fs.lstatSync(full);if(rootStat.isSymbolicLink()||!rootStat.isDirectory())throw new Error('SPOOL_PATH_NOT_DIRECTORY');
  for(const name of ['queued','failed']){const child=path.join(full,name);if(!fs.existsSync(child))throw new Error(`SPOOL_${name.toUpperCase()}_MISSING`);const stat=fs.lstatSync(child);if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error(`SPOOL_${name.toUpperCase()}_INVALID`);}
}
async function assertHealthReachable(){
  try{
    const response=await fetch(healthUrl,{headers:process.env.HIPICO_BRIDGE_TOKEN?{'x-hipico-bridge-token':process.env.HIPICO_BRIDGE_TOKEN}:{},signal:AbortSignal.timeout(5000),cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP_${response.status}`);
  }catch(error){throw new Error(`HEALTH_PREFLIGHT_FAILED:${error instanceof Error?error.message:String(error)}`);}
}

function releasePreflight(){
  if(!releaseRequested)return;
  if(!/^[a-f0-9]{40}$/i.test(candidateSha))throw new Error('CANDIDATE_SHA_UNBOUND');
  if(/^[a-f0-9]{40}$/i.test(repoHead)&&candidateSha!==repoHead)throw new Error(`CANDIDATE_SHA_HEAD_MISMATCH:${candidateSha}:${repoHead}`);
  if(!operatorId)throw new Error('OPERATOR_ID_REQUIRED_FOR_RELEASE');
  if(!healthUrl)throw new Error('HEALTH_URL_REQUIRED_FOR_RELEASE');
  try{const parsed=new URL(healthUrl);if(!['http:','https:'].includes(parsed.protocol))throw new Error('protocol');}catch{throw new Error('HEALTH_URL_INVALID');}
  if(!spoolPathArg)throw new Error('SPOOL_PATH_REQUIRED_FOR_RELEASE');
  if(!physicalEvidenceArg)throw new Error('PHYSICAL_EVIDENCE_REQUIRED_FOR_RELEASE');
  if(!safetyEvidenceArg)throw new Error('SAFETY_EVIDENCE_REQUIRED_FOR_RELEASE');
  if(!drillEvidenceArg)throw new Error('DRILL_EVIDENCE_REQUIRED_FOR_RELEASE');
  assertSpoolTopology(spoolPath);
  preflightEvidenceManifest(safetyEvidencePath,'SAFETY_EVIDENCE');
  preflightEvidenceManifest(drillEvidencePath,'DRILL_EVIDENCE');
}
releasePreflight();
if(releaseRequested)await assertHealthReachable();

function loadPhysicalEvidence(){
  if(!physicalEvidencePath)return{complete:false,input:null as JsonInput|null,material:[] as MaterialFile[]};
  const input=readJsonInput(physicalEvidencePath,'PHYSICAL_EVIDENCE');const parsed=input.parsed;
  if(String(parsed.candidateSha||'').toLowerCase()!==candidateSha)throw new Error('PHYSICAL_EVIDENCE_SHA_MISMATCH');
  if(parsed.schemaVersion!==2||parsed.product!=='control-hipico')throw new Error('PHYSICAL_EVIDENCE_SCHEMA_INVALID');
  if(parsed.summary?.releasePhysicalGate!=='PASS'||parsed.summary?.materialEvidenceComplete!==true||!parsed.completedAt)throw new Error('PHYSICAL_QA_119_NOT_PASS');
  const physicalCompletedAt=Date.parse(parsed.completedAt);
  if(!Number.isFinite(physicalCompletedAt)||physicalCompletedAt>Date.now()+300_000)throw new Error('PHYSICAL_EVIDENCE_COMPLETED_AT_INVALID');
  if(!Array.isArray(parsed.evidenceFiles)||parsed.evidenceFiles.length===0)throw new Error('PHYSICAL_EVIDENCE_FILES_MISSING');
  const material:MaterialFile[]=[];
  for(const [index,row] of parsed.evidenceFiles.entries()){
    if(!row||typeof row.path!=='string'||typeof row.sha256!=='string')throw new Error(`PHYSICAL_EVIDENCE_ENTRY_INVALID:${index}`);
    material.push(resolveMaterial(input.full,row.path,`physical/${row.invariant||row.environment||index}`,row.sha256));
  }
  return{complete:true,input,material};
}
const physical=loadPhysicalEvidence();

fs.mkdirSync(candidateDir,{recursive:true});
try{fs.mkdirSync(outDir,{recursive:false});}catch(error:any){if(error?.code==='EEXIST')throw new Error(`SOAK_ATTEMPT_ALREADY_EXISTS:${attemptId}`);throw error;}
fs.writeFileSync(samplesFile,'',{flag:'wx'});

const eventLoop=monitorEventLoopDelay({resolution:20});eventLoop.enable();
const cpuStart=process.cpuUsage();const memoryStart=process.memoryUsage();const start=Date.now();
let healthChecks=0,healthFailures=0,spoolChecks=0,spoolAvailableChecks=0,decisions=0,lostDecisions=0,duplicateResponses=0,contextLeaks=0,maxBacklogAgeSeconds=0,maxSpoolBytes=0;

type FileStats={files:number;bytes:number;oldestMtimeMs:number|null};
function recursiveFileStats(target:string):FileStats{
  if(!target||!fs.existsSync(target))return{files:0,bytes:0,oldestMtimeMs:null};
  const stack=[target];let files=0,bytes=0,oldestMtimeMs:null|number=null;
  while(stack.length){
    const current=stack.pop()!;
    for(const entry of fs.readdirSync(current,{withFileTypes:true})){
      const full=path.join(current,entry.name);
      if(entry.isDirectory()){stack.push(full);continue;}
      if(!entry.isFile())continue;
      const stat=fs.statSync(full);files+=1;bytes+=stat.size;oldestMtimeMs=oldestMtimeMs===null?stat.mtimeMs:Math.min(oldestMtimeMs,stat.mtimeMs);
    }
  }
  return{files,bytes,oldestMtimeMs};
}
function spoolStats(target:string){
  spoolChecks+=1;
  if(!target||!fs.existsSync(target))return{available:false,files:0,bytes:0,activeFiles:0,queuedFiles:0,failedFiles:0,oldestAgeSeconds:0};
  const queuedDir=path.join(target,'queued');const failedDir=path.join(target,'failed');
  const available=fs.existsSync(queuedDir)&&fs.existsSync(failedDir)&&!fs.lstatSync(queuedDir).isSymbolicLink()&&!fs.lstatSync(failedDir).isSymbolicLink()&&fs.lstatSync(queuedDir).isDirectory()&&fs.lstatSync(failedDir).isDirectory();
  if(available)spoolAvailableChecks+=1;
  const total=recursiveFileStats(target);const queued=recursiveFileStats(queuedDir);const failed=recursiveFileStats(failedDir);
  const oldestCandidates=[queued.oldestMtimeMs,failed.oldestMtimeMs].filter((value):value is number=>value!==null);const oldestActive=oldestCandidates.length?Math.min(...oldestCandidates):null;
  return{available,files:total.files,bytes:total.bytes,activeFiles:queued.files+failed.files,queuedFiles:queued.files,failedFiles:failed.files,oldestAgeSeconds:oldestActive===null?0:Math.max(0,(Date.now()-oldestActive)/1000)};
}
async function health(){
  if(!healthUrl)return null;healthChecks+=1;const started=performance.now();
  try{
    const response=await fetch(healthUrl,{headers:process.env.HIPICO_BRIDGE_TOKEN?{'x-hipico-bridge-token':process.env.HIPICO_BRIDGE_TOKEN}:{},signal:AbortSignal.timeout(5000),cache:'no-store'});
    if(!response.ok)healthFailures+=1;
    return{status:response.status,ok:response.ok,latencyMs:performance.now()-started};
  }catch(error){healthFailures+=1;return{status:0,ok:false,latencyMs:performance.now()-started,error:error instanceof Error?error.message:String(error)};}
}
function append(row:unknown){fs.appendFileSync(samplesFile,`${JSON.stringify(row)}\n`);}

const endAt=start+durationMinutes*60_000;
while(Date.now()<endAt){
  const run=runLabScenario(scenario);decisions+=run.transcript.length;lostDecisions+=run.summary.lostDecisions;duplicateResponses+=run.summary.duplicateResponses;contextLeaks+=run.summary.contextLeaks;
  const spool=spoolStats(spoolPath);maxBacklogAgeSeconds=Math.max(maxBacklogAgeSeconds,spool.oldestAgeSeconds);maxSpoolBytes=Math.max(maxSpoolBytes,spool.bytes);
  const mem=process.memoryUsage();const cpu=process.cpuUsage(cpuStart);const healthState=await health();
  append({at:new Date().toISOString(),elapsedMs:Date.now()-start,rssMb:mem.rss/1048576,heapUsedMb:mem.heapUsed/1048576,externalMb:mem.external/1048576,cpuUserMs:cpu.user/1000,cpuSystemMs:cpu.system/1000,eventLoopP95Ms:eventLoop.percentile(95)/1e6,spool,health:healthState,decisions,duplicateResponses,lostDecisions,contextLeaks});
  const remaining=endAt-Date.now();if(remaining<=0)break;await new Promise((resolve)=>setTimeout(resolve,Math.min(sampleSeconds*1000,remaining)));
}
const runEndedAt=Date.now();const eventLoopP95Ms=eventLoop.percentile(95)/1e6;eventLoop.disable();
const memoryEnd=process.memoryUsage();const durationMs=runEndedAt-start;

function loadRunSafetyEvidence(){
  const fallback:Record<SafetyInvariantKey,SafetyInvariantEvidence>={
    sourceReadOnly:{status:arg('source-read-only','NOT_EXECUTED') as EvidenceStatus,at:null,evidence:[]},
    labOnlyWriteDestination:{status:arg('lab-only-write','NOT_EXECUTED') as EvidenceStatus,at:null,evidence:[]},
    sessionFallbackSafe:{status:arg('session-fallback-safe','NOT_EXECUTED') as EvidenceStatus,at:null,evidence:[]}
  };
  if(!safetyEvidencePath)return{invariants:fallback,complete:false,input:null as JsonInput|null,material:[] as MaterialFile[]};
  const input=readJsonInput(safetyEvidencePath,'SAFETY_EVIDENCE');const parsed=input.parsed;
  if(String(parsed.candidateSha||'').toLowerCase()!==candidateSha)throw new Error('SAFETY_EVIDENCE_SHA_MISMATCH');
  const invariants={...fallback};const material:MaterialFile[]=[];
  for(const key of safetyInvariantKeys){
    const row=parsed.invariants?.[key]||{status:'NOT_EXECUTED'};const refs=evidenceReferences(row.evidence);
    invariants[key]={status:row.status as EvidenceStatus,at:typeof row.at==='string'&&row.at.trim()?row.at:null,evidence:refs.map((entry)=>entry.path)};
    refs.forEach((entry)=>material.push(resolveMaterial(input.full,entry.path,`safety/${key}`,entry.sha256)));
  }
  const complete=safetyInvariantKeys.every((key)=>{const row=invariants[key];return row.status==='PASS'&&timestampNearRunEnd(row.at,start,runEndedAt)&&row.evidence.length>0;});
  return{invariants,complete,input,material};
}
function loadDrills(){
  const fallback=Object.fromEntries(policy.requiredDrills.map((id:string)=>[id,{status:arg(`drill-${id}`,'NOT_EXECUTED') as EvidenceStatus,at:null,evidence:[]}])) as Record<string,SoakDrillEvidence>;
  if(!drillEvidencePath)return{drills:fallback,complete:false,input:null as JsonInput|null,material:[] as MaterialFile[]};
  const input=readJsonInput(drillEvidencePath,'DRILL_EVIDENCE');const parsed=input.parsed;
  if(String(parsed.candidateSha||'').toLowerCase()!==candidateSha)throw new Error('DRILL_EVIDENCE_SHA_MISMATCH');
  const drills:Record<string,SoakDrillEvidence>={};const material:MaterialFile[]=[];
  for(const id of policy.requiredDrills){
    const row=parsed.drills?.[id]||{status:'NOT_EXECUTED'};const refs=evidenceReferences(row.evidence);
    drills[id]={status:row.status as EvidenceStatus,at:typeof row.at==='string'&&row.at.trim()?row.at:null,evidence:refs.map((entry)=>entry.path)};
    refs.forEach((entry)=>material.push(resolveMaterial(input.full,entry.path,`drill/${id}`,entry.sha256)));
  }
  const complete=policy.requiredDrills.every((id:string)=>{const row=drills[id];return row?.status==='PASS'&&timestampWithinRun(row.at||null,start,runEndedAt)&&Array.isArray(row.evidence)&&row.evidence.length>0;});
  return{drills,complete,input,material};
}
const safety=loadRunSafetyEvidence();const drillBundle=loadDrills();
const sourceReadOnly=safety.invariants.sourceReadOnly.status;const labOnlyWriteDestination=safety.invariants.labOnlyWriteDestination.status;const sessionFallbackSafe=safety.invariants.sessionFallbackSafe.status;
const rawLines=fs.readFileSync(samplesFile,'utf8').trim().split('\n').filter(Boolean);
const summaryInput:SoakSummaryInput={
  candidateSha,durationMs,samples:rawLines.length,rssStartMb:memoryStart.rss/1048576,rssEndMb:memoryEnd.rss/1048576,heapStartMb:memoryStart.heapUsed/1048576,heapEndMb:memoryEnd.heapUsed/1048576,
  eventLoopP95Ms,maxBacklogAgeSeconds,maxSpoolBytes,unexpectedDuplicateResponses:duplicateResponses,lostDecisions,contextLeaks,
  healthConfigured:Boolean(healthUrl),spoolConfigured:Boolean(spoolPathArg),healthChecks,healthFailures,spoolChecks,spoolAvailableChecks,operatorPresent:Boolean(operatorId),
  physicalEvidenceComplete:physical.complete,sourceReadOnly,labOnlyWriteDestination,sessionFallbackSafe,invariantEvidenceComplete:safety.complete,drillMaterialEvidenceComplete:drillBundle.complete,drills:drillBundle.drills
};
const evaluation=evaluateSoak(summaryInput,policy);

if(physical.input)assertUnchanged(physical.input,'PHYSICAL_EVIDENCE');
for(const row of physical.material)if(sha256File(row.full)!==row.sha256)throw new Error(`PHYSICAL_EVIDENCE_CHANGED_DURING_RUN:${row.reference}`);
const physicalEvidenceArtifact=physical.input?copyInput(physical.input,'physical-evidence-v119.json','PHYSICAL_EVIDENCE'):null;
const safetyEvidenceArtifact=safety.input?copyInput(safety.input,'safety-evidence-input.json','SAFETY_EVIDENCE'):null;
const drillEvidenceArtifact=drillBundle.input?copyInput(drillBundle.input,'drill-evidence-input.json','DRILL_EVIDENCE'):null;
const safetyMaterial=copyMaterials(safety.material,'safety-material');
const drillMaterial=copyMaterials(drillBundle.material,'drill-material');
const evidenceIntegrity={
  samplesSha256:sha256File(samplesFile),
  physicalEvidenceSha256:physicalEvidenceArtifact?sha256File(physicalEvidenceArtifact):null,
  safetyEvidenceSha256:safetyEvidenceArtifact?sha256File(safetyEvidenceArtifact):null,
  drillEvidenceSha256:drillEvidenceArtifact?sha256File(drillEvidenceArtifact):null,
  physicalVerifiedFiles:physical.material.length,safetyMaterial,drillMaterial
};
const startedAt=new Date(start).toISOString();
const completedAt=new Date(runEndedAt).toISOString();
const final={
  schemaVersion:5,product:'control-hipico',candidateSha,attemptId,repoHead:/^[a-f0-9]{40}$/i.test(repoHead)?repoHead:null,operatorId:operatorId||null,
  startedAt,completedAt,durationRequestedMinutes:durationMinutes,sampleSeconds,
  healthUrlConfigured:Boolean(healthUrl),spoolPathConfigured:Boolean(spoolPathArg),physicalEvidenceConfigured:Boolean(physicalEvidenceArg),physicalEvidenceVerified:physical.complete,
  drillEvidenceConfigured:Boolean(drillEvidenceArg),drillEvidenceCopied:Boolean(drillEvidenceArtifact),safetyEvidenceConfigured:Boolean(safetyEvidenceArg),safetyEvidenceCopied:Boolean(safetyEvidenceArtifact),
  replayScenario:scenario.id,decisions,summaryInput,evaluation,evidenceIntegrity,policyVersion:policy.version
};
fs.writeFileSync(summaryFile,`${JSON.stringify(final,null,2)}\n`,{flag:'wx'});
const releaseEvidence=createSoakReleaseEvidence({
  candidateSha,attemptId,operatorId:operatorId||null,startedAt,completedAt,durationRequestedMinutes:durationMinutes,
  policyVersion:policy.version,summaryInput,evaluation,evidenceIntegrity
},policy);
const releaseEvidenceFile=path.join(outDir,'soak-evidence.json');
if(releaseEvidence)fs.writeFileSync(releaseEvidenceFile,`${JSON.stringify(releaseEvidence,null,2)}\n`,{flag:'wx'});
const checksumRows=[
  `${evidenceIntegrity.samplesSha256}  samples.jsonl`,
  evidenceIntegrity.physicalEvidenceSha256?`${evidenceIntegrity.physicalEvidenceSha256}  physical-evidence-v119.json`:null,
  evidenceIntegrity.safetyEvidenceSha256?`${evidenceIntegrity.safetyEvidenceSha256}  safety-evidence-input.json`:null,
  evidenceIntegrity.drillEvidenceSha256?`${evidenceIntegrity.drillEvidenceSha256}  drill-evidence-input.json`:null,
  releaseEvidence?`${sha256File(releaseEvidenceFile)}  soak-evidence.json`:null,
  ...safetyMaterial.map((row)=>`${row.sha256}  ${row.artifact}`),...drillMaterial.map((row)=>`${row.sha256}  ${row.artifact}`)
].filter((row):row is string=>Boolean(row));
fs.writeFileSync(checksumsFile,`${checksumRows.join('\n')}\n`,{flag:'wx'});
console.log(JSON.stringify(final,null,2));
if(evaluation.status==='FAIL')process.exitCode=1;else if(evaluation.status!=='PASS')process.exitCode=3;
