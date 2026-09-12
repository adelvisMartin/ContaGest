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

test('official source creates only a lab simulation for live events and never an outbound action',()=>{
  const route=read('backend/src/modules/hipico-bot/hipico-bridge.routes.ts');
  assert.match(route,/channelRole:z\.enum\(\['source','lab'\]\)/);
  assert.match(route,/if\(input\.channelRole!==['"]source['"]\|\|input\.historySync\)return null/);
  assert.match(route,/labSimulation:buildLabSimulation/);
  assert.match(route,/SOLO LABORATORIO/);
  assert.match(route,/actions:\[\]/);
  assert.doesNotMatch(route,/sendCloudText|sendMessage/);
});

test('canonical shadow may provision only the configured official source from existing lab owner',()=>{
  const store=read('backend/src/modules/hipico-bot/hipico-canonical-shadow.store.ts');
  assert.match(store,/OFFICIAL_SOURCE_CHANNEL_KEY/);
  assert.match(store,/club-hipico-triple-crown-official/);
  assert.match(store,/DEFAULT_LAB_CHANNEL_KEY/);
  assert.match(store,/control-hipico-lab/);
  assert.match(store,/HIPICO_SOURCE_CHANNEL_KEY_NOT_ALLOWED/);
  assert.match(store,/mode:'source_read_only'/);
  assert.match(store,/auto_send:false/);
  assert.match(store,/mirror_lab_channel_key/);
  assert.match(store,/ON CONFLICT \(owner_id,group_key\)/);
  assert.doesNotMatch(store,/public\.hipico_ledger_entries/);
  assert.doesNotMatch(store,/public\.hipico_outbox/);
  assert.doesNotMatch(store,/sendCloudText|sendMessage/);
  assert.doesNotMatch(store,/a2adb975|de6bc73f|daf36097/);
});

test('canonical shadow dual-write keeps source operations pending and evaluations auditable',()=>{
  const store=read('backend/src/modules/hipico-bot/hipico-canonical-shadow.store.ts');
  assert.match(store,/public\.hipico_messages/);
  assert.match(store,/public\.hipico_operation_events/);
  assert.match(store,/public\.hipico_shadow_evaluations/);
  assert.match(store,/event_state/);
  assert.match(store,/match_status/);
  assert.match(store,/'pending'/);
  assert.match(store,/official-source-to-lab-v1/);
  assert.match(store,/operational_classification/);
});

test('real operational classifier exposes structured RC1 analyzers and manual gates',()=>{
  const classifier=read('backend/src/modules/hipico-bot/hipico-operational-classifier.ts');
  assert.match(classifier,/const\s+playerOffer=/);
  assert.match(classifier,/const\s+receiverOffer=/);
  assert.match(classifier,/const\s+raceClose=/);
  assert.match(classifier,/const\s+balanceSnapshot=/);
  assert.match(classifier,/const\s+PLAY_RE=/);
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

test('Bridge package version follows release policy and keeps a fail-closed LAB-only send path',()=>{
  const pkg=JSON.parse(read('tools/hipico-whatsapp-web-bridge/package.json'));
  const policy=JSON.parse(read('products/hipico-control/release-policy.json'));
  assert.equal(pkg.version,policy.bridgePackageVersion);
  assert.equal(pkg.dependencies['playwright-core'],'1.62.1');
  assert.equal(pkg.dependencies['whatsapp-web.js'],undefined);
  const runtime=read('tools/hipico-whatsapp-web-bridge/src/index.mjs');
  const config=read('tools/hipico-whatsapp-web-bridge/src/runtime-config.mjs');
  assert.match(runtime,/https:\/\/web\.whatsapp\.com\//);
  assert.match(runtime,/launchPersistentContext/);
  assert.match(runtime,/SOURCE_MATCHES/);
  assert.match(config,/HIPICO_SOURCE_CHANNEL_KEY/);
  assert.match(config,/club-hipico-triple-crown-official/);
  assert.match(runtime,/LAB_GROUP_NAME/);
  assert.match(runtime,/LAB_SEND_ENABLED/);
  assert.match(runtime,/Destino lab no autorizado/);
  assert.match(runtime,/async function sendMirrorToLab\(mirror\)[\s\S]*openGroup\(LAB_GROUP_NAME, true\)[\s\S]*assertCurrentLabIdentity\(\)[\s\S]*sendTextInCurrentLab/s);
  assert.match(runtime,/async function sendTextInCurrentLab\(textValue, tag\)[\s\S]*assertCurrentLabIdentity\(\)[\s\S]*keyboard\.insertText[\s\S]*assertCurrentLabIdentity\(\)[\s\S]*keyboard\.press\('Enter'\)[\s\S]*assertCurrentLabIdentity\(\)/s);
  assert.match(runtime,/Envío al grupo fuente: IMPOSIBLE POR DISEÑO/);
  assert.match(runtime,/seen-source-message-ids\.json/);
  assert.match(runtime,/spool-events/);
  assert.match(runtime,/spool-lab-mirror/);
  assert.match(runtime,/openViaSearch/);
  assert.match(runtime,/mediaKind/);
  assert.doesNotMatch(runtime,/HIPICO_ALLOW_SEND/);
  assert.doesNotMatch(runtime,/sendTextInCurrentSource|sendMirrorToSource/);
  const old=read('tools/hipico-whatsapp-bridge/README.md');
  assert.match(old,/DEPRECADO/);
});

test('Bridge environment names source and lab separately and lab send defaults off',()=>{
  const env=read('tools/hipico-whatsapp-web-bridge/.env.example');
  assert.match(env,/HIPICO_RUNTIME_MODE=production/);
  assert.match(env,/HIPICO_BACKEND_SYNC_ENABLED=true/);
  assert.match(env,/HIPICO_SOURCE_GROUP_MATCHES=CLUB HIPICO TRIPLE COWN\|CLUB HIPICO TRIPLE CROWN/);
  assert.match(env,/HIPICO_SOURCE_CHANNEL_KEY=club-hipico-triple-crown-official/);
  assert.match(env,/HIPICO_LAB_GROUP_NAME=Control hípico lab/);
  assert.match(env,/HIPICO_LAB_CHANNEL_KEY=control-hipico-lab/);
  assert.match(env,/HIPICO_LAB_SEND_ENABLED=false/);
});

test('Bridge production readiness is authenticated, persistent and source-send closed',()=>{
  const route=read('backend/src/modules/hipico-bot/hipico-bridge.routes.ts');
  const security=read('backend/src/modules/hipico-bot/hipico-bridge-security.ts');
  const secretSecurity=read('backend/src/modules/hipico-bot/hipico-secret-security.ts');
  const canonical=read('backend/src/modules/hipico-bot/hipico-canonical-shadow.store.ts');
  const preflight=read('tools/hipico-whatsapp-web-bridge/src/preflight.mjs');
  assert.match(route,/\/bridge\/health/);
  assert.match(route,/bridgePersistenceReady/);
  assert.match(route,/canonicalShadowReadiness/);
  assert.match(route,/sourceSendPossible:false/);
  assert.match(security,/MIN_BRIDGE_TOKEN_LENGTH=MIN_HIPICO_RUNTIME_SECRET_BYTES/);
  assert.match(secretSecurity,/MIN_HIPICO_RUNTIME_SECRET_BYTES=32/);
  assert.match(canonical,/LAB_CHANNEL_NOT_UNIQUE|labChannelCount/);
  assert.match(preflight,/body\?\.ready !== true/);
  assert.match(preflight,/body\?\.sourceSendPossible !== false/);
});

test('backend exposes a dedicated executable Hipico test gate and the general suite includes Hipico tests',()=>{
  const pkg=JSON.parse(read('backend/package.json'));
  assert.match(pkg.scripts['test:hipico'],/src\/modules\/hipico-bot\/\*\.test\.ts/);
  assert.match(pkg.scripts.test,/src\/modules\/hipico-bot\/\*\.test\.ts|npm run test:hipico/);
});

test('Hipico bot migrations stay product-scoped and add idempotent group audit indexes',()=>{
  const base=read('backend/prisma/migrations/0014_v1126_hipico_bot/migration.sql');
  const eventIndex=read('backend/prisma/migrations/0015_hipico_bot_outbox_event_index/migration.sql');
  const groupIndex=read('backend/prisma/migrations/0016_hipico_bot_group_outbox_idempotency/migration.sql');
  assert.match(base,/CREATE TABLE IF NOT EXISTS public\."HipicoWebhookEvent"/);
  assert.match(base,/CREATE TABLE IF NOT EXISTS public\."HipicoBotOutbox"/);
  assert.doesNotMatch(base,/CREATE\s+TABLE[^;]*Fitness/is);
  assert.match(eventIndex,/HipicoBotOutbox_eventId_idx/);
  assert.match(groupIndex,/UNIQUE INDEX/);
  assert.match(groupIndex,/HipicoBotOutbox_group_event_unique/);
  assert.match(groupIndex,/group_bridge/);
});
