#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const structural=JSON.parse(fs.readFileSync('ops/github/main-branch-protection-v97.json','utf8'));
const governance=JSON.parse(fs.readFileSync('ops/github/main-release-governance-v97.json','utf8'));
const command=process.argv[2]||'plan';
const full=process.argv.includes('--full');
const repo=governance.repository;
const branch=governance.targetBranch;
const ciContext='ContaGest CI / validate';

function protectionPayload(){
  const payload=structuredClone(structural);
  if(full)payload.required_status_checks={strict:true,contexts:[ciContext]};
  return payload;
}
function gh(args,input=null){
  try{return execFileSync('gh',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],input:input??undefined}).trim();}
  catch(error){throw new Error(`GH_COMMAND_FAILED:${String(error?.stderr||error?.message||'').trim()}`);}
}
function snapshot(){return JSON.parse(gh(['api',`repos/${repo}/branches/${branch}/protection`]));}
function verify(data){
  const failures=[];
  if(!data?.required_pull_request_reviews)failures.push('PR_NOT_REQUIRED');
  if(data?.allow_force_pushes?.enabled!==false)failures.push('FORCE_PUSH_NOT_BLOCKED');
  if(data?.allow_deletions?.enabled!==false)failures.push('DELETE_NOT_BLOCKED');
  if(structural.enforce_admins===true&&data?.enforce_admins?.enabled!==true)failures.push('ADMINS_NOT_ENFORCED');
  if(structural.required_conversation_resolution===true&&data?.required_conversation_resolution?.enabled!==true)failures.push('CONVERSATION_RESOLUTION_NOT_REQUIRED');
  if(full){
    const contexts=new Set([...(data?.required_status_checks?.contexts||[]),...(data?.required_status_checks?.checks||[]).map((item)=>item?.context).filter(Boolean)]);
    if(!contexts.has(ciContext))failures.push(`REQUIRED_CHECK_MISSING:${ciContext}`);
  }
  return {issue:97,repository:repo,branch,profile:full?'full':'structural',verdict:failures.length?'FAIL':'PASS',failures};
}

if(command==='plan'){
  console.log(JSON.stringify({issue:97,profile:full?'full':'structural',endpoint:`repos/${repo}/branches/${branch}/protection`,payload:protectionPayload()},null,2));
  process.exit(0);
}
if(command==='apply'){
  if(full&&!process.argv.includes('--issue-134-recovered')){console.error('FULL_PROFILE_REQUIRES_--issue-134-recovered');process.exit(3);}
  const payload=JSON.stringify(protectionPayload());
  gh(['api','--method','PUT',`repos/${repo}/branches/${branch}/protection`,'--input','-'],payload);
  const result=verify(snapshot());console.log(JSON.stringify(result,null,2));if(result.verdict!=='PASS')process.exit(2);process.exit(0);
}
if(command==='verify'){
  try{const result=verify(snapshot());console.log(JSON.stringify(result,null,2));if(result.verdict!=='PASS')process.exit(2);}
  catch(error){console.error(String(error?.message||error));process.exit(3);}process.exit(0);
}
console.error('Usa plan|apply|verify [--full] [--issue-134-recovered].');process.exit(2);
