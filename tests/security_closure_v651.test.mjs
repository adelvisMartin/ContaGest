import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildSecurityClosure, validateSecurityCatalog, validateArtifactPath} from '../scripts/security-closure-v651.mjs';
const catalog=JSON.parse(readFileSync(new URL('../config/security-closure-v651.json',import.meta.url),'utf8'));
const SHA='a'.repeat(40),OTHER='b'.repeat(40);
function fixture(){
  const blobs=new Map();
  const proof=(gate)=>{
    const path=`artifacts/security/651/${gate.replace(/[^a-z0-9-]/gi,'-')}.json`;
    const bytes=Buffer.from(JSON.stringify({candidateSha:SHA,gate,executed:true,exitCode:0}));
    blobs.set(path,bytes);
    return {path,gateId:gate,candidateSha:SHA,sha256:createHash('sha256').update(bytes).digest('hex')};
  };
  const controls={};
  for (const c of catalog.controls){controls[c.id]={status:'PASS',proofs:Object.fromEntries(c.checks.map(check=>[check,proof(`${c.id}:${check}`)]))};}
  const input={schemaVersion:651,candidateSha:SHA,controls,backlog:{openBlockers:[],proof:proof('security-backlog:current-issues')}};
  return {input,blobs,proof,loadArtifact:path=>blobs.get(path)};
}
const evaluate=f=>buildSecurityClosure(catalog,f.input,{candidateSha:SHA,loadArtifact:f.loadArtifact});
test('catalog enumerates ten independent owned boundaries',()=>{const c=validateSecurityCatalog(catalog);assert.equal(c.length,10);assert.equal(new Set(c.map(x=>x.id)).size,10)});
test('missing all evidence fails closed and is not release proof',()=>{const r=buildSecurityClosure(catalog,{schemaVersion:651,candidateSha:SHA,controls:{}},{candidateSha:SHA,loadArtifact:()=>undefined});assert.equal(r.ready,false);assert.equal(r.findings.length,10);assert.equal(r.backlog.verified,false)});
test('fully provided synthetic fixture can validate proof protocol, not production',()=>{const r=evaluate(fixture());assert.equal(r.ready,true);assert.equal(r.findings.length,0);assert.match(r.reportSha256,/^[a-f0-9]{64}$/)});
test('stale exact SHA fails closed',()=>{const f=fixture();assert.throws(()=>buildSecurityClosure(catalog,f.input,{candidateSha:OTHER,loadArtifact:f.loadArtifact}),/EVIDENCE_HEADER_INVALID/);f.input.controls['media-bola'].proofs['object-authorization'].candidateSha=OTHER;assert.throws(()=>evaluate(f),/PROOF_METADATA_INVALID/)});
test('PASS without independent gate evidence fails closed',()=>{const f=fixture();delete f.input.controls['media-bola'].proofs['object-authorization'];assert.throws(()=>evaluate(f),/CHECK_COVERAGE_INCOMPLETE/)});
test('false proof digest and missing file are rejected',()=>{const a=fixture();a.input.controls['media-bola'].proofs['object-authorization'].sha256='0'.repeat(64);assert.throws(()=>evaluate(a),/PROOF_DIGEST_MISMATCH/);const b=fixture();b.blobs.clear();assert.throws(()=>evaluate(b),/PROOF_UNAVAILABLE/)});
test('a proof cannot impersonate a distinct security check',()=>{const f=fixture();f.input.controls['media-bola'].proofs['object-authorization'].gateId='media-bola:tenant-a-b-negative';assert.throws(()=>evaluate(f),/PROOF_METADATA_INVALID/)});
test('different controls cannot reuse an evidence artifact',()=>{const f=fixture();f.input.controls['media-bola'].proofs['tenant-a-b-negative'].path=f.input.controls['media-bola'].proofs['object-authorization'].path;assert.throws(()=>evaluate(f),/DUPLICATE_PROOF/)});
test('files outside artifacts or traversal segments forbidden',()=>{for(const path of ['../.env','/etc/shadow','artifacts/../.env','artifacts/a//b','artifacts/a/./b','artifacts/a?token=abc'])assert.throws(()=>validateArtifactPath(path),/UNSAFE_ARTIFACT_PATH/)});
test('open security blocker prevents ready even with green synthetic proofs',()=>{const f=fixture();f.input.backlog.openBlockers=[569];const r=evaluate(f);assert.equal(r.ready,false);assert.equal(r.backlog.openBlockerCount,1)});
test('missing backlog evidence cannot produce ready',()=>{const f=fixture();delete f.input.backlog;assert.equal(evaluate(f).ready,false);const g=fixture();g.input.backlog.proof.sha256='0'.repeat(64);assert.throws(()=>evaluate(g),/PROOF_DIGEST_MISMATCH/)});
test('no test result may convert blocked or NOT_EXECUTED into PASS',()=>{for(const status of ['BLOCKED','NOT_EXECUTED','FAIL']){const f=fixture();f.input.controls['media-bola']={status};const r=evaluate(f);assert.equal(r.ready,false);assert.equal(r.findings[0].status,status)}});
test('NOT_APPLICABLE cannot silently waive required security control',()=>{const f=fixture();f.input.controls['media-bola']={status:'NOT_APPLICABLE'};assert.throws(()=>evaluate(f),/UNAPPROVED_EXCLUSION/);f.input.controls['media-bola']={status:'NOT_APPLICABLE',approvedBy:'security-reviewer',reason:'Feature is not installed in the certified target build.'};assert.equal(evaluate(f).ready,false)});
test('unknown control, unknown status or missing owner fails closed',()=>{const f=fixture();f.input.controls.mystery={status:'PASS'};assert.throws(()=>evaluate(f),/UNOWNED_CONTROL/);const g=fixture();g.input.controls['media-bola'].status='QUEUED';assert.throws(()=>evaluate(g),/STATUS_INVALID/);const h=structuredClone(catalog);h.controls[0].owner='';assert.throws(()=>validateSecurityCatalog(h),/CONTROL_INVALID/)});
test('catalog cannot omit or duplicate a mandated security boundary',()=>{const a=structuredClone(catalog);a.controls.pop();assert.throws(()=>validateSecurityCatalog(a),/REQUIRED_CONTROL_MISSING/);const b=structuredClone(catalog);b.controls.push(b.controls[0]);assert.throws(()=>validateSecurityCatalog(b),/CONTROL_INVALID/)});
