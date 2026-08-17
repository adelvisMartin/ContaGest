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
  assert.match(route, /HIPICO_GROUP_BRIDGE_TOKEN/);
  assert.match(route, /x-hipico-bridge-token/);
  assert.match(route, /waweb:\$\{input\.externalMessageId\}/);
  assert.match(route, /targetType: 'group_bridge'/);
  assert.match(route, /status: 'shadow'/);
  assert.match(route, /actions: \[\]/);
  assert.doesNotMatch(route, /sendCloudText/);
});

test('desktop bridge persists before network and has an independent send kill switch', () => {
  const bridge = read('tools/hipico-whatsapp-bridge/src/index.mjs');
  assert.match(bridge, /const ALLOW_SEND = boolEnv\('HIPICO_ALLOW_SEND', false\)/);
  assert.match(bridge, /const file = await spool\(event\); \/\/ persist locally before any network call/);
  assert.match(bridge, /if \(ALLOW_SEND\)/);
  assert.match(bridge, /setInterval\([\s\S]*5000/);
  assert.match(bridge, /LocalAuth/);
});

test('bridge dependencies are exact and lab config points to production ingest', () => {
  const pkg = JSON.parse(read('tools/hipico-whatsapp-bridge/package.json'));
  assert.equal(pkg.dependencies['whatsapp-web.js'], '1.34.7');
  assert.equal(pkg.dependencies['qrcode-terminal'], '0.12.0');
  assert.match(pkg.scripts.start, /--env-file=\.env/);

  const env = read('tools/hipico-whatsapp-bridge/.env.example');
  assert.match(env, /HIPICO_INGEST_URL=https:\/\/conta-gest-frontend\.vercel\.app\/api\/v1\/hipico-bot\/bridge\/events/);
  assert.match(env, /HIPICO_GROUP_NAME=Control hípico lab/);
  assert.match(env, /HIPICO_ALLOW_SEND=false/);

  const gitignore = read('.gitignore');
  assert.match(gitignore, /tools\/hipico-whatsapp-bridge\/data\//);
});
