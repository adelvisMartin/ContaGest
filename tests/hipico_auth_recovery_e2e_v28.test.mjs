import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  classifyRequestEvidence,
  classifyCompleteEvidence,
  validateRedirectTarget,
  validatePublishableKey
} from '../scripts/hipico-auth-recovery-e2e-v28.mjs';

const read=(relative)=>readFile(new URL(`../${relative}`,import.meta.url),'utf8');
const SHA='a'.repeat(40);
const NOW=new Date('2026-09-18T14:55:00.000Z');

test('v28 REQUEST PASS never claims full recovery E2E completion',()=>{
  const report=classifyRequestEvidence({
    candidateSha:SHA,
    requestAccepted:true,
    emailFingerprint:'e'.repeat(64),
    expectedRedirect:'https://conta-gest-frontend.vercel.app/hipico-control/',
    now:NOW
  });
  assert.equal(report.status,'PASS');
  assert.equal(report.phase,'REQUEST');
  assert.equal(report.requestAccepted,true);
  assert.equal(report.e2eComplete,false);
});

test('v28 COMPLETE PASS requires redirect, stable identity, profile/workspace linkage and logout',()=>{
  const report=classifyCompleteEvidence({
    candidateSha:SHA,
    redirectMatched:true,
    identityStable:true,
    profileLinked:true,
    accessLinked:true,
    workspaceLinked:true,
    sessionClosed:true,
    emailFingerprint:'e'.repeat(64),
    userFingerprint:'u'.repeat(64),
    workspaceOwnerFingerprint:'w'.repeat(64),
    expectedRedirect:'https://conta-gest-frontend.vercel.app/hipico-control/',
    now:NOW
  });
  assert.equal(report.status,'PASS');
  assert.equal(report.phase,'COMPLETE');
  assert.equal(report.e2eComplete,true);
  assert.deepEqual(report.failedChecks,[]);
});

test('v28 COMPLETE fails closed for redirect mismatch or identity/linkage drift',()=>{
  const base={
    candidateSha:SHA,
    redirectMatched:true,
    identityStable:true,
    profileLinked:true,
    accessLinked:true,
    workspaceLinked:true,
    sessionClosed:true,
    emailFingerprint:'e'.repeat(64),
    userFingerprint:'u'.repeat(64),
    workspaceOwnerFingerprint:'w'.repeat(64),
    expectedRedirect:'https://conta-gest-frontend.vercel.app/hipico-control/',
    now:NOW
  };
  for(const key of ['redirectMatched','identityStable','profileLinked','accessLinked','workspaceLinked','sessionClosed']){
    const report=classifyCompleteEvidence({...base,[key]:false});
    assert.equal(report.status,'FAIL');
    assert.equal(report.e2eComplete,false);
    assert.ok(report.failedChecks.includes(key));
  }
});

test('v28 validates the exact HTTPS hipico-control redirect target',()=>{
  const ok=validateRedirectTarget('https://conta-gest-frontend.vercel.app/hipico-control/');
  assert.equal(ok.ok,true);
  assert.equal(ok.url,'https://conta-gest-frontend.vercel.app/hipico-control/');

  for(const value of [
    'http://conta-gest-frontend.vercel.app/hipico-control/',
    'https://conta-gest-frontend.vercel.app/',
    'https://evil.example/hipico-control/',
    'javascript:alert(1)'
  ]){
    const result=validateRedirectTarget(value,{expectedOrigin:'https://conta-gest-frontend.vercel.app'});
    assert.equal(result.ok,false);
  }
});

test('v28 workflow is manual-only, exact-SHA and keeps the raw email link in a secret',async()=>{
  const workflow=await read('.github/workflows/hipico-auth-recovery-e2e-v28.yml');
  assert.match(workflow,/workflow_dispatch:/);
  assert.doesNotMatch(workflow,/\npush:/);
  assert.doesNotMatch(workflow,/\npull_request:/);
  assert.doesNotMatch(workflow,/\nschedule:/);
  assert.match(workflow,/candidate_sha:/);
  assert.match(workflow,/phase:/);
  assert.match(workflow,/REQUEST/);
  assert.match(workflow,/COMPLETE/);
  assert.match(workflow,/dedicated_test_account_ack:/);
  assert.match(workflow,/ref:\s*\$\{\{\s*inputs\.candidate_sha\s*\}\}/);
  assert.match(workflow,/HIPICO_CANDIDATE_SHA:\s*\$\{\{\s*inputs\.candidate_sha\s*\}\}/);
  assert.match(workflow,/HIPICO_AUTH_RECOVERY_EMAIL_LINK:\s*\$\{\{\s*secrets\.HIPICO_AUTH_RECOVERY_EMAIL_LINK\s*\}\}/);
  assert.doesNotMatch(workflow,/HIPICO_AUTH_RECOVERY_EMAIL_LINK:\s*\$\{\{\s*inputs\./);
  assert.doesNotMatch(workflow,/SERVICE_ROLE|SUPABASE_SERVICE_ROLE/i);
  assert.match(workflow,/node scripts\/hipico-auth-recovery-e2e-v28\.mjs/);
  assert.match(workflow,/actions\/upload-artifact/);
});

test('v28 script uses publishable auth endpoints only and never persists sensitive recovery material',async()=>{
  const source=await read('scripts/hipico-auth-recovery-e2e-v28.mjs');
  for(const marker of [
    '/auth/v1/recover',
    '/auth/v1/user',
    '/auth/v1/token?grant_type=password',
    '/auth/v1/logout',
    'hipico_profiles',
    'hipico_users'
  ]) assert.match(source,new RegExp(marker.replace(/[?]/g,'\\?')));

  assert.match(source,/SERVICE_ROLE_KEY_FORBIDDEN/);
  assert.match(source,/role==='service_role'/);
  assert.match(source,/\^sb_secret_/);
  assert.doesNotMatch(source,/process\.env\.(?:SUPABASE_SERVICE_ROLE|HIPICO_SUPABASE_SERVICE_ROLE|SERVICE_ROLE)/i);
  assert.doesNotMatch(source,/\b(?:const|let|var)\s+(?:serviceRoleKey|service_role_key)\b/i);
  assert.match(source,/randomBytes/);
  assert.match(source,/createHash/);
  assert.match(source,/redirect:\s*'manual'/);
  assert.match(source,/access_token/);
  assert.match(source,/refresh_token/);
  assert.doesNotMatch(source,/report\.[A-Za-z0-9_]*(?:token|password|emailLink|recoveryLink)\s*=/i);
});

test('v28 runbook requires a dedicated disposable account and secret cleanup',async()=>{
  const doc=await read('docs/hipico/HIPICO_AUTH_RECOVERY_E2E.md');
  assert.match(doc,/cuenta de prueba dedicada|dedicated test account/i);
  assert.match(doc,/REQUEST/);
  assert.match(doc,/COMPLETE/);
  assert.match(doc,/HIPICO_AUTH_RECOVERY_EMAIL_LINK/);
  assert.match(doc,/secret/i);
  assert.match(doc,/elimin(?:a|ar)|remove|borrar/i);
  assert.match(doc,/no.*service role|service role.*no/i);
  assert.match(doc,/no.*cerrar.*#267|#267.*COMPLETE PASS/is);
});


test('v28 rejects service-role credentials and accepts publishable/anon credentials only',()=>{
  assert.equal(validatePublishableKey('sb_secret_example').ok,false);
  assert.equal(validatePublishableKey('sb_publishable_example').ok,true);
  const anonPayload=Buffer.from(JSON.stringify({role:'anon'})).toString('base64url');
  const servicePayload=Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url');
  assert.equal(validatePublishableKey(`aaa.${anonPayload}.bbb`).ok,true);
  assert.equal(validatePublishableKey(`aaa.${servicePayload}.bbb`).ok,false);
});

test('v28 COMPLETE binds the recovery link to the dedicated account before password mutation',async()=>{
  const source=await read('scripts/hipico-auth-recovery-e2e-v28.mjs');
  const accountCheck=source.indexOf('RECOVERY_ACCOUNT_MISMATCH');
  const passwordUpdate=source.indexOf("method:'PUT'");
  assert.ok(accountCheck>=0,'account binding check missing');
  assert.ok(passwordUpdate>accountCheck,'account identity must be checked before password update');
  assert.match(source,/recoveryUser\?\.email/);
});

test('v28 verifies active access row and an actual workspace row with the reauthenticated JWT',async()=>{
  const source=await read('scripts/hipico-auth-recovery-e2e-v28.mjs');
  assert.match(source,/hipico_users\?user_id=eq\./);
  assert.match(source,/select=user_id,workspace_owner_id,status/);
  assert.match(source,/hipico_workspaces\?owner_id=eq\./);
  assert.match(source,/select=id,owner_id/);
  assert.match(source,/accessLinked/);
});
