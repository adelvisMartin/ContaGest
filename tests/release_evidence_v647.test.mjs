import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildReleaseEvidence, assertArtifactPath, RC_DIMENSIONS } from '../scripts/release-evidence-v647.mjs';

const SHA='a'.repeat(40);
const OTHER='b'.repeat(40);
const sha256=value=>createHash('sha256').update(value).digest('hex');

function fixture({local=true,remoteCi='BLOCKED_INFRASTRUCTURE',deploy='NOT_EXECUTED',physical='NOT_EXECUTED'}={}) {
  const blobs=new Map();
  const proof=(label)=>{
    const path='artifacts/evidence/v647/'+label+'.json';
    const bytes=Buffer.from(JSON.stringify({candidateSha:SHA,label,exitCode:0}));
    blobs.set(path,bytes);
    return {path,candidateSha:SHA,gateId:label,sha256:sha256(bytes)};
  };
  const checks={};
  for(const key of RC_DIMENSIONS){
    const status=key==='REMOTE_CI'?remoteCi:key==='REMOTE_DEPLOY'?deploy
      :key==='PHYSICAL_EXTERNAL'?physical:local?'PASS':'NOT_EXECUTED';
    checks[key]={status,...(status==='PASS'?{proofs:[proof(key.toLowerCase())]}:{})};
  }
  const input={schemaVersion:647,candidateSha:SHA,githubActionsQuotaException:true,
    checks,backlog:{candidateSha:SHA,openP0:[],openP1:[],
      proof:proof('github-backlog-exact-sha')}};
  return {input,blobs,loadArtifact:p=>blobs.get(p)};
}

test('#647 default absent gates never become ready',()=>{
  const f=fixture({local:false});
  const r=buildReleaseEvidence(f.input,{candidateSha:SHA,loadArtifact:f.loadArtifact});
  assert.equal(r.localReady,false);
  assert.equal(r.productionReady,false);
  assert.equal(r.localDecision,'NOT_READY');
  assert.equal(r.checks.LOCAL_POSTGRES.status,'NOT_EXECUTED');
  assert.equal(r.backlog.verifiedArtifact,true);
  assert.match(r.reportSha256,/^[a-f0-9]{64}$/);
});

test('#647 locally green checks can be reported without forging Vercel, physical QA or GH Actions',()=>{
  const f=fixture();
  const r=buildReleaseEvidence(f.input,{candidateSha:SHA,loadArtifact:f.loadArtifact});
  assert.equal(r.localReady,true);
  assert.equal(r.localDecision,'LOCAL_CANDIDATE_READY');
  assert.equal(r.productionReady,false);
  assert.equal(r.productionDecision,'NOT_READY');
  assert.equal(r.provider.ci,'BLOCKED_INFRASTRUCTURE');
  assert.equal(r.provider.deploy,'NOT_EXECUTED');
  assert.equal(r.physical,'NOT_EXECUTED');
  assert.equal(r.checks.REMOTE_CI.status,'BLOCKED_INFRASTRUCTURE');
});

test('#647 production readiness demands positive provider deployment and completed external QA',()=>{
  const f=fixture({remoteCi:'PASS',deploy:'PASS',physical:'PASS'});
  const r=buildReleaseEvidence(f.input,{candidateSha:SHA,loadArtifact:f.loadArtifact});
  assert.equal(r.productionReady,true);
  assert.equal(r.productionDecision,'PRODUCTION_READY');
  assert.equal(r.findings.length,0);
});

test('#647 false PASS or missing artifact cannot be interpreted as evidence',()=>{
  const f=fixture();
  f.input.checks.LOCAL_POSTGRES={status:'PASS'};
  assert.throws(()=>buildReleaseEvidence(f.input,{candidateSha:SHA,loadArtifact:f.loadArtifact}),/PASS_WITHOUT_PROOF_LOCAL_POSTGRES/);
  const g=fixture();
  g.blobs.delete(g.input.checks.LOCAL_BUILD.proofs[0].path);
  assert.throws(()=>buildReleaseEvidence(g.input,{candidateSha:SHA,loadArtifact:g.loadArtifact}),/PROOF_FILE_INVALID/);
});

test('#647 rejects a file whose SHA-256 does not match the evidence declaration',()=>{
  const f=fixture();
  f.blobs.set(f.input.checks.LOCAL_UNIT.proofs[0].path,Buffer.from('tampered-but-not-empty'));
  assert.throws(()=>buildReleaseEvidence(f.input,{candidateSha:SHA,loadArtifact:f.loadArtifact}),/PROOF_CONTENT_DIGEST_MISMATCH/);
});

test('#647 forbids cross-candidate claims, file traversal and unbound filenames',()=>{
  const f=fixture();
  assert.throws(()=>buildReleaseEvidence(f.input,{candidateSha:OTHER,loadArtifact:f.loadArtifact}),/CANDIDATE_SHA_OR_SCHEMA_MISMATCH/);
  f.input.checks.LOCAL_BUILD.proofs[0].candidateSha=OTHER;
  assert.throws(()=>buildReleaseEvidence(f.input,{candidateSha:SHA,loadArtifact:f.loadArtifact}),/PROOF_SHA_OR_DIGEST_INVALID/);
  for(const p of ['../secrets.txt','/etc/passwd','artifacts/../.env','artifacts/a//b','artifacts/a?token=value','artifacts/a/./b']){
    assert.throws(()=>assertArtifactPath(p),/ARTIFACT_PATH_DENIED/);
  }
});

test('#647 does not allow identical generic artifact to impersonate independent required gate results',()=>{
  const f=fixture();
  f.input.checks.LOCAL_POSTGRES.proofs[0]=f.input.checks.LOCAL_BUILD.proofs[0];
  assert.throws(()=>buildReleaseEvidence(f.input,{candidateSha:SHA,loadArtifact:f.loadArtifact}),/DUPLICATE_PROOF_PATH/);
});

test('#647 infrastructure quota blockers apply only to external categories, never DB or browser',()=>{
  const f=fixture();
  f.input.checks.LOCAL_POSTGRES={status:'BLOCKED_INFRASTRUCTURE'};
  assert.throws(()=>buildReleaseEvidence(f.input,{candidateSha:SHA,loadArtifact:f.loadArtifact}),/INFRA_BLOCKER_ON_LOCAL_GATE_LOCAL_POSTGRES/);
  const g=fixture({remoteCi:'BLOCKED_INFRASTRUCTURE',deploy:'PASS',physical:'PASS'});
  g.input.githubActionsQuotaException=false;
  const r=buildReleaseEvidence(g.input,{candidateSha:SHA,loadArtifact:g.loadArtifact});
  assert.equal(r.productionReady,false);
});

test('#647 unknown required check or unknown status fails closed',()=>{
  const f=fixture();
  f.input.checks.FAKE_GATE={status:'PASS'};
  assert.throws(()=>buildReleaseEvidence(f.input,{candidateSha:SHA,loadArtifact:f.loadArtifact}),/UNKNOWN_DIMENSION_FAKE_GATE/);
  const g=fixture();
  g.input.checks.LOCAL_STATIC.status='SKIPPED';
  assert.throws(()=>buildReleaseEvidence(g.input,{candidateSha:SHA,loadArtifact:g.loadArtifact}),/INVALID_STATUS_LOCAL_STATIC/);
});

test('#647 open P0 and unapproved P1 do not yield local release candidate readiness',()=>{
  const f=fixture();
  f.input.backlog.openP0=[119];
  assert.equal(buildReleaseEvidence(f.input,{candidateSha:SHA,loadArtifact:f.loadArtifact}).localReady,false);
  const g=fixture();
  g.input.backlog.openP1=[{issue:638,disposition:'blocking',owner:'security-team'}];
  assert.equal(buildReleaseEvidence(g.input,{candidateSha:SHA,loadArtifact:g.loadArtifact}).localReady,false);
  const h=fixture();
  h.input.backlog.openP1=[{issue:638,disposition:'risk_accepted',owner:'release-team',reason:'too short'}];
  assert.throws(()=>buildReleaseEvidence(h.input,{candidateSha:SHA,loadArtifact:h.loadArtifact}),/UNAUTHORIZED_P1_RISK_ACCEPTANCE/);
});

test('#647 qualified P1 risk needs explicit documented approval and stable hashed report',()=>{
  const f=fixture();
  f.input.backlog.openP1=[{issue:765,disposition:'risk_accepted',
    reason:'Explicit bounded risk with an owner and verification task still tracked.',
    owner:'release-team',approvedBy:'responsible-owner'}];
  const one=buildReleaseEvidence(f.input,{candidateSha:SHA,loadArtifact:f.loadArtifact});
  const two=buildReleaseEvidence(f.input,{candidateSha:SHA,loadArtifact:f.loadArtifact});
  assert.equal(one.localReady,true);
  assert.equal(one.reportSha256,two.reportSha256);
  assert.equal(JSON.stringify(one).includes('responsible-owner'),false);
  assert.equal(one.backlog.reviewedP1,1);
});
