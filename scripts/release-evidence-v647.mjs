#!/usr/bin/env node
// #647. Read-only reporter over immutable local evidence. The v75 manifest and
// original gate executors remain the release authorities.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const RC_DIMENSIONS=Object.freeze([
  'SOURCE_REVIEW','LOCAL_STATIC','LOCAL_UNIT','LOCAL_INTEGRATION',
  'LOCAL_POSTGRES','LOCAL_BUILD','LOCAL_BROWSER_E2E','REMOTE_CI',
  'REMOTE_DEPLOY','PHYSICAL_EXTERNAL'
]);
const REQUIRED_LOCAL=Object.freeze(RC_DIMENSIONS.slice(0,7));
const VALID=new Set(['PASS','FAIL','BLOCKED','NOT_EXECUTED','BLOCKED_INFRASTRUCTURE']);
const SHA=/^[a-f0-9]{40}$/i;
const DIGEST=/^[a-f0-9]{64}$/i;
const SAFE_ARTIFACT=/^artifacts\/[a-zA-Z0-9._/-]+$/;
const VALID_DISPOSITION=new Set(['blocking','risk_accepted']);
const sha256=(value)=>createHash('sha256').update(value).digest('hex');
const isObj=(o)=>Boolean(o)&&typeof o==='object'&&!Array.isArray(o);
const problem=(id)=>{throw new Error('RC647_'+id);};

export function assertArtifactPath(value) {
  if(typeof value!=='string'||!SAFE_ARTIFACT.test(value)||
    value.split('/').some(part=>!part||part==='.'||part==='..'))problem('ARTIFACT_PATH_DENIED');
  return value;
}

export function verifyProof(proof,sha,loadArtifact) {
  if(!isObj(proof)||proof.candidateSha!==sha||!DIGEST.test(String(proof.sha256||'')))
    problem('PROOF_SHA_OR_DIGEST_INVALID');
  const location=assertArtifactPath(proof.path);
  if(!/^[a-z0-9][a-z0-9._:-]{2,79}$/i.test(String(proof.gateId||'')))
    problem('PROOF_GATE_ID_INVALID');
  const bytes=loadArtifact(location);
  if(!Buffer.isBuffer(bytes)||bytes.length===0||bytes.length>64*1024*1024)
    problem('PROOF_FILE_INVALID');
  if(sha256(bytes)!==String(proof.sha256).toLowerCase())
    problem('PROOF_CONTENT_DIGEST_MISMATCH');
  return {path:location,sha256:String(proof.sha256).toLowerCase(),gateId:proof.gateId};
}

export function buildReleaseEvidence(source,{candidateSha,loadArtifact}={}) {
  if(!SHA.test(candidateSha||'')||!isObj(source)||source.schemaVersion!==647||
    source.candidateSha!==candidateSha)problem('CANDIDATE_SHA_OR_SCHEMA_MISMATCH');
  if(typeof loadArtifact!=='function')problem('PROOF_LOADER_REQUIRED');
  if(!isObj(source.checks))problem('CHECKS_REQUIRED');
  for(const k of Object.keys(source.checks))
    if(!RC_DIMENSIONS.includes(k))problem('UNKNOWN_DIMENSION_'+k);
  const checked=new Set();
  const findings=[];
  const checks={};
  for(const key of RC_DIMENSIONS){
    const gate=source.checks[key]||{status:'NOT_EXECUTED'};
    if(!isObj(gate)||!VALID.has(gate.status))problem('INVALID_STATUS_'+key);
    if(gate.status==='BLOCKED_INFRASTRUCTURE'&&!['REMOTE_CI','REMOTE_DEPLOY'].includes(key))
      problem('INFRA_BLOCKER_ON_LOCAL_GATE_'+key);
    if(gate.status==='PASS'&&(!Array.isArray(gate.proofs)||!gate.proofs.length))
      problem('PASS_WITHOUT_PROOF_'+key);
    if(gate.proofs!==undefined&&!Array.isArray(gate.proofs))problem('PROOFS_NOT_ARRAY_'+key);
    const proofs=(gate.proofs||[]).map(proof=>verifyProof(proof,candidateSha,loadArtifact));
    for(const proof of proofs){
      if(checked.has(proof.path))problem('DUPLICATE_PROOF_PATH');
      checked.add(proof.path);
    }
    checks[key]={status:gate.status,proofs};
    if(gate.status!=='PASS')findings.push({dimension:key,status:gate.status});
  }

  let backlogValid=false,blockers=[],p1=[];
  if(isObj(source.backlog)){
    const b=source.backlog;
    if(b.candidateSha!==candidateSha||!Array.isArray(b.openP0)||
      !Array.isArray(b.openP1)||!isObj(b.proof))problem('BACKLOG_STRUCTURE_INVALID');
    const proof=verifyProof(b.proof,candidateSha,loadArtifact);
    if(checked.has(proof.path))problem('DUPLICATE_PROOF_PATH');
    backlogValid=true;
    blockers=b.openP0.map(id=>{
      if(!Number.isInteger(id)||id<1)problem('BACKLOG_P0_INVALID');
      return id;
    });
    const seen=new Set();
    p1=b.openP1.map(item=>{
      if(!isObj(item)||!Number.isInteger(item.issue)||item.issue<1||
        seen.has(item.issue)||!VALID_DISPOSITION.has(item.disposition)||
        typeof item.owner!=='string'||item.owner.trim().length<2)
        problem('BACKLOG_P1_INVALID');
      seen.add(item.issue);
      if(item.disposition==='risk_accepted'&&
        (typeof item.reason!=='string'||item.reason.trim().length<20||
         typeof item.approvedBy!=='string'||item.approvedBy.trim().length<2))
        problem('UNAUTHORIZED_P1_RISK_ACCEPTANCE');
      // Never include free-text approval notes in public report (possible PII).
      return {issue:item.issue,disposition:item.disposition};
    });
    if(new Set(blockers).size!==blockers.length)problem('BACKLOG_P0_DUPLICATE');
    checked.add(proof.path);
  }

  const p1Blocking=p1.filter(x=>x.disposition==='blocking').map(x=>x.issue);
  const backlogReady=backlogValid&&blockers.length===0&&p1Blocking.length===0;
  const localGatesReady=REQUIRED_LOCAL.every(k=>checks[k].status==='PASS');
  const localReady=localGatesReady&&backlogReady;
  const ciStatus=checks.REMOTE_CI.status;
  const quotaException=source.githubActionsQuotaException===true;
  const ciAcceptable=ciStatus==='PASS'||(ciStatus==='BLOCKED_INFRASTRUCTURE'&&quotaException);
  const productionReady=localReady&&ciAcceptable&&
    checks.REMOTE_DEPLOY.status==='PASS'&&checks.PHYSICAL_EXTERNAL.status==='PASS';
  const evidence={
    schemaVersion:647,candidateSha,
    ownership:'read-only-reporter; canonical release gate: scripts/release-candidate-v75.mjs',
    localReady,productionReady,
    localDecision:localReady?'LOCAL_CANDIDATE_READY':'NOT_READY',
    productionDecision:productionReady?'PRODUCTION_READY':'NOT_READY',
    provider:{ci:ciStatus,ciQuotaException:quotaException,
      deploy:checks.REMOTE_DEPLOY.status},
    physical:checks.PHYSICAL_EXTERNAL.status,
    backlog:{verifiedArtifact:backlogValid,openP0:blockers,blockingP1:p1Blocking,
      reviewedP1:p1.length},
    checks,findings
  };
  return {...evidence,reportSha256:sha256(JSON.stringify(evidence))};
}

export function loadLocalProof(repoRoot,relative) {
  assertArtifactPath(relative);
  const root=realpathSync(repoRoot);
  const full=realpathSync(path.resolve(root,relative));
  if(!full.startsWith(root+path.sep))problem('PROOF_ESCAPES_WORKTREE');
  if(!statSync(full).isFile())problem('PROOF_NOT_FILE');
  return readFileSync(full);
}

async function main() {
  const args=process.argv.slice(2),arg=(key)=>args[args.indexOf(key)+1];
  if(args.length!==4||!args.includes('--input')||!args.includes('--sha'))
    problem('USAGE_EXPECT_INPUT_AND_SHA');
  const expectedSha=arg('--sha'),input=arg('--input');
  if(!SHA.test(expectedSha||''))problem('EXPECTED_SHA_INVALID');
  const actual=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  if(expectedSha!==actual)problem('WORKTREE_SHA_MISMATCH');
  const dirty=execFileSync('git',['diff','--name-only','HEAD','--'],{encoding:'utf8'}).trim();
  if(dirty)problem('SOURCE_WORKTREE_DIRTY');
  const repoRoot=process.cwd();
  const document=JSON.parse(loadLocalProof(repoRoot,input).toString('utf8'));
  const report=buildReleaseEvidence(document,{
    candidateSha:expectedSha,
    loadArtifact:(location)=>loadLocalProof(repoRoot,location)
  });
  const dest=path.join(repoRoot,'artifacts','release','v647',expectedSha);
  mkdirSync(dest,{recursive:true});
  writeFileSync(path.join(dest,'manifest.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({sha:expectedSha,localDecision:report.localDecision,
    productionDecision:report.productionDecision,reportSha256:report.reportSha256}));
  if(!report.productionReady)process.exitCode=2;
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  main().catch(error=>{
    const message=String(error?.message||'RC647_FAILED');
    console.error(/^RC647_[A-Z0-9_]+$/.test(message)?message:'RC647_FAILED');
    process.exitCode=1;
  });
}
