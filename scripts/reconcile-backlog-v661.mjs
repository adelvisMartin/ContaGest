#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const SHA=/^[0-9a-f]{40}$/i;
const github=(url)=>typeof url==='string'&&/^https:\/\/github\.com\/adelvisMartin\/ContaGest\/(issues|pull|actions\/runs|commit)\//.test(url);
const id=(n)=>Number.isInteger(n)&&n>0;
const normalTitle=(title)=>String(title||'').toLowerCase().replace(/\[[^\]]+\]/g,' ').replace(/#\d+/g,' ').replace(/[^a-z0-9áéíóúñ]+/g,' ').trim().replace(/\s+/g,' ');

export function reconcile(snapshot,{baselineSha}={}) {
  const errors=[],fail=(msg)=>errors.push(msg);
  if(snapshot?.schemaVersion!==661||!SHA.test(snapshot?.mainSha||''))fail('RECONCILE_SCHEMA_OR_SHA_INVALID');
  if(baselineSha&&snapshot.mainSha!==baselineSha)fail('RECONCILE_BASELINE_DRIFT');
  for(const field of ['issues','prs','completions','supersessions','branches'])
    if(!Array.isArray(snapshot?.[field]))fail('RECONCILE_REQUIRED_ARRAY:'+field);
  const issues=Array.isArray(snapshot?.issues)?snapshot.issues:[];
  const prs=Array.isArray(snapshot?.prs)?snapshot.prs:[];
  const completed=Array.isArray(snapshot?.completions)?snapshot.completions:[];
  const supersessions=Array.isArray(snapshot?.supersessions)?snapshot.supersessions:[];
  const branches=Array.isArray(snapshot?.branches)?snapshot.branches:[];
  const issueIds=new Set(),titles=new Map(),duplicates=[];
  for(const issue of issues) {
    if(!id(issue?.id)||!String(issue.title||'').trim()||!['OPEN','CLOSED'].includes(issue.state)){
      fail('RECONCILE_ISSUE_INVALID');continue;
    }
    if(issueIds.has(issue.id))fail('RECONCILE_DUPLICATE_ISSUE:'+issue.id);
    issueIds.add(issue.id);
    const title=normalTitle(issue.title);
    if(title.length>=35){
      if(titles.has(title))duplicates.push({issues:[titles.get(title),issue.id],reason:'Same title, domain and criteria need manual review'});
      else titles.set(title,issue.id);
    }
  }
  const prIds=new Set(),owned=new Map(),unownedPrs=[],collisions=[],assignments=[];
  for(const pr of prs) {
    if(!id(pr?.number)||!SHA.test(pr?.headSha||'')){
      fail('RECONCILE_PR_INVALID');continue;
    }
    if(prIds.has(pr.number))fail('RECONCILE_DUPLICATE_PR:'+pr.number);
    prIds.add(pr.number);
    if(pr.issueId===null) {
      unownedPrs.push(pr.number);
      assignments.push({pr:pr.number,owner:'UNCONFIRMED',action:'LINK_EXISTING_ISSUE'});
    }else if(!id(pr.issueId)||!issueIds.has(pr.issueId))fail('RECONCILE_OWNER_NOT_OPEN:'+pr.number);
    else {
      if(owned.has(pr.issueId))collisions.push({issue:pr.issueId,prs:[owned.get(pr.issueId),pr.number]});
      else owned.set(pr.issueId,pr.number);
      assignments.push({pr:pr.number,owner:'issue:'+pr.issueId,action:'REVIEW_PR_EVIDENCE'});
    }
  }
  const completionIds=new Set();
  for(const c of completed){
    if(!id(c.issue)||!SHA.test(c.sha||'')||!github(c.evidenceUrl)||
      (c.pr!==null&&!id(c.pr)))fail('RECONCILE_COMPLETION_EVIDENCE_INVALID');
    if(completionIds.has(c.issue))fail('RECONCILE_DUPLICATE_COMPLETION:'+c.issue);
    completionIds.add(c.issue);
    if(issueIds.has(c.issue))fail('RECONCILE_OPEN_ISSUE_MARKED_COMPLETE:'+c.issue);
  }
  for(const s of supersessions) {
    if(!id(s.duplicate)||!id(s.owner)||s.owner===s.duplicate||!github(s.evidenceUrl))
      fail('RECONCILE_SUPERSESSION_INVALID');
    if(s.status!=='CLOSED'||issueIds.has(s.duplicate))fail('RECONCILE_SUPERSESSION_NOT_CLOSED:'+s.duplicate);
  }
  const obsoleteBranches=[];
  for(const b of branches){
    if(!String(b.name||'').trim()||!SHA.test(b.comparedSha||'')||
      !Number.isInteger(b.ahead)||!Number.isInteger(b.behind)||!Number.isInteger(b.openPrCount)){
      fail('RECONCILE_BRANCH_INVALID');continue;
    }
    obsoleteBranches.push({branch:b.name,classification:b.openPrCount>0||b.ahead>0?'UNMERGED_OR_ACTIVE':
      b.comparedSha!==snapshot.mainSha?'COMPARE_STALE_RECHECK':'CANDIDATE_RECHECK',
      mayDeleteAutomatically:false});
  }
  const unclaimed=issues.filter(i=>i.state==='OPEN'&&!owned.has(i.id)).map(i=>i.id).sort((a,b)=>a-b);
  return {schemaVersion:661,sourceSha:snapshot?.mainSha||null,observedAt:snapshot?.observedAt||null,
    structuralValidation:errors.length?'FAIL':'PASS',
    allReconciled:errors.length===0&&!unclaimed.length&&!unownedPrs.length&&!collisions.length&&!duplicates.length&&!branches.length,
    counts:{openIssues:issues.length,openPrs:prs.length,completedWithEvidence:completed.length,
      supersededReviewed:supersessions.length,unclaimed:unclaimed.length,unownedPrs:unownedPrs.length,
      duplicateCandidates:duplicates.length,claimConflicts:collisions.length,branchReviews:obsoleteBranches.length},
    unclaimedIssues:unclaimed,unownedPrs,assignments,duplicateCandidates:duplicates,
    claimConflicts:collisions,branchReviews:obsoleteBranches,
    completedEvidence:completed,reviewedSupersessions:supersessions,errors,
    action:'MANUAL_REVIEW_ONLY: no issue closure, PR merge, or branch deletion'};
}
function cli(){
  const [inputPath,candidate,baseline,output]=process.argv.slice(2);
  if(!inputPath||!SHA.test(candidate||'')||!SHA.test(baseline||''))throw new Error('Usage: reconcile-backlog-v661 <input.json> <candidate-HEAD-SHA> <baseline-main-SHA> [output.json]');
  if(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==candidate)throw new Error('RECONCILE_CANDIDATE_SHA_MISMATCH');
  const snapshot=JSON.parse(fs.readFileSync(inputPath,'utf8'));
  const report=reconcile(snapshot,{baselineSha:baseline});
  if(report.structuralValidation==='FAIL')throw new Error(report.errors.join(';'));
  if(output){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify({validation:report.structuralValidation,allReconciled:report.allReconciled,
    counts:report.counts,reportPath:output||null}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
  try{cli();}catch(e){console.error('[reconcile-backlog-v661]',e.message);process.exitCode=1;}
