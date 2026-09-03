import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildErpE2EMatrixV155,
  caseIdentityV155,
  ERP_E2E_REQUIRED_ASSERTIONS_V155,
  ERP_E2E_VIEWPORTS_V155
} from '../qa/support/erp-e2e-matrix-v155.mjs';

const sha=String(process.env.CANDIDATE_SHA||process.argv.find((arg)=>arg.startsWith('--sha='))?.split('=')[1]||'').trim();
if(!/^[a-f0-9]{40}$/i.test(sha))throw new Error('CANDIDATE_SHA_REQUIRED_40_HEX');
const shardRoot=path.resolve(process.argv.find((arg)=>arg.startsWith('--shards='))?.slice(9)||'artifacts/qa/erp-v155-shards',sha);
const outRoot=path.resolve('artifacts/qa/erp-v155',sha);
fs.mkdirSync(outRoot,{recursive:true});

function walk(dir){
  if(!fs.existsSync(dir))return[];
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap((entry)=>{const full=path.join(dir,entry.name);return entry.isDirectory()?walk(full):[full];});
}
function digest(value){return crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');}
function statusCounts(items){return Object.fromEntries(['PASS','FAIL','BLOCKED','NOT_EXECUTED'].map((status)=>[status,items.filter((item)=>item.status===status).length]));}
function severityFor(item,kind){
  if(item.route==='login'&&/PAGE_ERROR|CASE_EXCEPTION|EMPTY_VIEW/.test(kind))return'P0';
  if(item.priority==='critical')return'P0';
  if(item.priority==='high')return'P1';
  if(item.priority==='medium')return'P2';
  return'P3';
}

const files=walk(shardRoot).filter((file)=>file.endsWith('results.jsonl'));
const observed=new Map();const duplicateKeys=[];const parseErrors=[];
for(const file of files){
  const lines=fs.readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean);
  for(let line=0;line<lines.length;line+=1){
    try{
      const row=JSON.parse(lines[line]);const key=caseIdentityV155(row);
      if(observed.has(key))duplicateKeys.push({key,first:observed.get(key).__source,second:`${file}:${line+1}`});
      observed.set(key,{...row,__source:`${file}:${line+1}`});
    }catch(error){parseErrors.push({file,line:line+1,error:String(error?.message||error)});}
  }
}

const canonical=buildErpE2EMatrixV155();
const evidenceCases=canonical.map((item)=>{
  const key=caseIdentityV155(item);const row=observed.get(key);
  if(!row)return{...item,status:'NOT_EXECUTED',evidence:[],findings:[{kind:'SHARD_RESULT_MISSING'}],interactions:[],warnings:[],notes:'No se recibió resultado de browser shard.'};
  const{__source,...safe}=row;return{...item,...safe,notes:safe.notes||'',sourceArtifact:path.relative(process.cwd(),__source.split(':')[0])};
});

const counts=statusCounts(evidenceCases);
const p01=evidenceCases.filter((item)=>['critical','high'].includes(item.priority));
const p01Counts=statusCounts(p01);
const byViewport=Object.fromEntries(ERP_E2E_VIEWPORTS_V155.map(({name})=>[name,statusCounts(evidenceCases.filter((item)=>item.viewport===name))]));
const roles=[...new Set(evidenceCases.map((item)=>item.role))];
const byRole=Object.fromEntries(roles.map((role)=>[role,statusCounts(evidenceCases.filter((item)=>item.role===role))]));
const states=[...new Set(evidenceCases.map((item)=>item.state))];
const byState=Object.fromEntries(states.map((state)=>[state,statusCounts(evidenceCases.filter((item)=>item.state===state))]));
const routes=[...new Set(evidenceCases.map((item)=>item.route))];
const byRoute=Object.fromEntries(routes.map((route)=>[route,statusCounts(evidenceCases.filter((item)=>item.route===route))]));
const passRatio=evidenceCases.length?counts.PASS/evidenceCases.length:0;
let verdict='PASS';
if(counts.FAIL||duplicateKeys.length||parseErrors.length)verdict='FAIL';
else if(counts.BLOCKED)verdict='BLOCKED';
else if(counts.NOT_EXECUTED)verdict='NOT_EXECUTED';
let p01Verdict='PASS';
if(p01Counts.FAIL)p01Verdict='FAIL';else if(p01Counts.BLOCKED)p01Verdict='BLOCKED';else if(p01Counts.NOT_EXECUTED)p01Verdict='NOT_EXECUTED';

const defectMap=new Map();
for(const item of evidenceCases.filter((row)=>row.status==='FAIL')){
  for(const finding of item.findings||[{kind:'UNSPECIFIED_FAILURE'}]){
    const kind=String(finding.kind||'UNSPECIFIED_FAILURE');
    const key=`${item.route}|${item.criticalFlow}|${kind}`;
    if(!defectMap.has(key))defectMap.set(key,{id:`QA155-${digest(key).slice(0,8).toUpperCase()}`,severity:severityFor(item,kind),route:item.route,criticalFlow:item.criticalFlow,kind,roles:new Set(),viewports:new Set(),states:new Set(),evidence:new Set(),samples:[],knownIssue:item.route==='login'?'#221':null});
    const defect=defectMap.get(key);defect.roles.add(item.role);defect.viewports.add(item.viewport);defect.states.add(item.state);for(const ref of item.evidence||[])defect.evidence.add(ref);if(defect.samples.length<5)defect.samples.push(finding);
  }
}
const defects=[...defectMap.values()].map((item)=>({...item,roles:[...item.roles],viewports:[...item.viewports],states:[...item.states],evidence:[...item.evidence],precondition:'Candidate SHA exacto, fixtures SYNTHETIC_TEST_ONLY.',steps:[`Abrir ${item.route} con rol/viewport/estado reportado.`,`Ejecutar flujo ${item.criticalFlow}.`,'Observar finding y evidencia adjunta.'],expected:'Flujo funcional, usable, sin overflow, error no controlado, fuga de permisos ni mutación duplicada.',rollback:'Revertir únicamente el cambio correctivo asociado si introduce regresión.'}));

const evidence={
  schemaVersion:3,issue:155,candidateSha:sha,generatedAt:new Date().toISOString(),truthState:verdict,
  dimensions:['route','role','state','viewport','criticalFlow'],viewports:ERP_E2E_VIEWPORTS_V155,assertions:ERP_E2E_REQUIRED_ASSERTIONS_V155,
  fixtures:{classification:'SYNTHETIC_TEST_ONLY',containsRealPII:false},sourceShardFiles:files.map((file)=>path.relative(process.cwd(),file)),cases:evidenceCases
};
const summary={
  schemaVersion:3,issue:155,candidateSha:sha,verdict,p01Verdict,counts,p01Counts,
  total:evidenceCases.length,expectedTotal:canonical.length,observedUnique:observed.size,shardFiles:files.length,
  duplicateResultCount:duplicateKeys.length,parseErrorCount:parseErrors.length,readinessScore:Number((passRatio*100).toFixed(2)),
  byViewport,byRole,byState,byRoute,defectCandidates:defects.length,
  matrixHash:digest(evidenceCases.map(({route,role,state,viewport,criticalFlow,status})=>({route,role,state,viewport,criticalFlow,status}))),checkedAt:new Date().toISOString()
};

const report=[
  `# ContaGest — QA System Campaign #155`,
  ``,`Candidate SHA: \`${sha}\``,`Verdict: **${verdict}**`,`P0/P1: **${p01Verdict}**`,`Readiness: **${summary.readinessScore}%**`,
  ``,`## Cobertura`,`- Casos esperados: ${summary.expectedTotal}` ,`- Casos observados únicos: ${summary.observedUnique}` ,`- Shards recibidos: ${summary.shardFiles}`,
  `- PASS: ${counts.PASS}` ,`- FAIL: ${counts.FAIL}` ,`- BLOCKED: ${counts.BLOCKED}` ,`- NOT_EXECUTED: ${counts.NOT_EXECUTED}`,
  ``,`## Defect harvesting`,`- Candidatos deduplicados: ${defects.length}`,
  ...defects.slice(0,100).map((defect)=>`- **${defect.id} ${defect.severity}** ${defect.route} / ${defect.criticalFlow} / ${defect.kind}${defect.knownIssue?` → ${defect.knownIssue}`:''}`),
  ``,`## Reglas`,`Un caso no ejecutado no es PASS. Los fixtures son sintéticos. Los findings P0/P1 deben abrir issue atómico o vincular uno existente antes de cerrar #155.`
].join('\n');

fs.writeFileSync(path.join(outRoot,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
fs.writeFileSync(path.join(outRoot,'summary.json'),JSON.stringify(summary,null,2)+'\n');
fs.writeFileSync(path.join(outRoot,'defect-candidates.json'),JSON.stringify({candidateSha:sha,defects,duplicateKeys,parseErrors},null,2)+'\n');
fs.writeFileSync(path.join(outRoot,'report.md'),report+'\n');
fs.writeFileSync(path.join(outRoot,'SHA256SUMS'),['evidence.json','summary.json','defect-candidates.json','report.md'].map((name)=>`${digest(fs.readFileSync(path.join(outRoot,name)))}  ${name}`).join('\n')+'\n');
console.log(JSON.stringify(summary,null,2));
if(verdict!=='PASS'||p01Verdict!=='PASS')process.exitCode=2;
