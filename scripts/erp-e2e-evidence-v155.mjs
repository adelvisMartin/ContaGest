import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildErpE2EMatrixV155, ERP_E2E_VIEWPORTS_V155, ERP_E2E_REQUIRED_ASSERTIONS_V155 } from '../qa/support/erp-e2e-matrix-v155.mjs';

const VALID=new Set(['PASS','FAIL','BLOCKED','NOT_EXECUTED']);
const sha=String(process.env.CANDIDATE_SHA||process.argv.find((arg)=>arg.startsWith('--sha='))?.split('=')[1]||'').trim();
const command=process.argv[2]||'status';
if(!/^[a-f0-9]{40}$/i.test(sha))throw new Error('CANDIDATE_SHA_REQUIRED_40_HEX');
const root=path.resolve('artifacts/qa/erp-v155',sha);
const evidenceFile=path.join(root,'evidence.json');
const summaryFile=path.join(root,'summary.json');
const canonicalMatrix=buildErpE2EMatrixV155();

function caseKey(item){return [item.route,item.state,item.role,item.viewport].join('|');}
function template(){
  return {
    schemaVersion:2,
    issue:155,
    candidateSha:sha,
    generatedAt:new Date().toISOString(),
    truthState:'NOT_EXECUTED',
    dimensions:['route','state','role','viewport'],
    viewports:ERP_E2E_VIEWPORTS_V155,
    assertions:ERP_E2E_REQUIRED_ASSERTIONS_V155,
    cases:canonicalMatrix.map((item)=>({...item,status:'NOT_EXECUTED',evidence:[],notes:''}))
  };
}
function digest(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');}

if(command==='init'){
  fs.mkdirSync(root,{recursive:true});
  if(!fs.existsSync(evidenceFile))fs.writeFileSync(evidenceFile,JSON.stringify(template(),null,2)+'\n');
  console.log(evidenceFile);
  process.exit(0);
}
if(!fs.existsSync(evidenceFile))throw new Error(`EVIDENCE_NOT_FOUND:${evidenceFile}`);
const evidence=JSON.parse(fs.readFileSync(evidenceFile,'utf8'));
if(evidence.schemaVersion!==2)throw new Error('EVIDENCE_SCHEMA_V2_REQUIRED_REINITIALIZE');
if(evidence.candidateSha!==sha)throw new Error('EVIDENCE_SHA_MISMATCH');
if(!Array.isArray(evidence.cases)||evidence.cases.length!==canonicalMatrix.length)throw new Error('EVIDENCE_MATRIX_INCOMPLETE');

const expectedKeys=new Set(canonicalMatrix.map(caseKey));
const observedKeys=new Set();
for(const item of evidence.cases){
  if(!VALID.has(item.status))throw new Error(`INVALID_STATUS:${item.status}`);
  const key=caseKey(item);
  if(!expectedKeys.has(key))throw new Error(`UNKNOWN_EVIDENCE_CASE:${key}`);
  if(observedKeys.has(key))throw new Error(`DUPLICATE_EVIDENCE_CASE:${key}`);
  observedKeys.add(key);
  if(!Number.isInteger(item.width)||!Number.isInteger(item.height))throw new Error(`VIEWPORT_GEOMETRY_REQUIRED:${key}`);
}
if(observedKeys.size!==expectedKeys.size)throw new Error('EVIDENCE_CASE_COVERAGE_INCOMPLETE');

const counts=Object.fromEntries([...VALID].map((state)=>[state,evidence.cases.filter((item)=>item.status===state).length]));
const byViewport=Object.fromEntries(ERP_E2E_VIEWPORTS_V155.map(({name})=>[
  name,
  Object.fromEntries([...VALID].map((state)=>[state,evidence.cases.filter((item)=>item.viewport===name&&item.status===state).length]))
]));
let verdict='PASS';
if(counts.FAIL)verdict='FAIL';
else if(counts.BLOCKED)verdict='BLOCKED';
else if(counts.NOT_EXECUTED)verdict='NOT_EXECUTED';
const summary={
  issue:155,
  schemaVersion:2,
  candidateSha:sha,
  verdict,
  counts,
  byViewport,
  total:evidence.cases.length,
  expectedTotal:canonicalMatrix.length,
  matrixHash:digest(evidence.cases.map(({route,state,role,viewport,width,height,status})=>({route,state,role,viewport,width,height,status}))),
  checkedAt:new Date().toISOString()
};
fs.mkdirSync(root,{recursive:true});
fs.writeFileSync(summaryFile,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));
if(command==='check'&&verdict!=='PASS')process.exitCode=2;
