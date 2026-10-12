import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const code=(name:string)=>fs.readFile(path.join(here,name),'utf8');

test('LAB route stores immutable candidate after receipt but before any HTTP reply',async()=>{
  const source=await code('hipico-bridge.routes.ts');
  const snapshot=source.indexOf('await persistLabReplayCandidate(');
  const receipt=source.indexOf('await persistResponsePlan(responsePlan)');
  const output=source.indexOf('return res.status(event.inserted?202:200).json(');
  assert.ok(receipt>0&&receipt<snapshot&&snapshot<output);
  assert.match(source,/input\.channelRole==='lab'&&event\.inserted&&responseReceipt/);
  assert.match(source,/input\.channelRole==='lab'&&!event\.inserted&&safetyReady\.ready/);
  assert.match(source,/const recovered=await recoverLabReplayCandidate/);
  assert.match(source,/freshDecision\.effectsAllowed===false&&freshDecision\.transportAction==='NONE'/);
  assert.match(source,/freshSafety\.canSend&&!freshSafety\.handoffRequired&&!freshSafety\.confirmationVerified/);
  assert.match(source,/LAB_REPLAY_REVIEW_REQUIRED/);
  assert.match(source,/sourceSendPossible:false/);
});

test('LAB recovery never creates another financial/domain event or changes SOURCE gate',async()=>{
  const store=await code('hipico-lab-recovery.store.ts');
  const policy=await code('hipico-lab-recovery-policy.ts');
  assert.match(store,/UPDATE public\."HipicoResponseReceipt"/);
  assert.match(store,/WHERE "idempotencyKey"=/);
  assert.match(store,/labReplayScopeHash/);
  assert.match(store,/freshHash!==row\.readDigest \|\| freshText!==row\.text/);
  assert.doesNotMatch(store,/\b(?:INSERT INTO|DELETE FROM|UPDATE)\s+public\.hipico_(?:offers|balances|races|race_events)\b/i);
  assert.match(policy,/input\.channelRole==='lab'/);
  assert.match(policy,/!input\.humanOwned/);
  assert.match(policy,/plan\.confirmationVerified/);
});

test('migration extends a receipt without replacing the existing authority',async()=>{
  const sql=await fs.readFile(path.resolve(here,'../../../prisma/migrations/20261012142500_hipico_lab_response_recovery/migration.sql'),'utf8');
  assert.match(sql,/ALTER TABLE public\."HipicoResponseReceipt"/);
  assert.match(sql,/labReplayExpiresAt/);
  assert.match(sql,/CHECK\s*\(/);
  assert.doesNotMatch(sql,/DROP TABLE|CREATE TABLE/i);
});

test('bounded retention endpoint is token protected, wipes expired text without deleting receipts',async()=>{
  const route=await code('hipico-bridge.routes.ts');
  const body=route.slice(route.indexOf("router.post('/bridge/maintenance/lab-replay-prune'"),route.indexOf("router.post('/bridge/events'"));
  assert.match(body,/bridgeTokenValid\(req\.header\('x-hipico-bridge-token'\)/);
  assert.match(body,/res\.status\(401\)/);
  assert.match(body,/await pruneExpiredLabReplayCandidates\(\)/);
  assert.match(body,/LAB_REPLAY_PRUNE_UNAVAILABLE/);
  const store=await code('hipico-lab-recovery.store.ts');
  assert.match(store,/FOR UPDATE SKIP LOCKED/);
  assert.match(store,/ORDER BY "labReplayExpiresAt" ASC/);
  assert.match(store,/SET "labReplayText"=NULL/);
  assert.doesNotMatch(store,/DELETE FROM public\."HipicoResponseReceipt"/);
});
