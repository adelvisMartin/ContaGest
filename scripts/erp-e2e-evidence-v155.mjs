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

function template(){
  return {
    schemaVersion:1,
    issue:155,
    candidateSha:sha,
    generatedAt:new Date().toISOString(),
    truthState:'NOT_EXECUTED',
    viewports:ERP_E2E_VIEWPORTS_V155,
    assertions:ERP_E2E_REQUIRED_ASSERTIONS_V155,
    cases:buildErpE2EMatrixV155().map((item)=>({...item,status:'NOT_EXECUTED',evidence:[],notes:''}))
  };
}
function stable(value){return JSON.stringify(value,Object.keys(value).sort(),2)}
function digest(value){return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}

if(command==='init'){
  fs.mkdirSync(root,{recursive:true});
  if(!fs.existsSync(evidenceFile))fs.writeFileSync(evidenceFile,JSON.stringify(template(),null,2)+'\n');
  console.log(evidenceFile);
  process.exit(0);
}
if(!fs.existsSync(evidenceFile))throw new Error(`EVIDENCE_NOT_FOUND:${evidenceFile}`);
const evidence=JSON.parse(fs.readFileSync(evidenceFile,'utf8'));
if(evidence.candidateSha!==sha)throw new Error('EVIDENCE_SHA_MISMATCH');
if(!Array.isArray(evidence.cases)||evidence.cases.length!==buildErpE2EMatrixV155().length)throw new Error('EVIDENCE_MATRIX_INCOMPLETE');
for(const item of evidence.cases){if(!VALID.has(item.status))throw new Error(`INVALID_STATUS:${item.status}`);}
const counts=Object.fromEntries([...VALID].map((state)=>[state,evidence.cases.filter((item)=>item.status===state).length]));
let verdict='PASS';
if(counts.FAIL)verdict='FAIL';
else if(counts.BLOCKED)verdict='BLOCKED';
else if(counts.NOT_EXECUTED)verdict='NOT_EXECUTED';
const summary={issue:155,candidateSha:sha,verdict,counts,total:evidence.cases.length,matrixHash:digest(evidence.cases.map(({route,state,role,status})=>({route,state,role,status}))),checkedAt:new Date().toISOString()};
fs.mkdirSync(root,{recursive:true});fs.writeFileSync(summaryFile,JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));
if(command==='check'&&verdict!=='PASS')process.exitCode=2;
