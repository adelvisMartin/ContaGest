import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('AppSec secret-client rule excludes serverless frontend/api but retains browser surfaces',()=>{
  const source=fs.readFileSync('scripts/security-audit.mjs','utf8');
  assert.match(source,/function isBrowserFrontendPath/);
  assert.match(source,/frontend\/src\//);
  assert.match(source,/frontend\/public\//);
  assert.doesNotMatch(source,/if \(rel\.startsWith\('frontend\/'\)\)/);
  assert.match(source,/if \(isBrowserFrontendPath\(rel\)\)/);
  assert.match(source,/SUPABASE_SERVICE_ROLE_KEY\|OPENAI_API_KEY\|JWT_SECRET/);
});


test('Hípico bridge token detector stays on the assignment line',()=>{
  const source=fs.readFileSync('scripts/security-audit.mjs','utf8');
  assert.match(source,/HIPICO_GROUP_BRIDGE_TOKEN\[ \\t\]\*=\[ \\t\]\*/);
  assert.doesNotMatch(source,/HIPICO_GROUP_BRIDGE_TOKEN\\s\*=\\s\*\[A-Za-z0-9_-\]/);
  const template=fs.readFileSync('backend/.env.example','utf8');
  const detector=/HIPICO_GROUP_BRIDGE_TOKEN[ \\t]*=[ \\t]*[A-Za-z0-9_-]{32,}/i;
  assert.equal(detector.test(template),false,'empty template assignment must not consume the following variable name');
  const committedSecretSample=['HIPICO_GROUP_BRIDGE','_TOKEN=','abcdefghijklmnopqrstuvwxyzABCDEF'].join('');
  assert.equal(detector.test(committedSecretSample),true);
});
