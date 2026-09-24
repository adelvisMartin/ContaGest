import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const audit=fs.readFileSync('scripts/security-audit.mjs','utf8');
const hipicoStatus=fs.readFileSync('frontend/api/hipico/status.js','utf8');

test('security audit treats frontend/api as serverless runtime without disabling client secret checks',()=>{
  assert.match(audit,/const isFrontendServerlessApi = rel\.startsWith\('frontend\/api\/'\)/);
  assert.match(audit,/rel\.startsWith\('frontend\/'\) && !isFrontendServerlessApi/);
  assert.match(audit,/server-secret-access-in-frontend/);
  assert.match(audit,/SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(audit,/HIPICO_GROUP_BRIDGE_TOKEN/);
});

test('serverless exception is structural, not a per-file secret whitelist',()=>{
  assert.match(hipicoStatus,/process\.env\.HIPICO_GROUP_BRIDGE_TOKEN/);
  assert.doesNotMatch(audit,/hipico\/status\.js/);
  assert.doesNotMatch(audit,/HIPICO_GROUP_BRIDGE_TOKEN.*status\.js/s);
});
