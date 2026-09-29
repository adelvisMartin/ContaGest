import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path) => readFileSync(join(process.cwd(), path), 'utf8');
const config = read('tools/hipico-whatsapp-web-bridge/src/runtime-config.mjs');
const runtime = read('tools/hipico-whatsapp-web-bridge/src/index.mjs');
const journal = read('tools/hipico-whatsapp-web-bridge/src/source-reply-journal.mjs');
const pkg = JSON.parse(read('tools/hipico-whatsapp-web-bridge/package.json'));
const qa = read('docs/hipico/QA_DOWNLOAD_AND_BOT_TEST.md');
const readiness = read('docs/hipico/WHATSAPP_READINESS_2026-09-29.md');

test('bridge stays on current v1.5 runtime and protects SOURCE from self-loop ingestion', () => {
  assert.equal(pkg.version, '1.5.0');
  assert.match(runtime, /if \(row\.fromMe\) \{[\s\S]*SOURCE_SELF_SKIP/);
  assert.match(runtime, /visibleOutgoingTextCount/);
});

test('SOURCE automatic writing fails closed while current platform policy is NO-GO', () => {
  assert.match(config, /SOURCE_AUTO_REPLY_POLICY_NO_GO/);
  assert.match(config, /sourceAutoReplyEnabled/);
  assert.match(config, /WhatsApp Business/i);
});

test('reply journal preserves exactly-once and ambiguous-delivery semantics', () => {
  assert.match(journal, /prepared','sending','sent','ambiguous/);
  assert.match(journal, /PROCESS_RESTART_DURING_SEND/);
  assert.match(journal, /SOURCE_REPLY_REPLAY_MISMATCH/);
  assert.match(journal, /safeToRetry===true/);
});

test('download-and-test runbook points to current main/v1.5 and LAB autonomous testing', () => {
  assert.match(qa, /Bridge `1\.5\.0`/);
  assert.match(qa, /rama `main`/i);
  assert.match(qa, /PROBAR-HIPICO-LAB\.cmd/);
  assert.match(qa, /sourceSendPossible` = `false`/);
});

test('readiness note records market research, compliance, gaps and same-day QA contract', () => {
  assert.match(readiness, /Baileys/i);
  assert.match(readiness, /WebSocket/i);
  assert.match(readiness, /Playwright/i);
  assert.match(readiness, /real-money gambling/i);
  assert.match(readiness, /idempot/i);
  assert.match(readiness, /ambiguous/i);
  assert.match(readiness, /backoff/i);
  assert.match(readiness, /LAB/i);
  assert.match(readiness, /NOT VERIFIED/i);
});
