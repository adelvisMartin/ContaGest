import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildErpE2EMatrixV155,
  caseIdentityV155,
  ERP_E2E_VIEWPORTS_V155,
  ERP_E2E_REQUIRED_ASSERTIONS_V155,
  validateEvidenceMatrixV155
} from '../qa/support/erp-e2e-matrix-v155.mjs';

const VALID=new Set(['PASS','FAIL','BLOCKED','NOT_EXECUTED']);
const sha=String(process.env.CANDIDATE_SHA||process.argv.find((arg)=>arg.startsWith('--sha='))?.split('=')[1]||'').trim();
const command=process.argv[2]||'status';
if(!/^[a-f0-9]{40}$/i.test(sha))throw new Error('CANDIDATE_SHA_REQUIRED_40_HEX');
const root=path.resolve('artifacts/qa/erp-v155',sha);
const evidenceFile=path.join(root,'evidence.json');
const summaryFile=path.join(root,'summary.json');
const canonicalMatrix=buildErpE2EMatrixV155();

function template(){
  return {
    schemaVersion:3,
    issue:155,
    candidateSha:sha,
    generatedAt:new Date().toISOString(),
    truthState:'NOT_EXECUTED',
    dimensions:['route','role','state','viewport','criticalFlow'],
    viewports:ERP_E2E_VIEWPORTS_V155,
    assertions:ERP_E2E_REQUIRED_ASSERTIONS_V155,
    fixtures:{classification:'SYNTHETIC_TEST_ONLY',containsRealPII:false},
    cases:canonicalMatrix.map((item)=>({...item,status:'NOT_EXECUTED',evidence:[],findings:[],notes:''}))
  };
}
function digest(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');}
function countBy(items,key,value){return Object.fromEntries([...VALID].map((status)=>[status,items.filter((item)=>item[key]===value&&item.status===status).length]));}

if(command==='init'){
  fs.mkdirSync(root,{recursive:true});
  if(!fs.existsSync(evidenceFile))fs.writeFileSync(evidenceFile,JSON.stringify(template(),null,2)+'\n');
  console.log(evidenceFile);
  process.exit(0);
}
if(!fs.existsSync(evidenceFile))throw new Error(`EVIDENCE_NOT_FOUND:${evidenceFile}`);
const evidence=JSON.parse(fs.readFileSync(evidenceFile,'utf8'));
if(evidence.schemaVersion!==3)throw new Error('EVIDENCE_SCHEMA_V3_REQUIRED_REINITIALIZE');
if(evidence.candidateSha!==sha)throw new Error('EVIDENCE_SHA_MISMATCH');
if(evidence.fixtures?.containsRealPII!==false)throw new Error('EVIDENCE_REAL_PII_NOT_ALLOWED');
for(const item of evidence.cases||[])if(!VALID.has(item.status))throw new Error(`INVALID_STATUS:${item.status}`);
const validation=validateEvidenceMatrixV155(evidence.cases);
if(!validation.valid)throw new Error(`EVIDENCE_MATRIX_INVALID:${validation.errors.slice(0,12).join(',')}`);

const counts=Object.fromEntries([...VALID].map((status)=>[status,evidence.cases.filter((item)=>item.status===status).length]));
const byViewport=Object.fromEntries(ERP_E2E_VIEWPORTS_V155.map(({name})=>[name,countBy(evidence.cases,'viewport',name)]));
const roles=[...new Set(evidence.cases.map((item)=>item.role))];
const states=[...new Set(evidence.cases.map((item)=>item.state))];
const families=[...new Set(evidence.cases.map((item)=>item.family))];
const routes=[...new Set(evidence.cases.map((item)=>item.route))];
const byRole=Object.fromEntries(roles.map((role)=>[role,countBy(evidence.cases,'role',role)]));
const byState=Object.fromEntries(states.map((state)=>[state,countBy(evidence.cases,'state',state)]));
const byFamily=Object.fromEntries(families.map((family)=>[family,countBy(evidence.cases,'family',family)]));
const byRoute=Object.fromEntries(routes.map((route)=>[route,countBy(evidence.cases,'route',route)]));
const priorityCases=evidence.cases.filter((item)=>['critical','high'].includes(item.priority));
const priorityCounts=Object.fromEntries([...VALID].map((status)=>[status,priorityCases.filter((item)=>item.status===status).length]));
let verdict='PASS';
if(counts.FAIL)verdict='FAIL';
else if(counts.BLOCKED)verdict='BLOCKED';
else if(counts.NOT_EXECUTED)verdict='NOT_EXECUTED';
let p01Verdict='PASS';
if(priorityCounts.FAIL)p01Verdict='FAIL';
else if(priorityCounts.BLOCKED)p01Verdict='BLOCKED';
else if(priorityCounts.NOT_EXECUTED)p01Verdict='NOT_EXECUTED';
const passRatio=evidence.cases.length?counts.PASS/evidence.cases.length:0;
const summary={
  issue:155,
  schemaVersion:3,
  candidateSha:sha,
  verdict,
  p01Verdict,
  counts,
  priorityCounts,
  passRatio:Number(passRatio.toFixed(6)),
  readinessScore:Number((passRatio*100).toFixed(2)),
  byViewport,byRole,byState,byFamily,byRoute,
  total:evidence.cases.length,
  expectedTotal:canonicalMatrix.length,
  matrixHash:digest(evidence.cases.map(({route,state,role,viewport,width,height,orientation,criticalFlow,status})=>({route,state,role,viewport,width,height,orientation,criticalFlow,status}))),
  identityHash:digest(evidence.cases.map((item)=>caseIdentityV155(item))),
  checkedAt:new Date().toISOString()
};
fs.mkdirSync(root,{recursive:true});
fs.writeFileSync(summaryFile,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));
if(command==='check'&&verdict!=='PASS')process.exitCode=2;
