import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  assertAudienceIsolation,
  assertOperationIds,
  buildProjection,
  classifyCompatibility,
  renderTypedClient,
  stableJson,
} from '../scripts/generated-api-contract-v850.mjs';

const contract = {
  schemaVersion: 652,
  apiVersion: '1.0.0',
  conventions: {
    correlationHeader: 'x-correlation-id',
    errorEnvelope: {
      required: ['ok', 'code', 'message', 'correlationId', 'type', 'title', 'status', 'detail'],
      optional: ['requestId', 'details', 'instance'],
    },
    pagination: { style: 'take-skip', filter: 'q' },
  },
  routes: [
    {
      method: 'GET', path: '/health', auth: { tenantRequired: false, permissions: [] },
      request: { bodySchema: null }, responses: { success: [200], errors: [] }, envelope: 'probe', deprecated: false, source: 'health.ts',
    },
    {
      method: 'GET', path: '/api/v1/clients/:id', auth: { tenantRequired: true, permissions: ['clients.manage'] },
      request: { bodySchema: null, query: { take: { type: 'integer' }, q: { type: 'string' } } },
      responses: { success: [200], errors: [401, 403, 404] }, envelope: 'canonical', deprecated: false, source: 'clients.routes.ts',
    },
  ],
  conflicts: [],
};

test('projection is deterministic and public audience excludes privileged operations', () => {
  const first = buildProjection(contract, { audience: 'all' });
  const second = buildProjection(contract, { audience: 'all' });
  assert.equal(stableJson(first), stableJson(second));
  const publicDoc = buildProjection(contract, { audience: 'public' });
  assert.ok(publicDoc.paths['/health']);
  assert.equal(publicDoc.paths['/api/v1/clients/{id}'], undefined);
  assert.doesNotThrow(() => assertAudienceIsolation(publicDoc));
});

test('operation ids are required, stable and unique', () => {
  const doc = buildProjection(contract, { audience: 'all' });
  assert.equal(doc.paths['/api/v1/clients/{id}'].get.operationId, 'getApiV1ClientsById');
  assert.doesNotThrow(() => assertOperationIds(doc));
  const missing = structuredClone(doc);
  delete missing.paths['/health'].get.operationId;
  assert.throws(() => assertOperationIds(missing), /OPENAPI_OPERATION_ID_MISSING/);
  const duplicate = structuredClone(doc);
  duplicate.paths['/api/v1/clients/{id}'].get.operationId = duplicate.paths['/health'].get.operationId;
  assert.throws(() => assertOperationIds(duplicate), /OPENAPI_OPERATION_ID_DUPLICATE/);
});

test('canonical errors project RFC9457-style diagnostics without dropping compatible fields', () => {
  const schema = buildProjection(contract, { audience: 'all' }).components.schemas.ProblemDetails;
  for (const key of ['type','title','status','detail','code','message','correlationId']) assert.ok(schema.properties[key], key);
  assert.ok(schema.properties.requestId);
  assert.ok(schema.properties.instance);
  assert.ok(schema.properties.details);
});

test('typed client is generated from operation ids and serializes path/query through a transport', () => {
  const client = renderTypedClient(buildProjection(contract, { audience: 'all' }));
  assert.match(client, /DO NOT EDIT/);
  assert.match(client, /getApiV1ClientsById/);
  assert.match(client, /encodeURIComponent/);
  assert.match(client, /URLSearchParams/);
  assert.match(client, /transport\.request/);
});

test('compatibility classifier separates additive, behavior-sensitive, and breaking changes', () => {
  const base = buildProjection(contract, { audience: 'all' });
  const additiveContract = structuredClone(contract);
  additiveContract.routes.push({
    method:'GET', path:'/api/v1/vendors', auth:{tenantRequired:true,permissions:['vendors.read']},
    request:{bodySchema:null}, responses:{success:[200],errors:[401,403]}, envelope:'canonical', deprecated:false, source:'vendors.routes.ts'
  });
  assert.equal(classifyCompatibility(base, buildProjection(additiveContract, { audience:'all' })).classification, 'additive');

  const behavior = structuredClone(contract);
  behavior.routes[1].request.bodySchema = 'expr:changed';
  assert.equal(classifyCompatibility(base, buildProjection(behavior, { audience:'all' })).classification, 'behavior-sensitive');

  const breaking = structuredClone(contract);
  breaking.routes = breaking.routes.filter((route) => route.path !== '/api/v1/clients/:id');
  assert.equal(classifyCompatibility(base, buildProjection(breaking, { audience:'all' })).classification, 'breaking');
});

test('tracked client slice is regenerated exactly and the migrated consumer has no handwritten clients endpoint', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const generated = await readFile(new URL('../frontend/src/generated/api-client-v850.ts', import.meta.url), 'utf8');
  assert.match(generated, /createApiV1Clients/);
  assert.match(generated, /deleteApiV1ClientsById/);
  assert.match(generated, /getApiV1Clients/);

  const sync = await readFile(new URL('../frontend/src/services/supabaseSyncService.js', import.meta.url), 'utf8');
  assert.match(sync, /createGeneratedApiClient/);
  assert.match(sync, /GeneratedApi\.getApiV1Clients\(\)/);
  assert.match(sync, /GeneratedApi\.createApiV1Clients/);
  assert.match(sync, /GeneratedApi\.deleteApiV1ClientsById/);
  assert.doesNotMatch(sync, /BackendApi\.list\(['"]clients['"]\)/);
  assert.doesNotMatch(sync, /BackendApi\.create\(['"]clients['"]\)/);
  assert.doesNotMatch(sync, /BackendApi\.remove\(['"]clients['"]/);

  const adapter = await readFile(new URL('../frontend/src/services/generatedApiTransport.js', import.meta.url), 'utf8');
  assert.match(adapter, /BackendApi\.request/);
  assert.match(adapter, /\^\\\/api\\\/v1/);

  const result = spawnSync(process.execPath, ['scripts/generated-api-contract-v850.mjs', '--check', '--base', 'main', '--audience', 'all'], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    env: process.env,
  });
  assert.equal(result.status, 0, `${result.stdout || ''}\n${result.stderr || ''}`);
  assert.match(result.stdout, /"ticket":\s*850/);
  assert.match(result.stdout, /"source":\s*652/);
});
