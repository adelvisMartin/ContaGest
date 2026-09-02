#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
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
  try{return execFileSync('gh',args,{encoding:'utf8',stdio:['pipe','pipe','pipe'],input:input??undefined,windowsHide:true}).trim();}
  catch(error){throw new Error(`GH_COMMAND_FAILED:${String(error?.stderr||error?.message||'').trim().replace(/gh[pousr]_[A-Za-z0-9_]+/g,'[REDACTED_TOKEN]')}`);}
}
function gitSha(){
  const env=String(process.env.GITHUB_SHA||process.env.GIT_SHA||'').trim();
  if(/^[a-f0-9]{40}$/i.test(env))return env.toLowerCase();
  try{return execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim().toLowerCase();}catch{return 'UNBOUND';}
}
function sha256(value){return crypto.createHash('sha256').update(value).digest('hex');}
function snapshot(){return JSON.parse(gh(['api',`repos/${repo}/branches/${branch}/protection`]));}
function branchMetadata(){return JSON.parse(gh(['api',`repos/${repo}/branches/${branch}`]));}
function verify(data,branchData=null){
  const failures=[];
  if(branchData&&branchData.protected!==true)failures.push('BRANCH_NOT_PROTECTED');
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
function writeEvidence({phase,verification,protection,branchData,before=null}){
  const candidateSha=gitSha();
  const key=/^[a-f0-9]{40}$/i.test(candidateSha)?candidateSha:'unbound';
  const dir=path.resolve('artifacts','qa','release-governance-v97',key);
  fs.mkdirSync(dir,{recursive:true});
  const report={
    schemaVersion:1,
    issue:97,
    generatedAt:new Date().toISOString(),
    candidateSha:/^[a-f0-9]{40}$/i.test(candidateSha)?candidateSha:null,
    phase,
    repository:repo,
    branch,
    profile:full?'full':'structural',
    verification,
    branchProtected:branchData?.protected===true,
    requiredStatusChecks:protection?.required_status_checks||null,
    requiredPullRequestReviews:protection?.required_pull_request_reviews||null,
    enforceAdmins:protection?.enforce_admins||null,
    conversationResolution:protection?.required_conversation_resolution||null,
    allowForcePushes:protection?.allow_force_pushes||null,
    allowDeletions:protection?.allow_deletions||null,
    before
  };
  const json=JSON.stringify(report,null,2)+'\n';
  fs.writeFileSync(path.join(dir,'protection-evidence.json'),json);
  fs.writeFileSync(path.join(dir,'SHA256SUMS.txt'),`${sha256(json)}  protection-evidence.json\n`);
  return path.relative(process.cwd(),dir);
}
function readCurrent(){
  const protection=snapshot();
  const branchData=branchMetadata();
  const verification=verify(protection,branchData);
  return {protection,branchData,verification};
}

if(command==='plan'){
  console.log(JSON.stringify({issue:97,profile:full?'full':'structural',endpoint:`repos/${repo}/branches/${branch}/protection`,payload:protectionPayload()},null,2));
  process.exit(0);
}
if(command==='apply'){
  if(full&&!process.argv.includes('--issue-134-recovered')){console.error('FULL_PROFILE_REQUIRES_--issue-134-recovered');process.exit(3);}
  let before=null;
  try{
    const current=readCurrent();
    before={branchProtected:current.branchData?.protected===true,verification:current.verification};
  }catch{
    before={branchProtected:false,verification:{verdict:'NOT_PROTECTED_OR_UNREADABLE'}};
  }
  const payload=JSON.stringify(protectionPayload());
  gh(['api','--method','PUT',`repos/${repo}/branches/${branch}/protection`,'--input','-'],payload);
  const current=readCurrent();
  const evidenceDir=writeEvidence({phase:'apply',...current,before});
  console.log(JSON.stringify({...current.verification,evidenceDir},null,2));
  if(current.verification.verdict!=='PASS')process.exit(2);
  process.exit(0);
}
if(command==='verify'){
  try{
    const current=readCurrent();
    const evidenceDir=writeEvidence({phase:'verify',...current});
    console.log(JSON.stringify({...current.verification,evidenceDir},null,2));
    if(current.verification.verdict!=='PASS')process.exit(2);
  }catch(error){
    console.error(String(error?.message||error));
    process.exit(3);
  }
  process.exit(0);
}
if(command==='snapshot'){
  try{
    const current=readCurrent();
    const evidenceDir=writeEvidence({phase:'snapshot',...current});
    console.log(JSON.stringify({...current.verification,evidenceDir},null,2));
    process.exit(current.verification.verdict==='PASS'?0:2);
  }catch(error){
    console.error(String(error?.message||error));
    process.exit(3);
  }
}
console.error('Usa plan|apply|verify|snapshot [--full] [--issue-134-recovered].');process.exit(2);
