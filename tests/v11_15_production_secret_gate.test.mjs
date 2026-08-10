import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('commercial production requires independent explicit JWT and license secrets',()=>{
  const security=read('backend/src/shared/middleware/security.ts');
  assert.match(security,/process\.env\.JWT_SECRET/);
  assert.match(security,/process\.env\.LICENSE_HASH_SECRET/);
  assert.match(security,/explicitJwtReady/);
  assert.match(security,/explicitLicenseReady/);
  assert.match(security,/Producción requiere JWT_SECRET y LICENSE_HASH_SECRET explícitos/);
  assert.match(security,/rotating a DB\/service-role credential must never/);
});
