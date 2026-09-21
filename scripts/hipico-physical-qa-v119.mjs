#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root=process.cwd();
const catalog=JSON.parse(fs.readFileSync(path.join(root,'products/hipico-control/physical-qa-v119.json'),'utf8'));
const args=process.argv.slice(2);
const command=args[0]||'status';
const value=(name)=>args.find((arg)=>arg.startsWith(`--${name}=`))?.slice(name.length+3)??null;
const fileArg=value('file');
const invariantKeys=['sourceReadOnly','labOnlyWriteDestination','sessionFallbackSafe'];

function gitSha(){
  const env=String(process.env.GITHUB_SHA||process.env.VERCEL_GIT_COMMIT_SHA||process.env.GIT_SHA||'').trim();
  if(/^[a-f0-9]{40}$/i.test(env))return env.toLowerCase();
  try{return execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim().toLowerCase();}catch{return 'UNBOUND';}
}
function sha256File(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function artifactDir(candidateSha){return path.join(root,'artifacts','qa','hipico-v119',candidateSha);}
function scenarioTemplate(){return Object.fromEntries(catalog.scenarios.map((scenario)=>[scenario.id,{status:'NOT_EXECUTED',severity:null,notes:'',evidence:[]}]))}
function invariantEvidenceTemplate(){return Object.fromEntries(invariantKeys.map((key)=>[key,[]]));}
function template(candidateSha){
  return{
    schemaVersion:2,
    product:'control-hipico',
    candidateSha,
    startedAt:new Date().toISOString(),
    completedAt:null,
    operator:null,
    requiredModes:catalog.requiredModes,
    environments:[],
    invariants:{sourceReadOnly:'NOT_EXECUTED',labOnlyWriteDestination:'NOT_EXECUTED',sessionFallbackSafe:'NOT_EXECUTED'},
    invariantEvidence:invariantEvidenceTemplate()
  };
}
function parseEvidenceList(raw){
  if(!raw)return[];
  return raw.split(',').map((item)=>item.trim()).filter(Boolean);
}
function validateEvidencePath(rel){
  if(typeof rel!=='string'||!rel.trim()||rel.includes('\0')||path.isAbsolute(rel))return false;
  return !rel.split(/[\\/]+/).includes('..');
}
function pathInside(base,target){
  const relative=path.relative(base,target);
  return relative!==''&&relative!=='..'&&!relative.startsWith(`..${path.sep}`)&&!path.isAbsolute(relative);
}
function inspectEvidenceFile(dir,rel,label){
  if(!validateEvidencePath(rel))return{error:`${label}: evidence path inválido ${rel}`};
  const base=path.resolve(dir);const full=path.resolve(base,rel);
  if(!pathInside(base,full)||!fs.existsSync(full))return{error:`${label}: evidence faltante ${rel}`};
  let stat;
  try{stat=fs.lstatSync(full);}catch{return{error:`${label}: evidence inaccesible ${rel}`};}
  if(stat.isSymbolicLink())return{error:`${label}: evidence symlink no permitido ${rel}`};
  if(!stat.isFile())return{error:`${label}: evidence debe ser archivo regular ${rel}`};
  let realBase,realFull;
  try{realBase=fs.realpathSync(base);realFull=fs.realpathSync(full);}catch{return{error:`${label}: evidence no resoluble ${rel}`};}
  if(!pathInside(realBase,realFull))return{error:`${label}: evidence escapa del artifact ${rel}`};
  return{file:{path:rel,sha256:sha256File(realFull)}};
}
function collectEvidenceFiles(result,dir){
  const evidenceFiles=[];const errors=[];
  for(const env of result.environments||[])for(const [id,row] of Object.entries(env.scenarios||{}))for(const rel of row.evidence||[]){
    const inspected=inspectEvidenceFile(dir,rel,`${env.id}/${id}`);
    if(inspected.error)errors.push(inspected.error);else evidenceFiles.push({environment:env.id,scenario:id,...inspected.file});
  }
  for(const key of invariantKeys)for(const rel of result.invariantEvidence?.[key]||[]){
    const inspected=inspectEvidenceFile(dir,rel,`invariant/${key}`);
    if(inspected.error)errors.push(inspected.error);else evidenceFiles.push({invariant:key,...inspected.file});
  }
  return{evidenceFiles,errors};
}
function validSessionHash(value){return /^[a-f0-9]{64}$/i.test(String(value||''));}
function validate(result){
  const errors=[];const allowed=new Set(catalog.allowedStatuses);
  if(result.schemaVersion!==2)errors.push('schemaVersion 2 requerida; reinicializa la evidencia física.');
  if(!/^[a-f0-9]{40}$/i.test(String(result.candidateSha||'')))errors.push('candidateSha debe ser SHA Git de 40 caracteres.');
  if(!Array.isArray(result.environments))errors.push('environments debe ser un arreglo.');
  const ids=new Set();
  for(const env of result.environments||[]){
    if(!/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(String(env.id||'')))errors.push('Environment id inválido.');
    else if(ids.has(env.id))errors.push(`Environment duplicado ${env.id}.`);else ids.add(env.id);
    if(!catalog.requiredModes.includes(env.mode))errors.push(`${env.id}: mode inválido ${env.mode}.`);
    if(!String(env.device||'').trim())errors.push(`${env.id}: device requerido.`);
    for(const scenario of catalog.scenarios){
      const row=env.scenarios?.[scenario.id];
      if(!row)errors.push(`${env.id}: falta escenario ${scenario.id}.`);
      else if(!allowed.has(row.status))errors.push(`${env.id}/${scenario.id}: status inválido ${row.status}.`);
    }
    for(const [id,row] of Object.entries(env.scenarios||{}))for(const evidence of row.evidence||[]){if(!validateEvidencePath(evidence))errors.push(`${env.id}/${id}: evidence path inválido.`);}
  }
  for(const mode of catalog.requiredModes)if(!(result.environments||[]).some((env)=>env.mode===mode))errors.push(`Falta environment requerido para mode ${mode}.`);
  for(const key of invariantKeys){
    if(!allowed.has(result.invariants?.[key]))errors.push(`Invariant ${key} inválida.`);
    for(const evidence of result.invariantEvidence?.[key]||[])if(!validateEvidencePath(evidence))errors.push(`Invariant ${key}: evidence path inválido.`);
  }
  return errors;
}
function summary(result){
  const counts={PASS:0,FAIL:0,BLOCKED:0,NOT_EXECUTED:0};
  let passRowsWithEvidence=0;
  for(const env of result.environments||[])for(const row of Object.values(env.scenarios||{})){
    counts[row.status]=(counts[row.status]||0)+1;
    if(row.status==='PASS'&&Array.isArray(row.evidence)&&row.evidence.length>0)passRowsWithEvidence+=1;
  }
  const modeCoverage=Object.fromEntries(catalog.requiredModes.map((mode)=>[mode,(result.environments||[]).filter((env)=>env.mode===mode).length]));
  const sourceSafe=result.invariants?.sourceReadOnly==='PASS'&&result.invariants?.labOnlyWriteDestination==='PASS'&&result.invariants?.sessionFallbackSafe==='PASS';
  const invariantEvidenceComplete=invariantKeys.every((key)=>result.invariants?.[key]==='PASS'&&Array.isArray(result.invariantEvidence?.[key])&&result.invariantEvidence[key].length>0);
  const requiredModesCovered=catalog.requiredModes.every((mode)=>modeCoverage[mode]>0);
  const expectedCases=(result.environments||[]).length*catalog.scenarios.length;
  const operatorPresent=Boolean(String(result.operator||'').trim());
  const sessionTopologySafe=(result.environments||[]).length>0&&(result.environments||[]).every((env)=>validSessionHash(env.sourceSessionIdHash)&&validSessionHash(env.labSessionIdHash)&&String(env.sourceSessionIdHash).toLowerCase()!==String(env.labSessionIdHash).toLowerCase());
  const evidenceComplete=expectedCases>0&&counts.PASS===expectedCases&&passRowsWithEvidence===expectedCases;
  const complete=expectedCases>0&&counts.PASS===expectedCases&&counts.FAIL===0&&counts.BLOCKED===0&&counts.NOT_EXECUTED===0&&sourceSafe&&invariantEvidenceComplete&&requiredModesCovered&&operatorPresent&&sessionTopologySafe&&evidenceComplete;
  return{counts,totalCases:expectedCases,environments:(result.environments||[]).length,modeCoverage,requiredModesCovered,sourceSafe,invariantEvidenceComplete,operatorPresent,sessionTopologySafe,evidenceComplete,passRowsWithEvidence,releasePhysicalGate:complete?'PASS':'NOT_READY'};
}
function writeManifest(result,target){const dir=path.dirname(target);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(target,`${JSON.stringify(result,null,2)}\n`);}
function writeReleaseEvidence(final,target){
  const evidence={
    schema:'hipico-physical-qa-evidence.v119',
    candidateSha:final.candidateSha,
    status:'PASS',
    checkedAt:final.checkedAt,
    completedAt:final.completedAt,
    operator:final.operator,
    requiredModes:final.requiredModes,
    environments:(final.environments||[]).map((env)=>({id:env.id,mode:env.mode,device:env.device})),
    invariants:final.invariants,
    summary:final.summary,
    evidenceFiles:final.evidenceFiles
  };
  writeManifest(evidence,target);
}

const sha=gitSha();
if(command==='init'){
  if(!/^[a-f0-9]{40}$/i.test(sha)){console.error('No existe candidate SHA verificable. Usa GIT_SHA/GITHUB_SHA o ejecuta dentro de git.');process.exit(2);}
  const target=fileArg||path.join(artifactDir(sha),'physical-qa.json');
  if(fs.existsSync(target)&&!args.includes('--force')){console.error(`Ya existe ${target}. Usa --force sólo si conscientemente reinicias la evidencia.`);process.exit(2);}
  const initial=template(sha);if(value('operator'))initial.operator=value('operator');
  writeManifest(initial,target);console.log(target);process.exit(0);
}

const target=fileArg||(/^[a-f0-9]{40}$/i.test(sha)?path.join(artifactDir(sha),'physical-qa.json'):null);
if(!target||!fs.existsSync(target)){console.error('No existe evidence file. Ejecuta: node scripts/hipico-physical-qa-v119.mjs init');process.exit(2);}
let result=JSON.parse(fs.readFileSync(target,'utf8'));
if(result.schemaVersion!==2){console.error('Evidence schema v1 no demuestra device×mode. Reinicializa #119 con schema v2.');process.exit(2);}
if(!result.invariantEvidence)result.invariantEvidence=invariantEvidenceTemplate();

if(command==='operator'){
  const operator=value('name');
  if(!operator||operator.trim().length<2){console.error('Uso: operator --name=<tester/responsable>');process.exit(2);}
  result.operator=operator.trim();writeManifest(result,target);console.log(JSON.stringify({operatorConfigured:true}));process.exit(0);
}
if(command==='add-env'){
  const id=value('id');const mode=value('mode');const device=value('device');
  if(!id||!mode||!device){console.error('Uso: add-env --id=<id> --mode=<pwa-browser|pwa-standalone|android-apk> --device=<modelo>');process.exit(2);}
  if(!catalog.requiredModes.includes(mode)){console.error(`Mode inválido: ${mode}`);process.exit(2);}
  if(result.environments.some((env)=>env.id===id)){console.error(`Environment duplicado: ${id}`);process.exit(2);}
  result.environments.push({id,mode,device,androidVersion:value('android'),oem:value('oem'),browser:value('browser'),browserVersion:value('browser-version'),apkVersion:value('apk-version'),apkSha256:value('apk-sha256'),sourceSessionIdHash:value('source-session-hash'),labSessionIdHash:value('lab-session-hash'),scenarios:scenarioTemplate()});
  writeManifest(result,target);console.log(JSON.stringify({added:id,mode,device}));process.exit(0);
}
if(command==='record'){
  const envId=value('env');const scenarioId=value('scenario');const status=value('status');
  const env=result.environments.find((item)=>item.id===envId);
  if(!env){console.error(`Environment no encontrado: ${envId}`);process.exit(2);}
  if(!catalog.scenarios.some((item)=>item.id===scenarioId)){console.error(`Scenario no encontrado: ${scenarioId}`);process.exit(2);}
  if(!catalog.allowedStatuses.includes(status)){console.error(`Status inválido: ${status}`);process.exit(2);}
  env.scenarios[scenarioId]={status,severity:value('severity'),notes:value('notes')||'',evidence:parseEvidenceList(value('evidence'))};
  writeManifest(result,target);console.log(JSON.stringify({env:envId,scenario:scenarioId,status}));process.exit(0);
}
if(command==='invariant'){
  const name=value('name');const status=value('status');
  if(!invariantKeys.includes(name)){console.error(`Invariant inválida: ${name}`);process.exit(2);}
  if(!catalog.allowedStatuses.includes(status)){console.error(`Status inválido: ${status}`);process.exit(2);}
  result.invariants[name]=status;
  result.invariantEvidence[name]=parseEvidenceList(value('evidence'));
  writeManifest(result,target);console.log(JSON.stringify({invariant:name,status,evidence:result.invariantEvidence[name]}));process.exit(0);
}

const errors=validate(result);if(errors.length){console.error(errors.join('\n'));process.exit(1);}
let report=summary(result);
const material=collectEvidenceFiles(result,path.dirname(target));
const materialEvidenceComplete=report.evidenceComplete&&report.invariantEvidenceComplete&&material.errors.length===0;
report={...report,materialEvidenceComplete,materialEvidenceErrors:material.errors};
if(report.releasePhysicalGate==='PASS'&&!materialEvidenceComplete)report.releasePhysicalGate='NOT_READY';
if(command==='status'){console.log(JSON.stringify(report,null,2));process.exit(0);}
if(command==='check'){
  if(!/^[a-f0-9]{40}$/i.test(sha)){console.error('CANDIDATE_SHA_UNBOUND: check requiere HEAD/GIT_SHA verificable.');process.exit(1);}
  if(String(result.candidateSha).toLowerCase()!==sha){console.error(`CANDIDATE_SHA_MISMATCH: evidence=${result.candidateSha} current=${sha}`);process.exit(1);}
  if(material.errors.length){console.error(material.errors.join('\n'));process.exit(1);}
  const checkedAt=new Date().toISOString();
  const completedAt=report.releasePhysicalGate==='PASS'?(result.completedAt||checkedAt):null;
  const final={...result,checkedAt,completedAt,summary:report,evidenceFiles:material.evidenceFiles};
  const manifest=path.join(path.dirname(target),'manifest.json');writeManifest(final,manifest);
  fs.writeFileSync(path.join(path.dirname(target),'SHA256SUMS.txt'),material.evidenceFiles.map((item)=>`${item.sha256}  ${item.path}`).join('\n')+(material.evidenceFiles.length?'\n':''));
  if(report.releasePhysicalGate==='PASS'){
    writeReleaseEvidence(final,path.join(path.dirname(target),'physical-qa-evidence.json'));
  }
  console.log(JSON.stringify(report,null,2));
  if(report.releasePhysicalGate!=='PASS')process.exit(3);
  process.exit(0);
}
console.error(`Comando desconocido: ${command}. Usa init|operator|add-env|record|invariant|status|check.`);process.exit(2);
