import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateServedMobileRelease } from '../qa/support/erp-mobile-release-v182.mjs';
import { MODULE_VISUAL_CATALOG } from '../qa/support/module-visual-catalog.mjs';

const arg=(name)=>process.argv.find((item)=>item.startsWith(`--${name}=`))?.slice(name.length+3);
const command=process.argv[2]||'status';
const candidateSha=String(process.env.CANDIDATE_SHA||arg('sha')||'').trim().toLowerCase();
const baseUrl=String(process.env.ERP_PRODUCTION_URL||arg('base-url')||'').trim().replace(/\/$/,'');
if(!/^[a-f0-9]{40}$/.test(candidateSha))throw new Error('CANDIDATE_SHA_REQUIRED_40_HEX');
const root=path.resolve('artifacts/qa/erp-mobile-v182',candidateSha);
const evidenceFile=path.join(root,'evidence.json');
const template={schemaVersion:1,issue:182,candidateSha,baseUrl:baseUrl||null,buildInfo:null,serviceWorker:{status:'NOT_EXECUTED',evidence:[]},installUpgrade:{status:'NOT_EXECUTED',evidence:[]},routes:MODULE_VISUAL_CATALOG.map(({route})=>({route,status:'NOT_EXECUTED',widths:[],evidence:[]})),notes:''};

if(command==='init'){
  fs.mkdirSync(root,{recursive:true});
  if(!fs.existsSync(evidenceFile))fs.writeFileSync(evidenceFile,JSON.stringify(template,null,2)+'\n');
  console.log(evidenceFile);process.exit(0);
}
let evidence=fs.existsSync(evidenceFile)?JSON.parse(fs.readFileSync(evidenceFile,'utf8')):template;
if(evidence.candidateSha!==candidateSha)throw new Error('EVIDENCE_SHA_MISMATCH');
if(command==='probe'){
  if(!baseUrl)throw new Error('ERP_PRODUCTION_URL_REQUIRED');
  const response=await fetch(`${baseUrl}/build-info.json?qa=${Date.now()}`,{headers:{'Cache-Control':'no-cache','Pragma':'no-cache'},cache:'no-store',signal:AbortSignal.timeout(15_000)});
  if(!response.ok)throw new Error(`BUILD_INFO_HTTP_${response.status}`);
  evidence={...evidence,baseUrl,buildInfo:await response.json(),probedAt:new Date().toISOString()};
  fs.mkdirSync(root,{recursive:true});fs.writeFileSync(evidenceFile,JSON.stringify(evidence,null,2)+'\n');
}
const result=evaluateServedMobileRelease(evidence);
const summary={...result,baseUrl:evidence.baseUrl||baseUrl||null,policyVersion:'erp-mobile-release-v182.1',checkedAt:new Date().toISOString(),evidenceHash:crypto.createHash('sha256').update(JSON.stringify(evidence)).digest('hex')};
fs.mkdirSync(root,{recursive:true});fs.writeFileSync(path.join(root,'summary.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary));
if(command==='check'&&summary.verdict!=='PASS')process.exitCode=2;
