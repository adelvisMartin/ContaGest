import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../backend/src/app.ts');
const shared = read('../frontend/api/hipico/_shared.js');
const bridge = read('../frontend/api/hipico/group-bridge-ingest.js');
const webhook = read('../frontend/api/hipico/whatsapp-webhook.js');
const identity = read('../frontend/api/hipico/bridge-identity.js');
const canonicalBackend = read('../frontend/api/hipico/canonical-backend.js');

void test('Platform 2.0 modules and hardened event safety facade share one canonical backend authority', () => {
  for (const route of ['/api/v1/hipico/system', '/api/v1/hipico/documents', '/api/v1/hipico']) assert.ok(app.includes(route));
  for (const symbol of ['hipicoSystemRoutes', 'hipicoDocumentRoutes', 'hipicoProviderRoutes', 'hipicoRaceRoutes', 'hipicoAgentRoutes', 'hipicoCanonicalRoutes']) assert.ok(app.includes(symbol));
  assert.match(app, /app\.use\('\/api\/v1\/hipico', authRateLimit, mutationRateLimit, hipicoCanonicalRoutes\)/);
});

void test('serverless ingress remains transport-only and canonical backend is explicit in production', () => {
  for (const source of [bridge, webhook]) {
    assert.match(source, /proxyCanonicalRequest/);
    assert.doesNotMatch(source, /supabase\(/);
    assert.doesNotMatch(source, /classifyText/);
  }
  assert.doesNotMatch(shared, /export function classifyText/);
  assert.doesNotMatch(shared, /adapterCaptureDecision/);
  assert.match(shared, /serverSecret\('HIPICO_SUPABASE_SERVICE_ROLE_KEY'\)/);
  assert.doesNotMatch(canonicalBackend, /VERCEL_URL/);
});

void test('generic Control Hípico identity replaces legacy group branding', () => {
  assert.match(identity, /control-hipico-source-official/);
  assert.doesNotMatch(identity, /triple[- ]?crown/i);
});

void test('post-merge workspace safety remains physically present beside Platform 2.0', () => {
  assert.equal(existsSync(new URL('../frontend/public/hipico-control/assets/js/workspace-input-safety.js', import.meta.url)), true);
  const sync = read('../frontend/public/hipico-control/assets/js/sync.js');
  assert.match(sync, /groupId/);
});
