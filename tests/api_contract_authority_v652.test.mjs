import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  API_CONTRACT_VERSION,
  assertNoRouteConflicts,
  compareApiContracts,
  normalizeApiPath,
  stableContractHash,
  validateEnvelopeSources,
} from '../scripts/api-contract-authority-v652.mjs';

const route = (overrides = {}) => ({
  method: 'GET', path: '/api/v1/clients',
  auth: { tenantRequired: true, permissions: ['clients.manage'] },
  request: { bodySchema: null }, responses: { success: [200], errors: [401, 403] }, deprecated: false,
  ...overrides,
});

const manifest = (routes) => ({
  schemaVersion: 652, apiVersion: API_CONTRACT_VERSION,
  conventions: {
    successEnvelope: { required: ['ok', 'data', 'meta'] },
    errorEnvelope: { required: ['ok', 'message', 'requestId'], optional: ['code', 'details'] },
    correlationHeader: 'x-request-id',
    pagination: { style: 'take-skip', takeDefault: 100, takeMax: 500, skipMax: 1000000, headers: ['X-CG-Page-Take', 'X-CG-Page-Skip'] },
  }, routes,
});

test('path normalization is deterministic for mounted and dynamic routes', () => {
  assert.equal(normalizeApiPath('/api/v1/', '/clients/:id'), '/api/v1/clients/:id');
  assert.equal(normalizeApiPath('/api/v1', '/'), '/api/v1');
});

test('duplicate method/path contracts fail closed', () => {
  assert.throws(() => assertNoRouteConflicts([route(), route()]), /API_CONTRACT_DUPLICATE_ROUTE:GET \/api\/v1\/clients/);
});

test('compatibility gate rejects removed routes, stricter RBAC, schema drift and removed success codes', () => {
  const base = manifest([route()]);
  assert.match(compareApiContracts(base, manifest([])).breaking.join('\n'), /ROUTE_REMOVED/);
  assert.match(compareApiContracts(base, manifest([route({ auth: { tenantRequired: true, permissions: ['clients.manage', 'clients.export'] } })])).breaking.join('\n'), /RBAC_TIGHTENED/);
  assert.match(compareApiContracts(base, manifest([route({ request: { bodySchema: 'sha256:new' } })])).breaking.join('\n'), /REQUEST_SCHEMA_CHANGED/);
  assert.match(compareApiContracts(manifest([route({ responses: { success: [200, 201], errors: [401, 403] } })]), base).breaking.join('\n'), /SUCCESS_STATUS_REMOVED/);
});

test('additive routes and error statuses remain backwards compatible', () => {
  const base = manifest([route()]);
  const next = manifest([route({ responses: { success: [200], errors: [401, 403, 422] } }), route({ method: 'POST', path: '/api/v1/clients/search' })]);
  assert.deepEqual(compareApiContracts(base, next).breaking, []);
});

test('manifest hash is stable across object-key ordering', () => {
  assert.equal(stableContractHash({ b: 2, a: 1 }), stableContractHash({ a: 1, b: 2 }));
});

test('canonical success/error envelopes and correlation are verified from source, not duplicated docs', () => {
  const httpSource = `res.status(httpStatus).json({ ok: true, data, meta });`;
  const errorSource = `const payload = { ok: false, message: publicMessage, requestId }; if (errorCode) payload.code = errorCode; payload.details = error.details;`;
  const securitySource = `res.setHeader('x-request-id', id);`;
  assert.doesNotThrow(() => validateEnvelopeSources({ httpSource, errorSource, securitySource }));
  assert.throws(() => validateEnvelopeSources({ httpSource: 'json({data})', errorSource, securitySource }), /API_SUCCESS_ENVELOPE_DRIFT/);
});

test('#652 is in the authoritative contracts consumed by #630 backend/full verification', async () => {
  const runner = await readFile(new URL('../scripts/local-verification-runner-v630.mjs', import.meta.url), 'utf8');
  const authoritative = await readFile(new URL('../scripts/run-authoritative-contracts.mjs', import.meta.url), 'utf8');
  assert.match(runner, /gate\('backend-tests','npm test'\)/);
  assert.match(authoritative, /tests\/api_contract_authority_v652\.test\.mjs/);
});

test('source-derived contract gate compares merge-base to current candidate', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const result = spawnSync(process.execPath, ['scripts/api-contract-authority-v652.mjs', '--check', '--base', 'main'], { cwd: root, encoding: 'utf8', shell: false, env: process.env });
  assert.equal(result.status, 0, `${result.stdout || ''}\n${result.stderr || ''}`);
  assert.match(result.stdout, /"schemaVersion":\s*652/);
  assert.match(result.stdout, /"candidateSha":\s*"[0-9a-f]{40}"/);
});
