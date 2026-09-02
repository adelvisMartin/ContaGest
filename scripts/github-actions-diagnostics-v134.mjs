#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repo=process.env.GITHUB_REPOSITORY||'adelvisMartin/ContaGest';
const candidate=String(process.env.GITHUB_SHA||process.env.GIT_SHA||'').trim();
const outKey=/^[a-f0-9]{40}$/i.test(candidate)?candidate:'unbound';
const outDir=path.resolve('artifacts','qa','actions-v134',outKey);
const probeName='Runner Probe #134';

function ghJson(endpoint){
  try{
    const raw=execFileSync('gh',['api',endpoint],{encoding:'utf8',stdio:['ignore','pipe','pipe'],windowsHide:true});
    return {ok:true,value:JSON.parse(raw)};
  }catch(error){
    const detail=String(error?.stderr||error?.message||'GH_API_FAILED').trim().slice(0,1200);
    return {ok:false,error:detail.replace(/gh[pousr]_[A-Za-z0-9_]+/g,'[REDACTED_TOKEN]')};
  }
}
function sha256(value){return crypto.createHash('sha256').update(value).digest('hex');}

const permissions=ghJson(`repos/${repo}/actions/permissions`);
const workflowPermissions=ghJson(`repos/${repo}/actions/permissions/workflow`);
const runs=ghJson(`repos/${repo}/actions/runs?event=pull_request&per_page=100`);
let probeRun=null;
if(runs.ok){
  probeRun=(runs.value?.workflow_runs||[]).find((run)=>run?.name===probeName)||null;
}
let jobs={ok:false,error:'PROBE_RUN_NOT_FOUND'};
if(probeRun?.id)jobs=ghJson(`repos/${repo}/actions/runs/${probeRun.id}/jobs?per_page=100`);

const probeJobs=jobs.ok?(jobs.value?.jobs||[]):[];
const stepCount=probeJobs.reduce((sum,job)=>sum+(Array.isArray(job.steps)?job.steps.length:0),0);
const assignedRunnerJobs=probeJobs.filter((job)=>Number(job.runner_id||0)>0||String(job.runner_name||'').trim()).length;
const noRunnerJobs=probeJobs.filter((job)=>Number(job.runner_id||0)===0&&!String(job.runner_name||'').trim()&&(!Array.isArray(job.steps)||job.steps.length===0)).length;

const findings=[];
if(permissions.ok&&permissions.value?.enabled===false)findings.push({id:'ACTIONS_DISABLED_AT_REPO',severity:'BLOCKER',ownerAction:'Enable GitHub Actions for the repository.'});
if(!permissions.ok)findings.push({id:'ACTIONS_PERMISSION_READ_UNAVAILABLE',severity:'INFO',detail:permissions.error});
if(!workflowPermissions.ok)findings.push({id:'WORKFLOW_PERMISSION_READ_UNAVAILABLE',severity:'INFO',detail:workflowPermissions.error});
if(!probeRun)findings.push({id:'RUNNER_PROBE_NOT_FOUND',severity:'BLOCKER',ownerAction:'Dispatch or open a PR touching runner-probe-v134.yml.'});
if(probeRun&&probeJobs.length===0)findings.push({id:'PROBE_HAS_NO_JOBS',severity:'BLOCKER'});
if(noRunnerJobs>0)findings.push({id:'GITHUB_HOSTED_RUNNER_NOT_ASSIGNED',severity:'BLOCKER',jobs:noRunnerJobs,ownerAction:'Check account Actions usage/spending limits and GitHub-hosted runner availability/policies. The repository cannot repair this from workflow code.'});
if(assignedRunnerJobs>0&&stepCount>0)findings.push({id:'RUNNER_EXECUTED_STEPS',severity:'PASS',jobs:assignedRunnerJobs,steps:stepCount});

let verdict='UNKNOWN_EXTERNAL';
if(findings.some((item)=>item.id==='ACTIONS_DISABLED_AT_REPO'))verdict='ACTIONS_DISABLED';
else if(findings.some((item)=>item.id==='GITHUB_HOSTED_RUNNER_NOT_ASSIGNED'))verdict='HOSTED_RUNNER_NOT_ASSIGNED';
else if(findings.some((item)=>item.id==='RUNNER_EXECUTED_STEPS'))verdict='RUNNER_EXECUTED';
else if(!probeRun)verdict='PROBE_NOT_AVAILABLE';

const report={
  schemaVersion:1,
  issue:134,
  repository:repo,
  generatedAt:new Date().toISOString(),
  candidateSha:/^[a-f0-9]{40}$/i.test(candidate)?candidate:null,
  verdict,
  repositoryActions:{
    readable:permissions.ok,
    enabled:permissions.ok?permissions.value?.enabled??null:null,
    allowedActions:permissions.ok?permissions.value?.allowed_actions??null:null,
    defaultWorkflowPermissions:workflowPermissions.ok?workflowPermissions.value?.default_workflow_permissions??null:null,
    canApprovePullRequestReviews:workflowPermissions.ok?workflowPermissions.value?.can_approve_pull_request_reviews??null:null
  },
  probe:probeRun?{
    id:probeRun.id,
    status:probeRun.status,
    conclusion:probeRun.conclusion,
    headSha:probeRun.head_sha,
    event:probeRun.event,
    jobs:probeJobs.map((job)=>({id:job.id,name:job.name,status:job.status,conclusion:job.conclusion,runnerId:job.runner_id||0,runnerName:job.runner_name||'',steps:Array.isArray(job.steps)?job.steps.length:0}))
  }:null,
  findings,
  rootCauseProven:verdict==='ACTIONS_DISABLED',
  rootCauseNote:verdict==='HOSTED_RUNNER_NOT_ASSIGNED'
    ? 'The API proves GitHub did not assign a hosted runner. It does not prove whether billing/usage limit, platform capacity, account policy, or another GitHub-side condition is the root cause.'
    : null,
  ownerChecksStillRequired:verdict==='HOSTED_RUNNER_NOT_ASSIGNED'?[
    'GitHub Settings > Billing and licensing / Actions usage and spending limit',
    'Repository Settings > Actions > General',
    'Any account/enterprise policy affecting GitHub-hosted runners',
    'GitHub service status if an incident is active'
  ]:[]
};
fs.mkdirSync(outDir,{recursive:true});
const json=JSON.stringify(report,null,2)+'\n';
fs.writeFileSync(path.join(outDir,'diagnostic.json'),json);
fs.writeFileSync(path.join(outDir,'SHA256SUMS.txt'),`${sha256(json)}  diagnostic.json\n`);
console.log(json.trim());
if(verdict==='RUNNER_EXECUTED')process.exit(0);
if(['HOSTED_RUNNER_NOT_ASSIGNED','ACTIONS_DISABLED','PROBE_NOT_AVAILABLE'].includes(verdict))process.exit(3);
process.exit(2);
