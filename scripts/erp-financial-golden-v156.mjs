import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateGoldenDataset, loadGoldenDataset } from '../qa/erp-financial-golden-v156.mjs';

const sha=String(process.env.CANDIDATE_SHA||process.argv.find((arg)=>arg.startsWith('--sha='))?.split('=')[1]||'').trim();
if(!/^[a-f0-9]{40}$/i.test(sha))throw new Error('CANDIDATE_SHA_REQUIRED_40_HEX');
const data=loadGoldenDataset();
const result=evaluateGoldenDataset(data);
const payload={issue:156,candidateSha:sha,truthState:result.pass?'PASS':'FAIL',synthetic:true,datasetVersion:result.datasetVersion,checks:result.checks,ledger:result.ledger,generatedAt:new Date().toISOString()};
const root=path.resolve('artifacts/qa/erp-financial-v156',sha);fs.mkdirSync(root,{recursive:true});
const file=path.join(root,'golden-summary.json');fs.writeFileSync(file,JSON.stringify(payload,null,2)+'\n');
const hash=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');fs.writeFileSync(path.join(root,'SHA256SUMS'),`${hash}  golden-summary.json\n`);
console.log(JSON.stringify(payload));
if(!result.pass)process.exitCode=2;
