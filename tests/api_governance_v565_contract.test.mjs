import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const policy = JSON.parse(fs.readFileSync('backend/src/shared/contracts/api-contract-v1.json', 'utf8'));
const governance = fs.readFileSync('backend/src/shared/contracts/apiGovernance.ts', 'utf8');
const errorMiddleware = fs.readFileSync('backend/src/shared/middleware/error.ts', 'utf8');
const http = fs.readFileSync('backend/src/shared/http.ts', 'utf8');
const legacyProvider = fs.readFileSync('backend/src/modules/hipico-bot/hipico-provider.routes.ts', 'utf8');
const generator = fs.readFileSync('scripts/generate-api-inventory-v565.mjs', 'utf8');

test('#565 machine-readable policy defines v1, stable representations and compatibility rules', () => {
  assert.equal(policy.apiVersion, 'v1');
  assert.equal(policy.basePath, '/api/v1');
  assert.deepEqual(policy.errorEnvelope.required, ['ok', 'message', 'requestId']);
  assert.equal(policy.pagination.query.take.maximum, 500);
  assert.equal(policy.idempotency.header, 'Idempotency-Key');
  assert.equal(policy.webhooks.signatureRequired, true);
  assert.equal(policy.breakingChanges.canonicalHipicoPrefix, '/api/v1/hipico');
  assert.match(policy.breakingChanges.rule, /new API major version|compatibility adapter/i);
});

test('#565 unhandled 5xx is generic and error envelope carries correlation id/code', () => {
  assert.match(errorMiddleware, /status >= 500 \? 'Error interno del servidor\.'/);
  assert.doesNotMatch(errorMiddleware, /DATABASE_URL debe usar/);
  assert.match(errorMiddleware, /payload\.code = errorCode/);
  assert.match(http, /requestId/);
  assert.match(http, /ok: false/);
});

test('#565 legacy Hípico provider adapter publishes deprecation/successor headers and canonical errors', () => {
  assert.match(governance, /Deprecation/);
  assert.match(governance, /successor-version/);
  assert.match(governance, /Sunset/);
  assert.match(legacyProvider, /setLegacyApiDeprecationHeaders/);
  assert.match(legacyProvider, /\/api\/v1\/hipico\/providers/);
  assert.match(legacyProvider, /HIPICO_LEGACY_PROVIDER_SUNSET/);
  assert.match(legacyProvider, /fail\(req, res/);
});

test('#565 inventory generator scans runtime route declarations and fails closed on missing canonical mounts', () => {
  assert.ok(generator.includes("file.endsWith('.routes.ts')"));
  assert.ok(generator.includes('(get|post|put|patch|delete)'));
  assert.match(generator, /route-manifest\.ts/);
  assert.match(generator, /backend\/src\/app\.ts/);
  assert.match(generator, /Canonical \/api\/v1\/hipico mount is missing/);
  assert.match(generator, /fingerprint/);
});
