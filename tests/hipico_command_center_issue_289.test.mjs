import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('canonical backend mounts Command Center below /api/v1/hipico and keeps bot as adapter', async () => {
  const [app, route, service] = await Promise.all([
    read('backend/src/app.ts'),
    read('backend/src/modules/hipico/command-center.routes.ts'),
    read('backend/src/modules/hipico/command-center.service.ts')
  ]);
  assert.match(app, /hipicoCommandCenterRoutes/);
  assert.match(app, /app\.use\('\/api\/v1\/hipico', authRateLimit, hipicoCommandCenterRoutes\)/);
  assert.match(app, /app\.use\('\/api\/v1\/hipico-bot', hipicoWebhookRoutes\)/);
  assert.match(route, /router\.get\('\/command-center'/);
  assert.match(route, /operatorTokenValid/);
  assert.match(route, /Cache-Control.*no-store/);
  for (const capability of ['buildHipicoSystemStatus','RaceLifecycleStore','PostgresDocumentStore','AutomationStore','createDefaultRacingProviderRegistry']) {
    assert.match(service, new RegExp(capability));
  }
  assert.match(service, /sourceSendPossible:\s*false/);
});

test('canonical read APIs expose groups messages events and trace behind operator auth', async () => {
  const [app, route] = await Promise.all([
    read('backend/src/app.ts'),
    read('backend/src/modules/hipico/operator-read.routes.ts')
  ]);
  assert.match(app, /hipicoOperatorReadRoutes/);
  assert.match(app, /app\.use\('\/api\/v1\/hipico', authRateLimit, hipicoOperatorReadRoutes\)/);
  assert.match(route, /operatorTokenValid/);
  assert.match(route, /Cache-Control.*no-store/);
  for (const endpoint of ["'/groups'", "'/messages'", "'/events/stream'", "'/trace/:correlationId'"]) {
    assert.ok(route.includes(endpoint), `missing canonical local endpoint ${endpoint}`);
  }
  assert.match(route, /owner_id=\$\{owner\}::uuid/);
  assert.match(route, /group_key=\$\{group\}|channel_key=\$\{group\}/);
});

test('PWA BFF authenticates owner and never exposes operator secret to browser runtime', async () => {
  const [bff, runtime, client, shell] = await Promise.all([
    read('frontend/api/hipico/command-center.js'),
    read('frontend/public/hipico-control/runtime-config.js'),
    read('frontend/public/hipico-control/assets/js/command-center.js'),
    read('frontend/public/hipico-control/assets/js/command-center-shell.js')
  ]);
  assert.match(bff, /\/auth\/v1\/user/);
  assert.match(bff, /HIPICO_OWNER_ID/);
  assert.match(bff, /x-hipico-operator-token/);
  assert.doesNotMatch(runtime, /OPERATOR_CONTROL_TOKEN|BOT_OPERATOR_TOKEN/);
  assert.doesNotMatch(client, /OPERATOR_CONTROL_TOKEN|BOT_OPERATOR_TOKEN/);
  assert.doesNotMatch(shell, /OPERATOR_CONTROL_TOKEN|BOT_OPERATOR_TOKEN/);
  assert.match(client, /cache:\s*'no-store'/);
});

test('theme is applied before CSS and persisted without adding a second theme authority', async () => {
  const [index, theme, css] = await Promise.all([
    read('frontend/public/hipico-control/index.html'),
    read('frontend/public/hipico-control/assets/js/theme-bootstrap.js'),
    read('frontend/public/hipico-control/assets/css/app.css')
  ]);
  assert.ok(index.indexOf('./assets/js/theme-bootstrap.js') < index.indexOf('./assets/css/app.css'));
  assert.match(theme, /hipico-control-theme/);
  assert.match(theme, /system.*light.*dark/);
  assert.match(css, /:root\[data-theme="dark"\]/);
  assert.match(css, /:root\[data-theme="system"\]/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test('service worker never caches API/live/auth runtime data and does cache Command Center shell', async () => {
  const sw = await read('frontend/public/hipico-control/sw.js');
  assert.match(sw, /command-center\.js/);
  assert.match(sw, /command-center-shell\.js/);
  assert.match(sw, /theme-bootstrap\.js/);
  assert.match(sw, /isSensitive/);
  assert.match(sw, /fetch\(request, \{ cache: 'no-store' \}\)/);
  assert.match(sw, /runtime-config\.js/);
  assert.match(sw, /build-info\.json/);
});

test('Android parity gate has an explicit finite CSS authority and includes new PWA modules', async () => {
  const sync = await read('android/hipico-control-v1130/scripts/sync-web.mjs');
  for (const file of ['app.css','mobile-accessibility.css','operational-access-guard.css','operational-copy-center.css']) {
    assert.match(sync, new RegExp(file.replace('.', '\\.')));
  }
  for (const file of ['command-center.js','command-center-shell.js','theme-bootstrap.js']) {
    assert.match(sync, new RegExp(file.replace('.', '\\.')));
  }
  assert.match(sync, /verifyParity/);
  assert.match(sync, /sha256/);
});

test('one canonical local CLI powers npm and Windows launchers and refuses insecure remote HTTP', async () => {
  const [cli, pkg, cmd, powershell] = await Promise.all([
    read('tools/hipico-cli/hipico.mjs'),
    read('package.json'),
    read('HIPICO.cmd'),
    read('HIPICO.ps1')
  ]);
  assert.match(pkg, /"hipico":\s*"node tools\/hipico-cli\/hipico\.mjs"/);
  assert.match(cmd, /tools\\hipico-cli\\hipico\.mjs/i);
  assert.match(powershell, /tools[\\/]hipico-cli[\\/]hipico\.mjs/i);
  assert.match(cli, /HIPICO_CLI_REMOTE_HTTP_FORBIDDEN/);
  assert.match(cli, /http:\/\/127\.0\.0\.1:3030/);
  assert.match(cli, /HIPICO_OPERATOR_CONTROL_TOKEN/);
  assert.match(cli, /HIPICO_GROUP_BRIDGE_TOKEN/);
  assert.doesNotMatch(cli, /--token/);
  for (const command of ['version','status','readiness','command-center','groups','meetings','races','documents','providers','messages tail','events tail','trace','bridge-health','doctor']) {
    assert.ok(cli.includes(command), `missing CLI command ${command}`);
  }
});

test('design-system document defines observable states and WCAG/mobile contracts', async () => {
  const doc = await read('docs/hipico/design-system.md');
  for (const term of ['loading','empty','error','success','disabled','offline/stale','360','390','430','WCAG 2.2 AA','44 px','system','light','dark']) {
    assert.ok(doc.includes(term), `missing design-system contract: ${term}`);
  }
});
