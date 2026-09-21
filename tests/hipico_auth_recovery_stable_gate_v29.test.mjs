import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { combineAuthRecoveryGate } from '../scripts/hipico-auth-recovery-gate-v29.mjs';

const read=(relative)=>readFile(new URL('../'+relative,import.meta.url),'utf8');

test('v29 auth recovery gate requires both executed job and COMPLETE artifact PASS',()=>{
  assert.equal(combineAuthRecoveryGate('PASS','PASS'),'PASS');
  assert.equal(combineAuthRecoveryGate('PASS','NOT_EXECUTED'),'NOT_EXECUTED');
  assert.equal(combineAuthRecoveryGate('NOT_EXECUTED','PASS'),'NOT_EXECUTED');
  assert.equal(combineAuthRecoveryGate('FAIL','PASS'),'FAIL');
  assert.equal(combineAuthRecoveryGate('PASS','FAIL'),'FAIL');
  assert.equal(combineAuthRecoveryGate('BLOCKED','PASS'),'BLOCKED');
  assert.equal(combineAuthRecoveryGate('PASS','BLOCKED'),'BLOCKED');
});

test('v29 CI verdict maps reusable auth-recovery job and recognizes child job names',async()=>{
  const source=await read('scripts/hipico-ci-verdict-v290.mjs');
  assert.match(source,/'auth-recovery'\s*:\s*'HIPICO_GATE_AUTH_RECOVERY'/);
  assert.match(source,/actual\.startsWith\([^\n]*expected[^\n]*\/[^\n]*\)/);
});

test('v29 verifier accepts only COMPLETE PASS recovery evidence on the exact SHA',async()=>{
  const source=await read('scripts/hipico-verify-evidence-v290.mjs');
  assert.match(source,/id:\s*'authRecovery'/);
  assert.match(source,/name:\s*'auth-recovery-evidence\.json'/);
  assert.match(source,/schemas:\s*\['hipico-auth-recovery-e2e\.v28'\]/);
  assert.match(source,/data\?\.phase\s*===\s*'COMPLETE'/);
  assert.match(source,/data\?\.e2eComplete\s*===\s*true/);
  const requiredBlock=source.slice(source.indexOf('const requiredDescriptors'),source.indexOf('const optionalDescriptors'));
  assert.doesNotMatch(requiredBlock,/authRecovery/);
});

test('v29 release report keeps auth recovery out of code review and requires it for stable promotion',async()=>{
  const source=await read('scripts/hipico-release-report-v290.mjs');
  assert.match(source,/combineAuthRecoveryGate/);
  assert.match(source,/authRecoveryArtifact/);
  assert.match(source,/HIPICO_GATE_AUTH_RECOVERY/);
  assert.match(source,/authRecovery:\s*authRecoveryStatus/);
  const codeReview=source.match(/const codeReviewRequired\s*=\s*\[([^\]]+)\]/);
  assert.ok(codeReview);
  assert.doesNotMatch(codeReview[1],/authRecovery/);
  const stable=source.match(/const stableRequired\s*=\s*\[([^\]]+)\]/);
  assert.ok(stable);
  assert.match(stable[1],/authRecovery/);
});

test('v29 v28 workflow is reusable/manual only and emits a canonical exact-SHA artifact',async()=>{
  const workflow=await read('.github/workflows/hipico-auth-recovery-e2e-v28.yml');
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/workflow_call:/);
  assert.doesNotMatch(workflow,/\npush:/);
  assert.doesNotMatch(workflow,/\npull_request:/);
  assert.doesNotMatch(workflow,/\nschedule:/);
  assert.match(workflow,/HIPICO_AUTH_RECOVERY_REPORT:\s*artifacts\/qa\/hipico-auth-recovery\/\$\{\{\s*inputs\.candidate_sha\s*\}\}\/auth-recovery-evidence\.json/);
  assert.match(workflow,/name:\s*hipico-v290-auth-recovery-\$\{\{\s*inputs\.phase\s*\}\}-\$\{\{\s*inputs\.candidate_sha\s*\}\}/);
  assert.match(workflow,/HIPICO_AUTH_RECOVERY_EMAIL_LINK:\s*\$\{\{\s*secrets\.HIPICO_AUTH_RECOVERY_EMAIL_LINK\s*\}\}/);
});

test('v29 production release invokes COMPLETE recovery only on manual dispatch',async()=>{
  const workflow=await read('.github/workflows/hipico-production-gates-v290.yml');
  assert.match(workflow,/auth_recovery_test_account_ack:/);
  const start=workflow.indexOf('\n  auth-recovery:');
  assert.ok(start>=0,'auth-recovery job missing');
  const end=workflow.indexOf('\n  release-report:',start);
  const block=workflow.slice(start,end>start?end:workflow.length);
  assert.match(block,/if:\s*github\.event_name\s*==\s*'workflow_dispatch'/);
  assert.match(block,/uses:\s*\.\/\.github\/workflows\/hipico-auth-recovery-e2e-v28\.yml/);
  assert.match(block,/phase:\s*COMPLETE/);
  assert.match(block,/dedicated_test_account_ack:\s*true/);
  assert.match(block,/HIPICO_AUTH_RECOVERY_EMAIL_LINK:\s*\$\{\{\s*secrets\.HIPICO_AUTH_RECOVERY_EMAIL_LINK\s*\}\}/);
  assert.doesNotMatch(block,/pull_request|schedule/);
  const release=workflow.slice(workflow.indexOf('\n  release-report:'));
  assert.match(release,/needs:\s*\[[^\]]*auth-recovery[^\]]*\]/);
});
