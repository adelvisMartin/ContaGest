import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AccessControlService } from '../frontend/src/services/accessControlService.js';
import { installSessionAccessGuard } from '../frontend/src/services/sessionAccessGuard.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('administrator wildcard permission can open every catalogued module', async () => {
  installSessionAccessGuard();
  await Promise.resolve();
  const state = {
    rbac: AccessControlService.defaultState(),
    profile: { role:'Administrador', permissions:['*'] }
  };
  for (const module of AccessControlService.modules) {
    assert.equal(AccessControlService.canAccessRoute(state, module.route), true, `admin should access ${module.route}`);
  }
});

test('session guard explicitly honors wildcard permissions and Spanish administrator role', async () => {
  const source = await read('frontend/src/services/sessionAccessGuard.js');
  assert.match(source, /permissions\.includes\('\*'\)/);
  assert.match(source, /administrador/);
  assert.match(source, /normalize\('NFD'\)/);
});

test('commercial license restrictions are applied only to client-audience sessions', async () => {
  const app = await read('frontend/src/app.js');
  assert.match(app, /allowedByRole=originalCanAccess\(state,route\)/);
  assert.match(app, /session\?\.audience==='client'/);
  assert.match(app, /if\(!enforceLicense\)return true/);
});

test('WhatsApp support uses a configured phone instead of a phone-less wa.me link', async () => {
  const layout = await read('frontend/src/components/layout.js');
  assert.match(layout, /state\.settings\?\.whatsappBusinessNumber \|\| state\.support\?\.whatsapp \|\| state\.settings\?\.companyPhone/);
  assert.match(layout, /api\.whatsapp\.com\/send\?phone=\$\{phone\}&text=\$\{text\}/);
  assert.match(layout, /id="btnWhatsappSupport"/);
  assert.doesNotMatch(layout, /href="https:\/\/wa\.me\/\?text=/);
});
