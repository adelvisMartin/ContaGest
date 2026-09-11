import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('all canonical privileged Hípico route families fail closed behind operator authentication', async () => {
  const routes = await Promise.all([
    'command-center.routes.ts',
    'operator-read.routes.ts',
    'provider.routes.ts',
    'race.routes.ts',
    'document.routes.ts',
    'agent.routes.ts'
  ].map((name) => read(`backend/src/modules/hipico/${name}`)));
  for (const source of routes) {
    assert.match(source, /operatorTokenValid/);
    assert.match(source, /HIPICO_OPERATOR_UNAUTHORIZED/);
    assert.match(source, /Cache-Control['"],\s*['"]no-store|Cache-Control.*no-store/);
  }
});

test('browser runtime cannot obtain operator or bridge credentials', async () => {
  const [runtime, commandCenter, shell] = await Promise.all([
    read('frontend/public/hipico-control/runtime-config.js'),
    read('frontend/public/hipico-control/assets/js/command-center.js'),
    read('frontend/public/hipico-control/assets/js/command-center-shell.js')
  ]);
  for (const source of [runtime, commandCenter, shell]) {
    assert.doesNotMatch(source, /HIPICO_OPERATOR_CONTROL_TOKEN|HIPICO_BOT_OPERATOR_TOKEN|HIPICO_GROUP_BRIDGE_TOKEN/);
  }
});

test('PDF production extractor never invokes a shell and uses bounded isolated temporary files', async () => {
  const extractor = await read('backend/src/modules/hipico/document-extractor.ts');
  assert.match(extractor, /execFile/);
  assert.match(extractor, /mkdtemp/);
  assert.match(extractor, /mode:\s*0o600/);
  assert.match(extractor, /MAX_TOOL_OUTPUT/);
  assert.match(extractor, /TOOL_TIMEOUT_MS/);
  assert.match(extractor, /OCR_MAX_PAGES/);
  assert.doesNotMatch(extractor, /execSync|\bexec\s*\(|shell:\s*true/);
});

test('provider SSRF boundary is HTTPS allowlist-only with no redirects or arbitrary path input', async () => {
  const provider = await read('backend/src/modules/hipico-bot/hipico-race-provider.ts');
  assert.match(provider, /RACE_PROVIDER_VENDOR_DOMAINS/);
  assert.match(provider, /url\.protocol !== 'https:'/);
  assert.match(provider, /url\.username \|\| url\.password \|\| url\.search \|\| url\.hash/);
  assert.match(provider, /redirect:\s*'error'/);
  assert.match(provider, /\^\\d\{1,18\}\$/);
  assert.match(provider, /MAX_RACE_PROVIDER_RESPONSE_BYTES/);
});

test('production PostgreSQL E2E explicitly covers replay group isolation document hostility and agent ledger boundary', async () => {
  const e2e = await read('backend/src/modules/hipico/production-e2e-v290.ts');
  assert.match(e2e, /replay-safe|replay/i);
  assert.match(e2e, /multi-group A\/B concurrent writes have zero cross-group reads/);
  assert.match(e2e, /PDF_ACTIVE_CONTENT_REJECTED/);
  assert.match(e2e, /PDF_TOO_LARGE/);
  assert.match(e2e, /agent source group remains shadow-only/);
  assert.match(e2e, /hipico_ledger_entries/);
  assert.match(e2e, /sourceSendPossible, false/);
});

test('agent policy tests reject shell secret and monetary automatic bypass paths', async () => {
  const policy = await read('backend/src/modules/hipico/agent-policy.test.ts');
  assert.match(policy, /shell:'rm -rf/);
  assert.match(policy, /token:'secret'/);
  assert.match(policy, /risk:'monetary'/);
  assert.match(policy, /SHADOW/);
  assert.match(policy, /ASSISTED/);
});
