import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcile} from '../scripts/reconcile-backlog-v661.mjs';
const A='a'.repeat(40),B='b'.repeat(40);
const make=()=>({schemaVersion:661,mainSha:A,observedAt:'2026-10-14T17:21:03Z',
 issues:[{id:1,title:'[P1] Sales operations and lifecycle',state:'OPEN'},
         {id:2,title:'[P2] Better QA and automation',state:'OPEN'}],
 prs:[{number:11,headSha:B,issueId:1}],
 completions:[{issue:5,sha:A,pr:8,evidenceUrl:'https://github.com/adelvisMartin/ContaGest/pull/8'}],
 supersessions:[],branches:[]});
test('proper ownership is unique, missing PR remains visible',()=>{
 const r=reconcile(make(),{baselineSha:A});
 assert.equal(r.structuralValidation,'PASS');assert.deepEqual(r.unclaimedIssues,[2]);
 assert.equal(r.allReconciled,false);assert.equal(r.counts.completedWithEvidence,1);
});
test('two PRs claiming one ticket trigger collision without merging',()=>{
 const x=make();x.prs.push({number:12,headSha:B,issueId:1});
 assert.deepEqual(reconcile(x).claimConflicts,[{issue:1,prs:[11,12]}]);
});
test('PR without explicit issue is never auto-assigned',()=>{
 const x=make();x.prs.push({number:13,headSha:B,issueId:null});
 assert.deepEqual(reconcile(x).unownedPrs,[13]);
});
test('near-identical long titles are candidates only',()=>{
 const x=make();x.issues[0].title='[P1] Transactional scheduling and allocations with safe reconciliation';
 x.issues[1].title='[P2] Transactional scheduling and allocations with safe reconciliation';
 assert.equal(reconcile(x).duplicateCandidates.length,1);
});
test('closed record requires SHA and evidence; cannot exist as an open issue',()=>{
 const x=make();x.completions[0].evidenceUrl='https://evil.invalid';
 assert.ok(reconcile(x).errors.includes('RECONCILE_COMPLETION_EVIDENCE_INVALID'));
 x.completions[0].evidenceUrl='https://github.com/adelvisMartin/ContaGest/pull/8';
 x.issues.push({id:5,title:'already done',state:'OPEN'});
 assert.ok(reconcile(x).errors.includes('RECONCILE_OPEN_ISSUE_MARKED_COMPLETE:5'));
});
test('stale branch requires recompare, never auto-deletion',()=>{
 const x=make();x.branches=[{name:'old-branch',ahead:0,behind:12,openPrCount:0,comparedSha:B}];
 const r=reconcile(x);assert.equal(r.branchReviews[0].mayDeleteAutomatically,false);
 assert.equal(r.branchReviews[0].classification,'COMPARE_STALE_RECHECK');
});
test('a superseded issue still open must not be auto-closed',()=>{
 const x=make();x.supersessions.push({duplicate:2,owner:1,status:'CLOSED',
 evidenceUrl:'https://github.com/adelvisMartin/ContaGest/issues/2'});
 assert.ok(reconcile(x).errors.includes('RECONCILE_SUPERSESSION_NOT_CLOSED:2'));
});
test('snapshot baseline SHA mismatch fails closed',()=>{
 assert.ok(reconcile(make(),{baselineSha:B}).errors.includes('RECONCILE_BASELINE_DRIFT'));
});
