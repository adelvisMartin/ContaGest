#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root=process.cwd();
const catalog=JSON.parse(fs.readFileSync(path.join(root,'products/hipico-control/physical-qa-v119.json'),'utf8'));
const args=process.argv.slice(2);
const command=args[0]||'status';
const fileArg=args.find((arg)=>arg.startsWith('--file='))?.slice(7)||null;

function gitSha(){
  const env=String(process.env.GITHUB_SHA||process.env.VERCEL_GIT_COMMIT_SHA||process.env.GIT_SHA||'').trim();
  if(/^[a-f0-9]{40}$/i.test(env))return env.toLowerCase();
  try{return execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();}catch{return 'UNBOUND';}
}
function sha256File(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function artifactDir(candidateSha){return path.join(root,'artifacts','qa','hipico-v119',candidateSha);}
function template(candidateSha){
  return{
    schemaVersion:1,
    product:'control-hipico',
    candidateSha,
    startedAt:new Date().toISOString(),
    completedAt:null,
    operator:null,
    environment:{device:null,androidVersion:null,oem:null,browser:null,browserVersion:null,pwaMode:null,apkVersion:null,apkSha256:null,sourceSessionIdHash:null,labSessionIdHash:null},
    invariants:{sourceReadOnly:'NOT_EXECUTED',labOnlyWriteDestination:'NOT_EXECUTED',sessionFallbackSafe:'NOT_EXECUTED'},
    scenarios:Object.fromEntries(catalog.scenarios.map((scenario)=>[scenario.id,{status:'NOT_EXECUTED',severity:null,notes:'',evidence:[]}]))
  };
}
function validate(result){
  const errors=[];const allowed=new Set(catalog.allowedStatuses);
  if(!/^[a-f0-9]{40}$/i.test(String(result.candidateSha||'')))errors.push('candidateSha debe ser SHA Git de 40 caracteres.');
  for(const scenario of catalog.scenarios){const row=result.scenarios?.[scenario.id];if(!row)errors.push(`Falta escenario ${scenario.id}.`);else if(!allowed.has(row.status))errors.push(`${scenario.id}: status inválido ${row.status}.`);}
  for(const key of ['sourceReadOnly','labOnlyWriteDestination','sessionFallbackSafe'])if(!allowed.has(result.invariants?.[key]))errors.push(`Invariant ${key} inválida.`);
  for(const [id,row] of Object.entries(result.scenarios||{}))for(const evidence of row.evidence||[]){if(typeof evidence!=='string'||evidence.includes('..'))errors.push(`${id}: evidence path inválido.`);}
  return errors;
}
function summary(result){
  const counts={PASS:0,FAIL:0,BLOCKED:0,NOT_EXECUTED:0};
  for(const row of Object.values(result.scenarios||{}))counts[row.status]=(counts[row.status]||0)+1;
  const invariantValues=Object.values(result.invariants||{});
  const sourceSafe=result.invariants?.sourceReadOnly==='PASS'&&result.invariants?.labOnlyWriteDestination==='PASS'&&result.invariants?.sessionFallbackSafe==='PASS';
  const complete=counts.FAIL===0&&counts.BLOCKED===0&&counts.NOT_EXECUTED===0&&sourceSafe;
  return{counts,invariants:invariantValues,releasePhysicalGate:complete?'PASS':'NOT_READY'};
}
function writeManifest(result,target){
  const dir=path.dirname(target);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(target,`${JSON.stringify(result,null,2)}\n`);
}

const sha=gitSha();
if(command==='init'){
  if(!/^[a-f0-9]{40}$/i.test(sha)){console.error('No existe candidate SHA verificable. Usa GIT_SHA/GITHUB_SHA o ejecuta dentro de git.');process.exit(2);}
  const target=fileArg||path.join(artifactDir(sha),'physical-qa.json');
  if(fs.existsSync(target)&&!args.includes('--force')){console.error(`Ya existe ${target}. Usa --force sólo si conscientemente reinicias la evidencia.`);process.exit(2);}
  writeManifest(template(sha),target);console.log(target);process.exit(0);
}

const target=fileArg||(/^[a-f0-9]{40}$/i.test(sha)?path.join(artifactDir(sha),'physical-qa.json'):null);
if(!target||!fs.existsSync(target)){console.error('No existe evidence file. Ejecuta: node scripts/hipico-physical-qa-v119.mjs init');process.exit(2);}
const result=JSON.parse(fs.readFileSync(target,'utf8'));
const errors=validate(result);if(errors.length){console.error(errors.join('\n'));process.exit(1);}
const report=summary(result);
if(command==='status'){console.log(JSON.stringify(report,null,2));process.exit(0);}
if(command==='check'){
  const dir=path.dirname(target);const evidenceFiles=[];
  for(const [id,row] of Object.entries(result.scenarios)){for(const rel of row.evidence||[]){const full=path.resolve(dir,rel);if(!full.startsWith(path.resolve(dir)+path.sep)||!fs.existsSync(full)){console.error(`${id}: evidence faltante ${rel}`);process.exit(1);}evidenceFiles.push({scenario:id,path:rel,sha256:sha256File(full)});}}
  const final={...result,completedAt:result.completedAt||new Date().toISOString(),summary:report,evidenceFiles};
  const manifest=path.join(dir,'manifest.json');writeManifest(final,manifest);
  fs.writeFileSync(path.join(dir,'SHA256SUMS.txt'),evidenceFiles.map((item)=>`${item.sha256}  ${item.path}`).join('\n')+(evidenceFiles.length?'\n':''));
  console.log(JSON.stringify(report,null,2));
  if(report.releasePhysicalGate!=='PASS')process.exit(3);
  process.exit(0);
}
console.error(`Comando desconocido: ${command}. Usa init|status|check.`);process.exit(2);
