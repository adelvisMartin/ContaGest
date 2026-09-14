import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), 'utf8');
const cliUrl = new URL('../tools/hipico-cli/hipico.mjs', import.meta.url);

test('canonical operator read facade is mounted under /api/v1/hipico with owner/group isolation', async () => {
  const [app, routes] = await Promise.all([
    read('backend/src/app.ts'),
    read('backend/src/modules/hipico/operator-read.routes.ts')
  ]);

  assert.match(app, /import\s+hipicoOperatorReadRoutes\s+from\s+['"]\.\/modules\/hipico\/operator-read\.routes\.js['"]/);
  assert.match(app, /app\.use\(\s*['"]\/api\/v1\/hipico['"][\s\S]{0,900}hipicoOperatorReadRoutes/);

  for (const endpoint of ["'/groups'", "'/messages'", "'/events'", "'/events/stream'", "'/trace/:correlationId'"]) {
    assert.ok(routes.includes(endpoint), `missing canonical operator endpoint ${endpoint}`);
  }

  assert.match(routes, /operatorTokenValid/);
  assert.match(routes, /Cache-Control['"],\s*['"]no-store/);
  assert.match(routes, /WHERE owner_id=\$\{ownerId\}::uuid/);
  assert.match(routes, /group_key=\$\{groupKey\}|channel_key=\$\{groupKey\}/);
});

test('CLI reads groups, messages, events and traces only from the canonical facade', async () => {
  const cliSource = await read('tools/hipico-cli/hipico.mjs');
  const { cleanBaseUrl, commandPlan, parseCommand, requestPlan } = await import(`${cliUrl.href}?operator-read-v290`);
  const group = 'triple-cown';

  assert.equal(commandPlan(parseCommand(['groups'])).path, '/api/v1/hipico/groups');

  const messages = commandPlan(parseCommand(['messages', 'tail', '25', '--group', group]));
  assert.equal(messages.path, '/api/v1/hipico/messages?limit=25');
  assert.equal(messages.auth, 'operator-group');
  assert.equal(messages.group, group);

  const events = commandPlan(parseCommand(['events', 'tail', '40', '--group', group]));
  assert.equal(events.path, '/api/v1/hipico/events?limit=40');
  assert.equal(events.auth, 'operator-group');

  const trace = commandPlan(parseCommand(['trace', 'msg:abc-123', '--group', group]));
  assert.equal(trace.path, '/api/v1/hipico/trace/msg%3Aabc-123');
  assert.equal(trace.auth, 'operator-group');

  assert.equal(commandPlan(parseCommand(['messages', 'tail', '10'])).local, 'group-required');
  assert.doesNotMatch(cliSource, /\/api\/v1\/hipico-bot\/events/);
  assert.throws(
    () => cleanBaseUrl('http://example.com'),
    (error) => error?.code === 'HIPICO_CLI_REMOTE_HTTP_FORBIDDEN'
  );

  let request;
  const response = await requestPlan(messages, {
    baseUrl: 'http://127.0.0.1:3030',
    source: { HIPICO_OPERATOR_CONTROL_TOKEN: 'operator-token-for-contract-test-0001' },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ ok: true, data: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
  });

  assert.equal(response.ok, true);
  assert.equal(request.url, 'http://127.0.0.1:3030/api/v1/hipico/messages?limit=25');
  assert.equal(request.options.headers['x-hipico-group-key'], group);
  assert.equal(request.options.headers['x-hipico-operator-token'], 'operator-token-for-contract-test-0001');
});
