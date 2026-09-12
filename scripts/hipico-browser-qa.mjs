import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectExactCandidate } from './hipico-exact-sha-gate.mjs';

const repoRoot=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const suite='qa/hipico-visual-functional-v105.spec.mjs';

function sha256(value){return crypto.createHash('sha256').update(value).digest('hex');}

export function browserEvidence({candidate,status,exitCode,startedAt,finishedAt,error=null}){
  return{
    schemaVersion:1,
    scope:'control-hipico-browser-e2e',
    candidateSha:candidate.candidate,
    branch:candidate.branch,
    dirty:candidate.dirty,
    expectedSha:candidate.expected,
    suite,
    project:'chromium',
    workers:1,
    status,
    exitCode,
    startedAt,
    finishedAt,
    error:error?String(error).slice(0,500):null
  };
}

export function writeBrowserEvidence(root,evidence){
  const dir=join(root,'artifacts','qa','hipico-browser',evidence.candidateSha||'unknown-sha');
  mkdirSync(dir,{recursive:true});
  const json=`${JSON.stringify(evidence,null,2)}\n`;
  const jsonPath=join(dir,'browser-e2e.json');
  writeFileSync(jsonPath,json,'utf8');
  writeFileSync(join(dir,'SHA256SUMS.txt'),`${sha256(json)}  browser-e2e.json\n`,'utf8');
  return jsonPath;
}

export function runBrowserQa({root=repoRoot,env=process.env}={}){
  const candidate=inspectExactCandidate(root,env);
  if(!candidate.ok){
    console.error(`[hipico-browser-qa] BLOCKED ${candidate.reason}`);
    return 2;
  }

  const startedAt=new Date().toISOString();
  const npx=process.platform==='win32'?'npx.cmd':'npx';
  const result=spawnSync(npx,['playwright','test',suite,'--project=chromium','--workers=1'],{
    cwd:root,
    env,
    stdio:'inherit',
    windowsHide:true
  });
  const finishedAt=new Date().toISOString();
  const status=result.error?'BLOCKED':result.status===0?'PASS':'FAIL';
  const exitCode=result.error?2:Number(result.status??1);
  const evidence=browserEvidence({
    candidate,
    status,
    exitCode,
    startedAt,
    finishedAt,
    error:result.error?.message||null
  });
  const evidencePath=writeBrowserEvidence(root,evidence);
  console.log(`[hipico-browser-qa] ${status} ${candidate.candidate} evidence=${evidencePath}`);
  return status==='PASS'?0:status==='BLOCKED'?2:1;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  process.exitCode=runBrowserQa();
}
