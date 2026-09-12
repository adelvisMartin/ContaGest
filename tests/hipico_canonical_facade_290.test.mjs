import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), 'utf8');

test('Control Hipico exposes an independent canonical /api/v1/hipico facade while keeping hipico-bot as adapter', async () => {
  const [app, domain, systemRoutes, commandRoutes, readRoutes] = await Promise.all([
    read('backend/src/app.ts'),
    read('backend/src/modules/hipico/hipico-domain.ts'),
    read('backend/src/modules/hipico/hipico-system.routes.ts'),
    read('backend/src/modules/hipico/command-center.routes.ts'),
    read('backend/src/modules/hipico/operator-read.routes.ts')
  ]);

  assert.match(domain, /HIPICO_API_VERSION\s*=\s*['"]1['"]/);
  assert.match(domain, /HIPICO_BRIDGE_PROTOCOL_VERSION\s*=\s*['"]1['"]/);
  assert.match(app, /hipicoSystemRoutes/);
  assert.match(app, /hipicoCommandCenterRoutes/);
  assert.match(app, /hipicoOperatorReadRoutes/);
  assert.match(app, /app\.use\('\/api\/v1\/hipico', authRateLimit, hipicoSystemRoutes\)/);
  assert.match(app, /app\.use\('\/api\/v1\/hipico', authRateLimit, hipicoCommandCenterRoutes\)/);
  assert.match(app, /app\.use\('\/api\/v1\/hipico', authRateLimit, hipicoOperatorReadRoutes\)/);
  assert.match(app, /app\.use\('\/api\/v1\/hipico-bot', hipicoWebhookRoutes\)/);
  assert.match(systemRoutes, /router\.get\('\/version'/);
  assert.match(systemRoutes, /router\.get\('\/status'/);
  assert.match(systemRoutes, /router\.get\('\/readiness'/);
  assert.match(commandRoutes, /router\.get\('\/command-center'/);
  for (const endpoint of ["'/groups'", "'/messages'", "'/events'", "'/events/stream'", "'/trace/:correlationId'"]) {
    assert.ok(readRoutes.includes(endpoint), `missing canonical operator endpoint ${endpoint}`);
  }
  for (const source of [systemRoutes, commandRoutes, readRoutes]) {
    assert.match(source, /operatorTokenValid/);
    assert.match(source, /Cache-Control.*no-store|Cache-Control['"],\s*['"]no-store/);
  }
});

test('PWA command center BFF delegates to the canonical backend without exposing operator credentials', async () => {
  const [bff, runtime, client] = await Promise.all([
    read('frontend/api/hipico/command-center.js'),
    read('frontend/public/hipico-control/runtime-config.js'),
    read('frontend/public/hipico-control/assets/js/command-center.js')
  ]);
  assert.match(bff, /\/api\/v1\/hipico\/command-center/);
  assert.doesNotMatch(bff, /\/api\/v1\/hipico-bot\/outbox|\/api\/v1\/hipico-bot\/shadow-projection/);
  assert.doesNotMatch(runtime, /HIPICO_OPERATOR_CONTROL_TOKEN|HIPICO_BOT_OPERATOR_TOKEN|HIPICO_GROUP_BRIDGE_TOKEN/);
  assert.doesNotMatch(client, /HIPICO_OPERATOR_CONTROL_TOKEN|HIPICO_BOT_OPERATOR_TOKEN|HIPICO_GROUP_BRIDGE_TOKEN/);
  assert.match(client, /cache:\s*'no-store'/);
});
