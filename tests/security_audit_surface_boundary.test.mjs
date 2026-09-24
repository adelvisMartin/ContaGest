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
