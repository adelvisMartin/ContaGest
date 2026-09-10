#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const root=process.cwd();
const args=process.argv.slice(2);
const command=args[0]||'status';
const scope=(args.find((arg)=>arg.startsWith('--scope='))?.slice(8)||'all').toLowerCase();

function candidateSha(){
  const explicit=args.find((arg)=>arg.startsWith('--sha='))?.slice(6);
  const env=explicit||process.env.CANDIDATE_SHA||process.env.GITHUB_SHA||process.env.GIT_SHA||process.env.VERCEL_GIT_COMMIT_SHA||'';
  if(/^[a-f0-9]{40}$/i.test(String(env).trim()))return String(env).trim().toLowerCase();
  try{return execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim().toLowerCase();}catch{return 'UNBOUND';}
}
const sha=candidateSha();
if(!/^[a-f0-9]{40}$/.test(sha)){console.error('QA_TODAY_REQUIRES_BOUND_SHA');process.exit(2);}
const env={...process.env,CANDIDATE_SHA:sha,GIT_SHA:sha};
const records=[];

function run(label,file,fileArgs,options={}){
  const result=spawnSync(process.execPath,[file,...fileArgs],{cwd:root,env,encoding:'utf8'});
  const record={label,command:`node ${file} ${fileArgs.join(' ')}`,exitCode:result.status??1,stdout:String(result.stdout||'').trim(),stderr:String(result.stderr||'').trim()};
  records.push(record);
  if(options.echo!==false){console.log(`\n[${label}] exit=${record.exitCode}`);if(record.stdout)console.log(record.stdout);if(record.stderr)console.error(record.stderr);}
  return record;
}
function abs(rel){return path.join(root,rel);}
function exists(rel){return fs.existsSync(abs(rel));}
function writeJsonIfMissing(rel,value){
  const file=abs(rel);if(fs.existsSync(file))return;
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,`${JSON.stringify(value,null,2)}\n`,{flag:'wx'});
}
function prepareErp(){
  if(!exists(`artifacts/qa/erp-v155/${sha}/evidence.json`))run('ERP #155 init','scripts/erp-e2e-evidence-v155.mjs',['init',`--sha=${sha}`]);
  if(!exists(`artifacts/qa/erp-performance-v157/${sha}/measurements.json`))run('ERP #157 init','scripts/erp-performance-gate-v157.mjs',['init',`--sha=${sha}`]);
  if(!exists(`artifacts/qa/erp-mobile-v182/${sha}/evidence.json`))run('ERP #182 init','scripts/erp-mobile-production-gate-v182.mjs',['init',`--sha=${sha}`]);
}
function prepareHipico(){
  if(!exists(`artifacts/qa/hipico-v119/${sha}/physical-qa.json`))run('Hípico #119 init','scripts/hipico-physical-qa-v119.mjs',['init']);
  const inputDir=`artifacts/qa/hipico-v120-inputs/${sha}`;
  writeJsonIfMissing(`${inputDir}/safety-evidence.json`,{candidateSha:sha,invariants:{sourceReadOnly:{status:'NOT_EXECUTED',at:null,evidence:[]},labOnlyWriteDestination:{status:'NOT_EXECUTED',at:null,evidence:[]},sessionFallbackSafe:{status:'NOT_EXECUTED',at:null,evidence:[]}}});
  writeJsonIfMissing(`${inputDir}/drill-evidence.json`,{candidateSha:sha,drills:{'bridge-restart':{status:'NOT_EXECUTED',at:null,evidence:[]},'backend-restart':{status:'NOT_EXECUTED',at:null,evidence:[]},'lab-reconnect':{status:'NOT_EXECUTED',at:null,evidence:[]},'source-session-reconnect-readonly':{status:'NOT_EXECUTED',at:null,evidence:[]}}});
}
function statusErp(){
  if(exists(`artifacts/qa/erp-v155/${sha}/evidence.json`))run('ERP #155 status','scripts/erp-e2e-evidence-v155.mjs',['status',`--sha=${sha}`]);
  else records.push({label:'ERP #155 status',exitCode:3,truthState:'NOT_EXECUTED'});
  if(exists(`artifacts/qa/erp-performance-v157/${sha}/measurements.json`))run('ERP #157 status','scripts/erp-performance-gate-v157.mjs',['status',`--sha=${sha}`]);
  else records.push({label:'ERP #157 status',exitCode:3,truthState:'NOT_EXECUTED'});
  if(exists(`artifacts/qa/erp-mobile-v182/${sha}/evidence.json`))run('ERP #182 status','scripts/erp-mobile-production-gate-v182.mjs',['status',`--sha=${sha}`]);
  else records.push({label:'ERP #182 status',exitCode:3,truthState:'NOT_EXECUTED'});
}
function soakAttempts(){
  const candidate=`artifacts/qa/hipico-v120/${sha}`;const base=abs(candidate);const attempts=[];
  const legacy=path.join(base,'summary.json');if(fs.existsSync(legacy))attempts.push({file:`${candidate}/summary.json`,legacy:true});
  if(fs.existsSync(base))for(const entry of fs.readdirSync(base,{withFileTypes:true})){
    if(!entry.isDirectory())continue;const summary=path.join(base,entry.name,'summary.json');
    if(fs.existsSync(summary))attempts.push({file:`${candidate}/${entry.name}/summary.json`,legacy:false});
  }
  return attempts.map((item)=>{
    try{const body=JSON.parse(fs.readFileSync(abs(item.file),'utf8'));const completedAt=Date.parse(body?.completedAt||'')||fs.statSync(abs(item.file)).mtimeMs;return{...item,attemptId:body?.attemptId||path.basename(path.dirname(item.file)),status:body?.evaluation?.status||'NOT_EXECUTED',completedAt};}
    catch{return{...item,attemptId:path.basename(path.dirname(item.file)),status:'INVALID_EVIDENCE',completedAt:fs.statSync(abs(item.file)).mtimeMs};}
  }).sort((a,b)=>b.completedAt-a.completedAt);
}
function statusHipico(){
  if(exists(`artifacts/qa/hipico-v119/${sha}/physical-qa.json`))run('Hípico #119 status','scripts/hipico-physical-qa-v119.mjs',['status']);
  else records.push({label:'Hípico #119 status',exitCode:3,truthState:'NOT_EXECUTED'});
  const attempts=soakAttempts();
  if(attempts.length){const latest=attempts[0];records.push({label:'Hípico #120 soak',exitCode:latest.status==='PASS'?0:3,truthState:latest.status,summaryFile:latest.file,attemptId:latest.attemptId,attempts:attempts.length,releasePassAttempts:attempts.filter((item)=>item.status==='PASS').length});}
  else records.push({label:'Hípico #120 soak',exitCode:3,truthState:'NOT_EXECUTED',attempts:0});
}
function instructions(){
  const inputDir=`artifacts/qa/hipico-v120-inputs/${sha}`;
  const lines=[
    `candidateSha=${sha}`,
    '',
    'ERP QA HOY',
    `1) npm run qa:today:prepare -- --scope=erp --sha=${sha}`,
    '2) npm run test:browser:58',
    `3) CANDIDATE_SHA=${sha} npm run qa:today:status -- --scope=erp`,
    '4) Para deploy servido: ERP_PRODUCTION_URL=<URL> ERP_QA_SESSION_JSON=<JSON> CANDIDATE_SHA=<SHA> npx playwright test qa/erp-mobile-production-v182.spec.mjs --project=chromium --workers=1',
    '',
    'CONTROL HÍPICO QA HOY',
    `1) npm run qa:today:prepare -- --scope=hipico --sha=${sha}`,
    '2) npm run test:hipico && npm run qa:hipico && npm run qa:hipico:visual',
    `3) Completa artifacts/qa/hipico-v119/${sha}/physical-qa.json con operador, device×mode, SOURCE(read-only), LAB(write-only), sesiones separadas y archivos reales de evidencia.`,
    '4) node scripts/hipico-physical-qa-v119.mjs check',
    `5) Durante #120 actualiza ${inputDir}/drill-evidence.json con los cuatro restart/reconnect reales y sus archivos de evidencia.`,
    `6) En los últimos 15 minutos actualiza ${inputDir}/safety-evidence.json con la verificación final de SOURCE read-only, LAB-only y session fallback safe.`,
    `7) Soak mínimo 24h: GIT_SHA=${sha} npm --workspace backend run soak:hipico -- --sha=${sha} --duration-minutes=1440 --operator-id=<qa-user> --health-url=<bridge-health-url> --spool-path=<spool-v2-dir> --physical-evidence=artifacts/qa/hipico-v119/${sha}/manifest.json --safety-evidence=${inputDir}/safety-evidence.json --drill-evidence=${inputDir}/drill-evidence.json`,
    `8) npm run qa:today:status -- --scope=hipico --sha=${sha}`,
    '',
    'SEGURIDAD',
    '- SOURCE no se usa como destino de escritura durante #119/#120.',
    '- Los PASS requieren evidencia material; flags declarativos no promueven release.',
    '- Cada soak crea un attempt inmutable; no mezcla muestras de ejecuciones anteriores.',
    '- #154 permanece NO_GO para automatización productiva de apuestas con dinero real.',
    '- Un NOT_EXECUTED/BLOCKED nunca se reporta como PASS.'
  ];
  console.log(lines.join('\n'));
}

if(command==='prepare'){
  if(scope==='all'||scope==='erp')prepareErp();
  if(scope==='all'||scope==='hipico')prepareHipico();
  instructions();
}else if(command==='status'){
  if(scope==='all'||scope==='erp')statusErp();
  if(scope==='all'||scope==='hipico')statusHipico();
  console.log('\nQA_TODAY_SUMMARY');
  console.log(JSON.stringify({candidateSha:sha,scope,records},null,2));
}else if(command==='instructions')instructions();
else {console.error('Usa prepare|status|instructions y --scope=erp|hipico|all.');process.exit(2);}
