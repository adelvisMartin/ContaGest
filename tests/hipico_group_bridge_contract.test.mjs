import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('normal WhatsApp group bridge is isolated from Meta webhook and browser CSRF', () => {
  const app = read('backend/src/app.ts');
  const bridgeMount = app.indexOf("app.use('/api/v1/hipico-bot', authRateLimit, hipicoBridgeRoutes)");
  const csrfMount = app.indexOf('app.use(csrfProtection)');
  assert.ok(bridgeMount > 0, 'bridge route must be mounted');
  assert.ok(csrfMount > bridgeMount, 'bridge token route must be mounted before browser CSRF');
  assert.match(app, /hipico-bridge\.routes\.js/);
});

test('group ingestion is authenticated, deduplicated and shadow-only', () => {
  const route = read('backend/src/modules/hipico-bot/hipico-bridge.routes.ts');
  const security = read('backend/src/modules/hipico-bot/hipico-bridge-security.ts');
  assert.match(security, /HIPICO_GROUP_BRIDGE_TOKEN/);
  assert.match(security, /timingSafeEqual/);
  assert.match(route, /x-hipico-bridge-token/);
  assert.match(route, /waweb:\$\{input\.externalMessageId\}/);
  assert.match(route, /targetType:'group_bridge'|targetType: 'group_bridge'/);
  assert.match(route, /status:'shadow'|status: 'shadow'/);
  assert.match(route, /actions:\s*\[\]/);
  assert.doesNotMatch(route, /sendCloudText/);
});

test('backend distinguishes replay identity conflicts from retryable persistence failures', () => {
  const route = read('backend/src/modules/hipico-bot/hipico-bridge.routes.ts');
  const transport = read('backend/src/modules/hipico-bot/hipico-bridge-transport.store.ts');
  const canonical = read('backend/src/modules/hipico-bot/hipico-canonical-shadow.store.ts');
  assert.match(route, /REPLAY_IDENTITY_MISMATCH/);
  assert.match(route, /res\.status\(409\)\.json\(\{ok:false,retryable:false/);
  assert.match(route, /res\.status\(503\)\.json\(\{ok:false,retryable:true/);
  assert.match(transport, /HIPICO_TRANSPORT_REPLAY_MISMATCH|assertReplayMatch\('transport'/);
  assert.match(canonical, /HIPICO_CANONICAL_REPLAY_MISMATCH|assertReplayMatch\('canonical'/);
  assert.doesNotMatch(canonical, /ON CONFLICT \(owner_id,channel_key,external_message_id\)[\s\S]{0,120}DO UPDATE SET/);
});

test('desktop bridge requires pinned SOURCE/LAB and can never send to SOURCE', () => {
  const bridge = read('tools/hipico-whatsapp-bridge/src/index.mjs');
  assert.match(bridge, /const ALLOW_SEND = boolEnv\('HIPICO_ALLOW_SEND', false\)/);
  assert.match(bridge, /requires pinned HIPICO_SOURCE_GROUP_ID and HIPICO_LAB_GROUP_ID/);
  assert.match(bridge, /\^\\d\{5,\}\(\?:-\\d\+\)\?@g\\\.us\$/);
  assert.match(bridge, /SOURCE_GROUP_ID_ENV === LAB_GROUP_ID_ENV/);
  assert.match(bridge, /SOURCE_CHANNEL_KEY === LAB_CHANNEL_KEY/);
  assert.match(bridge, /if \(ALLOW_SEND && labText\) await client\.sendMessage\(lab\.id, labText\)/);
  assert.doesNotMatch(bridge, /client\.sendMessage\(source\.id/);
  assert.match(bridge, /getChatById\(id\)/);
  assert.doesNotMatch(bridge, /client\.getChats\(\)/);
  assert.match(bridge, /setInterval\([\s\S]*5000/);
  assert.match(bridge, /LocalAuth/);
});

test('local bridge spool is private, create-once and rejects conflicting replay content', () => {
  const bridge = read('tools/hipico-whatsapp-bridge/src/index.mjs');
  assert.match(bridge, /mode:\s*0o700/);
  assert.match(bridge, /fs\.chmod\(dir, 0o700\)/);
  assert.match(bridge, /flag:\s*'wx'/);
  assert.match(bridge, /mode:\s*0o600/);
  assert.match(bridge, /replaySignature\(existing\) === replaySignature\(event\)/);
  assert.match(bridge, /HIPICO_LOCAL_SPOOL_REPLAY_MISMATCH/);
  assert.match(bridge, /safeRef\(/);
  assert.doesNotMatch(bridge, /console\.log\(`Fuente: \$\{source\.name\} :: \$\{source\.id\}`\)/);
});

test('permanent or corrupt bridge events are quarantined instead of retried forever or deleted', () => {
  const bridge = read('tools/hipico-whatsapp-bridge/src/index.mjs');
  assert.match(bridge, /const REJECTED_DIR = path\.join\(DATA_DIR, 'rejected'\)/);
  assert.match(bridge, /payload\?\.retryable === false \? false/);
  assert.match(bridge, /error\?\.retryable === false/);
  assert.match(bridge, /await quarantine\(file, error\)/);
  assert.match(bridge, /INVALID_LOCAL_SPOOL/);
  assert.match(bridge, /\.meta\.json/);
  assert.doesNotMatch(bridge, /catch \{\s*await fs\.unlink\(file\)/);
});

test('bridge dependencies and example config are exact, shadow-only and pinned', () => {
  const pkg = JSON.parse(read('tools/hipico-whatsapp-bridge/package.json'));
  assert.equal(pkg.dependencies['whatsapp-web.js'], '1.34.7');
  assert.equal(pkg.dependencies['qrcode-terminal'], '0.12.0');
  assert.match(pkg.scripts.start, /--env-file=\.env/);

  const env = read('tools/hipico-whatsapp-bridge/.env.example');
  assert.match(env, /HIPICO_INGEST_URL=https:\/\/conta-gest-frontend\.vercel\.app\/api\/v1\/hipico-bot\/bridge\/events/);
  assert.match(env, /HIPICO_SHADOW_MODE=true/);
  assert.match(env, /HIPICO_SOURCE_GROUP_ID=120363000000000000@g\.us/);
  assert.match(env, /HIPICO_LAB_GROUP_ID=120363111111111111@g\.us/);
  assert.match(env, /HIPICO_SOURCE_CHANNEL_KEY=club-hipico-triple-crown-official/);
  assert.match(env, /HIPICO_LAB_CHANNEL_KEY=control-hipico-lab/);
  assert.match(env, /HIPICO_ALLOW_SEND=false/);
  assert.doesNotMatch(env, /HIPICO_GROUP_NAME=/);

  const gitignore = read('.gitignore');
  assert.match(gitignore, /tools\/hipico-whatsapp-bridge\/data\//);
});