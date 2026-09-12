import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalBackendOrigin, buildCanonicalUrl } from '../frontend/api/hipico/canonical-backend.js';

void test('production canonical backend requires an explicit independent HTTPS origin', () => {
  assert.equal(canonicalBackendOrigin({ VERCEL_ENV: 'production', VERCEL_URL: 'frontend.vercel.app' }), '');
  assert.equal(canonicalBackendOrigin({ NODE_ENV: 'production', HIPICO_CANONICAL_API_BASE_URL: 'https://backend.example.com' }), 'https://backend.example.com');
  assert.equal(canonicalBackendOrigin({ NODE_ENV: 'production', HIPICO_CANONICAL_API_BASE_URL: 'http://backend.example.com' }), '');
});

void test('development canonical backend allows only local HTTP fallback', () => {
  assert.equal(canonicalBackendOrigin({ NODE_ENV: 'development', HIPICO_CANONICAL_API_BASE_URL: 'http://10.0.0.2:3030' }), '');
  assert.equal(canonicalBackendOrigin({ NODE_ENV: 'development' }), 'http://127.0.0.1:3030');
});

void test('canonical adapter only accepts Hípico API paths', () => {
  const source = { VERCEL_ENV: 'preview', HIPICO_CANONICAL_API_BASE_URL: 'https://backend-preview.example.com' };
  assert.equal(buildCanonicalUrl('/api/v1/hipico-bot/bridge/events', source), 'https://backend-preview.example.com/api/v1/hipico-bot/bridge/events');
  assert.throws(() => buildCanonicalUrl('/api/v1/auth/login', source), /HIPICO_CANONICAL_PATH_NOT_ALLOWED/);
});
