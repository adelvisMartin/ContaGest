import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const source = await fs.readFile(new URL('../src/index.mjs', import.meta.url), 'utf8');

test('source group has no generic sendMessage route and only exposes guarded source replies', () => {
  assert.equal(/sendMessage\s*\(/.test(source), false);
  assert.match(source, /sendMirrorToLab/);
  assert.match(source, /openGroup\(LAB_GROUP_NAME, true\)/);
  assert.match(source, /sourceSendPossible: SOURCE_AUTO_REPLY_ACTIVE && backendState === 'online'/);
  assert.match(source, /async function sendTextInCurrentSource\(record\)/);
  assert.match(source, /if \(!SOURCE_AUTO_REPLY_ACTIVE\)/);
  assert.match(source, /SOURCE_REPLY_DESTINATION_MISMATCH/);
});

test('LAB send path requires live stable group identity before and after composing', () => {
  assert.match(source, /assertPinnedGroupIdentity/);
  assert.match(source, /SOURCE_GROUP_ID/);
  assert.match(source, /LAB_GROUP_ID/);
  assert.match(source, /currentChatGroupId/);
  assert.match(source, /async function assertCurrentLabIdentity/);
  assert.match(source, /async function sendTextInCurrentLab[\s\S]*await assertCurrentLabIdentity\(\)/);
  assert.match(source, /async function sendMirrorToLab[\s\S]*await assertCurrentLabIdentity\(\)/);
  assert.match(source, /clearComposerSafely/);
});

test('source monitoring also verifies its pinned ID when configured', () => {
  assert.match(source, /async function assertCurrentSourceIdentity/);
  assert.match(source, /async function currentChatIsSource/);
  assert.match(source, /SOURCE_GROUP_ID \|\| `official-web:/);
  assert.match(source, /await assertCurrentSourceIdentity\(\)/);
});

test('429 circuit breaker persists Retry-After/backoff state and exposes next retry metadata', () => {
  assert.match(source, /response\.status === 429/);
  assert.match(source, /parseRetryAfterMs/);
  assert.match(source, /computeBackoffMs/);
  assert.match(source, /backendNextAllowedAt/);
  assert.match(source, /RETRY_STATE_FILE/);
  assert.match(source, /async function saveRetryState/);
  assert.match(source, /nextRetryAt:/);

  const classifyAt = source.indexOf('response.status === 429');
  const cooldownAt = source.indexOf('backendNextAllowedAt = Date.now() + wait');
  const persistAt = source.indexOf('await saveRetryState();', cooldownAt);
  assert.ok(classifyAt >= 0, '429 must be classified explicitly');
  assert.ok(cooldownAt > classifyAt, 'cooldown must be derived after HTTP failure classification');
  assert.ok(persistAt > cooldownAt, 'cooldown state must be persisted after calculating next allowed attempt');
});

test('capture persists durable backend work before flush and before marking source message seen', () => {
  assert.match(source, /if \(BACKEND_SYNC_ENABLED\) \{[\s\S]*await queueEvent\(event\);[\s\S]*await flushEventSpool\(1\);[\s\S]*\}/);
  assert.match(source, /await appendTraining\(event, classification, null\)/);
  assert.match(source, /await queueMirror\(/);

  const captureStart = source.indexOf('async function captureRow(row)');
  const queueAt = source.indexOf('await queueEvent(event);', captureStart);
  const flushAt = source.indexOf('await flushEventSpool(1);', queueAt);
  const seenAt = source.indexOf('rememberSeen(row.id);', captureStart);
  assert.ok(captureStart >= 0, 'captureRow must exist');
  assert.ok(queueAt > captureStart, 'backend event must be durably queued during capture');
  assert.ok(flushAt > queueAt, 'delivery flush must happen only after durable enqueue');
  assert.ok(seenAt > flushAt, 'source message must be marked seen only after durable work has been queued');
});

test('local shadow remains available when backend is unavailable', () => {
  assert.match(source, /localMirrorText/);
  assert.match(source, /source: 'local-fallback'/);
  assert.match(source, /TRAINING_JOURNAL/);
});

test('browser sandbox is enabled and WhatsApp DB recovery gate exists', () => {
  assert.match(source, /chromiumSandbox:\s*true/);
  assert.match(source, /hasWhatsAppBrowserDatabaseError/);
  assert.match(source, /PROFILE_RESET_REQUIRED/);
  assert.match(source, /process\.exitCode\s*=\s*42/);
});

test('production mode is loaded through strict configuration', () => {
  assert.match(source, /assertRuntimeConfig\(loadRuntimeConfig\(\)\)/);
  assert.match(source, /runtimeMode: RUNTIME_MODE/);
  assert.match(source, /body\?\.ready !== true/);
  assert.match(source, /sourceSendPossible: SOURCE_AUTO_REPLY_ACTIVE && backendState === 'online'/);
});

test('WhatsApp group discovery has DOM/header fallback and diagnostics', () => {
  assert.match(source, /chatDomSnapshot/);
  assert.match(source, /clickGroupByNormalizedText/);
  assert.match(source, /DOM_DIAGNOSTIC_FILE/);
  assert.match(source, /#main header/);
});

test('diagnostics are metadata-only and screenshots require explicit opt-in', () => {
  assert.match(source, /if \(!DIAGNOSTIC_SCREENSHOTS_ENABLED\) return/);
  assert.match(source, /paneTextPersisted: false/);
  assert.match(source, /snapshot: safeSnapshot/);
  assert.doesNotMatch(source, /const rows = Array\.from\(document\.querySelectorAll\('#pane-side/);
});

test('LAB can be used as test input without creating shadow loops', () => {
  assert.match(source, /LAB_TEST_INPUT_ENABLED/);
  assert.match(source, /processLabTestInput/);
  assert.match(source, /\[LABTEST:/);
  assert.match(source, /body\.includes\('\[SHADOW:'/);
  assert.match(source, /body\.includes\('\[LABTEST:'/);
});

test('LAB test poll returns to the source group without bypassing guarded reply authority', () => {
  assert.match(source, /await openSourceGroup\(\)\.catch/);
  assert.match(source, /sourceSendPossible: SOURCE_AUTO_REPLY_ACTIVE && backendState === 'online'/);
  assert.match(source, /async function sendTextInCurrentSource[\s\S]*await assertCurrentSourceIdentity\(\)/);
  assert.match(source, /async function flushSourceReplies[\s\S]*sourceReplyJournal\.flush/);
});
