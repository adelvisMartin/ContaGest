import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');

async function source(name){return fs.readFile(path.join(root,'src',name),'utf8');}

test('live bridge is wired to spool v2 and no longer executes legacy spool helpers',async()=>{
  const code=await source('index.mjs');
  assert.match(code,/createBridgeSpoolRuntime/);
  assert.match(code,/spoolRuntime\.initialize\(\)/);
  assert.match(code,/spoolRuntime\.queueBackendEvent/);
  assert.match(code,/spoolRuntime\.queueLabMirror/);
  assert.match(code,/spoolRuntime\.queueSourceReply/);
  assert.match(code,/spoolRuntime\.flushBackend/);
  assert.match(code,/spoolRuntime\.flushLab/);
  assert.match(code,/spoolRuntime\.flushSourceReplies/);
  assert.doesNotMatch(code,/async function spoolJson\(/);
  assert.doesNotMatch(code,/async function deliverEventFile\(/);
  assert.doesNotMatch(code,/async function deadLetter\(/);
});

test('capture persists durable work before marking source message seen',async()=>{
  const code=await source('index.mjs');
  const start=code.indexOf('async function captureRow');
  const end=code.indexOf('async function processSourceRows',start);
  assert.ok(start>=0&&end>start);
  const capture=code.slice(start,end);
  const queueEvent=capture.indexOf('await queueEvent(event)');
  const queueMirror=capture.indexOf('await queueMirror({');
  const remember=capture.indexOf('rememberSeen(row.id)');
  assert.ok(queueEvent>=0&&queueMirror>=0&&remember>queueEvent&&remember>queueMirror);
});

test('source autonomous reply path is opt-in, backend-derived and identity-pinned',async()=>{
  const code=await source('index.mjs');
  assert.match(code,/sourceSendPossible:\s*Boolean\(SOURCE_AUTO_REPLY_ENABLED/);
  assert.match(code,/result\?\.autonomousReply/);
  assert.match(code,/async function sendAutonomousReplyToSource/);
  assert.match(code,/SOURCE_AUTO_REPLY_DESTINATION_MISMATCH/);
  assert.match(code,/await assertCurrentSourceIdentity\(\)/);
  assert.match(code,/async function sendTextInCurrentLab/);
  assert.match(code,/await assertCurrentLabIdentity\(\)/);
});

test('replay CLI requeues only after destination, count and explicit confirmation checks',async()=>{
  const code=await source('replay-spool.mjs');
  assert.match(code,/REPLAY_DESTINATION_REQUIRED/);
  assert.match(code,/REPLAY_EXPECTED_COUNT_REQUIRED/);
  assert.match(code,/REPLAY_CONFIRM_REQUEUE_REQUIRED/);
  assert.match(code,/REPLAY_COUNT_CHANGED/);
  assert.match(code,/requestReplay/);
  assert.doesNotMatch(code,/REPLAY_EXECUTION_REQUIRES_RUNTIME_ADAPTER/);
});
