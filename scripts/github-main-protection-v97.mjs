#!/usr/bin/env node
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const policy=JSON.parse(fs.readFileSync('products/erp/release-governance-v97.json','utf8'));
const command=process.argv[2]||'plan';
const full=process.argv.includes('--full');
const repo=policy.repository;
const branch=policy.branch;
const checks=full?policy.requiredChecks.pendingActivationAfterIssue134:policy.requiredChecks.activeNow;

function protectionPayload(){
  return {
    required_status_checks:checks.length?{strict:true,contexts:checks}:null,
    enforce_admins:policy.structural.enforceAdmins,
    required_pull_request_reviews:{
      dismissal_restrictions:{users:[],teams:[]},
      dismiss_stale_reviews:true,
      require_code_owner_reviews:false,
      required_approving_review_count:policy.structural.requiredApprovingReviewCount,
      require_last_push_approval:false
    },
    restrictions:null,
    required_linear_history:false,
    allow_force_pushes:policy.structural.allowForcePushes,
    allow_deletions:policy.structural.allowDeletions,
    block_creations:false,
    required_conversation_resolution:policy.structural.requireConversationResolution,
    lock_branch:false,
    allow_fork_syncing:true
  };
}

function gh(args,input=null){
  const options={encoding:'utf8',stdio:['pipe','pipe','pipe']};
  try{return execFileSync('gh',args,{...options,input:input??undefined}).trim();}
  catch(error){
    const stderr=String(error?.stderr||error?.message||'').trim();
    throw new Error(`GH_COMMAND_FAILED:${stderr}`);
  }
}
function snapshot(){return JSON.parse(gh(['api',`repos/${repo}/branches/${branch}/protection`]));}
function verify(data){
  const failures=[];
  if(!data?.required_pull_request_reviews)failures.push('PR_NOT_REQUIRED');
  if(data?.allow_force_pushes?.enabled!==false)failures.push('FORCE_PUSH_NOT_BLOCKED');
  if(data?.allow_deletions?.enabled!==false)failures.push('DELETE_NOT_BLOCKED');
  if(policy.structural.enforceAdmins&&data?.enforce_admins?.enabled!==true)failures.push('ADMINS_NOT_ENFORCED');
  if(policy.structural.requireConversationResolution&&data?.required_conversation_resolution?.enabled!==true)failures.push('CONVERSATION_RESOLUTION_NOT_REQUIRED');
  if(full){
    const contexts=new Set(data?.required_status_checks?.contexts||data?.required_status_checks?.checks?.map((item)=>item.context)||[]);
    for(const check of checks)if(!contexts.has(check))failures.push(`REQUIRED_CHECK_MISSING:${check}`);
  }
  return {policyVersion:policy.version,repository:repo,branch,profile:full?'full':'structural',verdict:failures.length?'FAIL':'PASS',failures};
}

if(command==='plan'){
  console.log(JSON.stringify({policyVersion:policy.version,profile:full?'full':'structural',endpoint:`repos/${repo}/branches/${branch}/protection`,payload:protectionPayload()},null,2));
  process.exit(0);
}
if(command==='apply'){
  if(full&&!process.argv.includes('--issue-134-recovered')){
    console.error('FULL_PROFILE_REQUIRES_--issue-134-recovered');process.exit(3);
  }
  const payload=JSON.stringify(protectionPayload());
  gh(['api','--method','PUT',`repos/${repo}/branches/${branch}/protection`,'--input','-'],payload);
  const result=verify(snapshot());console.log(JSON.stringify(result,null,2));if(result.verdict!=='PASS')process.exit(2);process.exit(0);
}
if(command==='verify'){
  try{const result=verify(snapshot());console.log(JSON.stringify(result,null,2));if(result.verdict!=='PASS')process.exit(2);}
  catch(error){console.error(String(error.message||error));process.exit(3);}process.exit(0);
}
console.error('Usa plan|apply|verify [--full] [--issue-134-recovered].');process.exit(2);
