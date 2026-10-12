import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { labSendFailure, labSeenOutcome } from '../src/lab-delivery-state.mjs';

test('LAB pre-send failure is retryable only after composer reset',()=>{
  const safe=labSendFailure({sendAttempted:false,composerCleared:true});
  assert.equal(safe.code,'LAB_PRE_SEND_RETRYABLE');
  assert.equal(safe.safeToRetry,true);
  assert.equal(safe.retryable,true);
  assert.equal(labSeenOutcome({error:safe}),'RETRY');

  const unsafe=labSendFailure({sendAttempted:false,composerCleared:false});
  assert.equal(unsafe.code,'LAB_DELIVERY_AMBIGUOUS');
  assert.equal(unsafe.safeToRetry,false);
  assert.equal(unsafe.retryable,false);
  assert.equal(labSeenOutcome({error:unsafe}),'AMBIGUOUS');
});

test('LAB Enter attempt always enters ambiguous state if confirmation fails',()=>{
  for(const composerCleared of [true,false]){
    const error=labSendFailure({sendAttempted:true,composerCleared});
    assert.equal(error.code,'LAB_DELIVERY_AMBIGUOUS');
    assert.equal(error.retryable,false);
    assert.equal(labSeenOutcome({error}),'AMBIGUOUS');
  }
});

test('intentional skips and confirmed replies are acknowledged, unknown errors are not blindly retried',()=>{
  assert.equal(labSeenOutcome({ignored:true}),'IGNORED');
  assert.equal(labSeenOutcome({confirmed:true}),'DELIVERED');
  assert.equal(labSeenOutcome({error:new Error('unexpected')}),'AMBIGUOUS');
});

test('live LAB input acknowledges only after send and explicitly distinguishes retry/ambiguity',async()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const code=await fs.readFile(path.join(root,'src','index.mjs'),'utf8');
  const start=code.indexOf('async function processLabTestInput()');
  const end=code.indexOf('async function visibleLabHasTag',start);
  assert.ok(start>=0&&end>start,'LAB input function boundaries');
  const block=code.slice(start,end);
  const send=block.indexOf('await sendTextInCurrentLab(');
  const confirmedAck=block.indexOf('rememberLabSeen(row.id); // confirmed delivery');
  assert.ok(send>=0&&confirmedAck>send,'must not commit seen before LAB delivery');
  assert.match(block,/if \(outcome === 'AMBIGUOUS'\)/);
  assert.match(block,/labTestAmbiguousCount \+= 1/);
  assert.match(block,/await saveLabSeenNow\(\)/);
  const method=code.slice(code.indexOf('async function sendTextInCurrentLab('),start);
  assert.match(method,/sendAttempted = true;\s*await page\.keyboard\.press\('Enter'\)/);
  assert.match(method,/labSendFailure\(\{sendAttempted,composerCleared:Boolean\(cleared\)\}\)/);
  assert.match(code,/labTestReplyAmbiguous: labTestAmbiguousCount/);
});
