import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const panel=readFileSync('frontend/src/components/fitness/WorkoutSessionPanel.jsx','utf8');
const client=readFileSync('frontend/src/services/gymWorkoutOfflineService.js','utf8');
const offline=readFileSync('frontend/src/services/pwaOfflineService.js','utf8');

test('#797 UI queues before sending; only server ACK counts as synced',()=>{
  const recordSet=panel.slice(panel.indexOf("async function recordSet("),panel.indexOf("async function completeSession("));
  assert.ok(recordSet.indexOf('GymWorkoutOfflineService.queueSet(')>=0);
  assert.ok(recordSet.indexOf('GymWorkoutOfflineService.queueSet(')<recordSet.indexOf('GymWorkoutOfflineService.sync('));
  assert.match(panel,/outcome\?\.delivered/);
  assert.match(panel,/pending/i);
  assert.match(panel,/syncing/);
  assert.match(panel,/Sincronizar/);
});
test('#797 reuses canonical PWA outbox and honors current cookie-bound identity',()=>{
  assert.match(client,/import \{ AuthSession \}/);
  assert.match(client,/enqueueOfflineOperation/);
  assert.match(client,/flushOfflineOutbox/);
  assert.match(client,/eventKey:idempotencyKey/);
  assert.match(offline,/discardReviewedWorkoutEvent/);
  assert.match(offline,/OFFLINE_SESSION_CHANGED/);
  assert.doesNotMatch(client,/localStorage\.setItem|indexedDB\.open|authorization|Bearer/);
});
test('#797 unresolved events block completion and require explicit review',()=>{
  assert.match(panel,/Sincroniza o resuelve las series pendientes/);
  assert.match(panel,/Confirmar descarte local/);
  assert.match(panel,/No se confirmó todavía el estado de la cola offline/);
});
