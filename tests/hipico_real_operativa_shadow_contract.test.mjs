import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');

test('group bridge uses operational classifier, persistent stores and stays shadow only',()=>{
  const route=read('backend/src/modules/hipico-bot/hipico-bridge.routes.ts');
  const transport=read('backend/src/modules/hipico-bot/hipico-bridge-transport.store.ts');
  assert.match(route,/hipico-operational-classifier\.js/);
  assert.match(route,/persistBridgeTransportEvent/);
  assert.match(route,/persistCanonicalShadow/);
  assert.match(route,/ensureGroupShadowOutbox/);
  assert.match(route,/status\(503\)/);
  assert.match(route,/retryable:\s*true/);
  assert.match(route,/actions:\s*\[\]/);
  assert.match(route,/autoEligible:\s*false/);
  assert.match(route,/operational:\s*result\.entities/);
  assert.match(transport,/'group_bridge'/);
  assert.match(transport,/'shadow'/);
  assert.match(transport,/ON CONFLICT \("eventId","targetType"\)/);
  assert.doesNotMatch(transport,/memoryEvents|memoryOutbox/);
});

test('canonical shadow dual-write uses prepared Hipico schema but never live ledger/outbox',()=>{
  const store=read('backend/src/modules/hipico-bot/hipico-canonical-shadow.store.ts');
  assert.match(store,/public\.hipico_bot_channels/);
  assert.match(store,/public\.hipico_messages/);
  assert.match(store,/public\.hipico_operation_events/);
  assert.match(store,/public\.hipico_shadow_evaluations/);
  assert.match(store,/channel_type='web_bridge'/);
  assert.match(store,/event_state/);
  assert.match(store,/match_status/);
  assert.match(store,/'pending'/);
  assert.doesNotMatch(store,/public\.hipico_ledger_entries/);
  assert.doesNotMatch(store,/public\.hipico_outbox/);
  assert.doesNotMatch(store,/sendCloudText|sendMessage/);
  assert.doesNotMatch(store,/a2adb975|de6bc73f|daf36097/); // no user-specific UUIDs in source
});

test('real operational classifier contains recovered RC1 vocabulary, structure and manual gates',()=>{
  const classifier=read('backend/src/modules/hipico-bot/hipico-operational-classifier.ts');
  for(const token of ['JUEGA','CONSIGUE','TERCIO\\s+DISPONIBLE','TERCIOS','LLEGADA','PIZARRA','POLLA','PARLEY','CIERRA','NO\\s+VA\\s+MAS','DEBE\\s+CONFIRMAR']){
    assert.match(classifier,new RegExp(token));
  }
  assert.match(classifier,/autoEligible:false/);
  assert.match(classifier,/OperationalEntities/);
  assert.match(classifier,/parseBoard/);
  assert.match(classifier,/parseBalances/);
  assert.match(classifier,/parseSettlementRows/);
  assert.match(classifier,/race_close/);
  assert.match(classifier,/settlement_snapshot/);
  assert.match(classifier,/cancel_or_correction/);
});

test('operator exposes read-only shadow projection using RC1-compatible matching constraints',()=>{
  const routes=read('backend/src/modules/hipico-bot/hipico-operator.routes.ts');
  const projection=read('backend/src/modules/hipico-bot/hipico-shadow-projection.ts');
  assert.match(routes,/\/shadow-projection/);
  assert.match(routes,/buildShadowProjection/);
  assert.match(routes,/startsWith\('group:'\)/);
  assert.match(projection,/left\.play===right\.play/);
  assert.match(projection,/left\.horse===right\.horse/);
  assert.match(projection,/left\.sender!==right\.sender/);
  assert.match(projection,/left\.segmentId===right\.segmentId/);
  assert.match(projection,/Math\.min\(player\.remaining,receiver\.remaining\)/);
  assert.match(projection,/lateOffers/);
  assert.match(projection,/mode:'shadow'/);
  assert.doesNotMatch(projection,/INSERT|UPDATE|DELETE|sendCloudText|sendMessage/);
});

test('canonical desktop bridge is Playwright official-web observer with persistent seen IDs',()=>{
  const pkg=JSON.parse(read('tools/hipico-whatsapp-web-bridge/package.json'));
  assert.equal(pkg.version,'1.1.0');
  assert.equal(pkg.dependencies['playwright-core'],'1.62.1');
  assert.equal(pkg.dependencies['whatsapp-web.js'],undefined);
  const runtime=read('tools/hipico-whatsapp-web-bridge/src/index.mjs');
  assert.match(runtime,/https:\/\/web\.whatsapp\.com\//);
  assert.match(runtime,/launchPersistentContext/);
  assert.match(runtime,/HIPICO_ALLOW_SEND debe permanecer false/);
  assert.match(runtime,/seen-message-ids\.json/);
  assert.match(runtime,/baselineCompletedThisRun/);
  assert.match(runtime,/SPOOL_DIR/);
  assert.match(runtime,/rawMeta/);
  const old=read('tools/hipico-whatsapp-bridge/README.md');
  assert.match(old,/DEPRECADO/);
});

test('backend test gate executes every Hipico bot TypeScript test',()=>{
  const pkg=JSON.parse(read('backend/package.json'));
  assert.match(pkg.scripts.test,/src\/modules\/hipico-bot\/\*\.test\.ts/);
});

test('Hipico bot migrations stay product-scoped and add idempotent group audit indexes',()=>{
  const base=read('backend/prisma/migrations/0014_v1126_hipico_bot/migration.sql');
  const eventIndex=read('backend/prisma/migrations/0015_hipico_bot_outbox_event_index/migration.sql');
  const groupIndex=read('backend/prisma/migrations/0016_hipico_bot_group_outbox_idempotency/migration.sql');
  assert.match(base,/HipicoWebhookEvent/);
  assert.match(base,/HipicoBotOutbox/);
  assert.doesNotMatch(base,/Fitness/i);
  assert.match(eventIndex,/HipicoBotOutbox_eventId_idx/);
  assert.match(groupIndex,/UNIQUE INDEX/);
  assert.match(groupIndex,/HipicoBotOutbox_group_event_unique/);
  assert.match(groupIndex,/group_bridge/);
});
