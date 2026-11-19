import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { canonicalCorsOrigin } from '../backend/src/shared/middleware/cors-origin.policy.mjs';

const security = readFileSync(new URL('../backend/src/shared/middleware/security.ts', import.meta.url),'utf8');
const context = readFileSync(new URL('../backend/src/shared/middleware/context.ts', import.meta.url),'utf8');

test('#1364 accepts only canonical CORS origins, not full URLs or credentials',()=>{
  assert.equal(canonicalCorsOrigin('https://erp.example.org'), 'https://erp.example.org');
  assert.equal(canonicalCorsOrigin('http://127.0.0.1:8080'), 'http://127.0.0.1:8080');
  for(const invalid of [
    'https://erp.example.org/tenant/a', 'https://erp.example.org?access_token=x',
    'https://erp.example.org/#fragment', 'https://u:p@erp.example.org',
    'javascript:alert(1)', 'file:///etc/passwd', 'null', 'https://erp.example.org\n',
    'https://erp.example.org:invalid', '', 12
  ]) {
    assert.equal(canonicalCorsOrigin(invalid), '', JSON.stringify(invalid));
  }
});

test('#720 cookie session never inherits bearer CSRF exemption',()=>{
  const start=security.indexOf('export function csrfProtection(');
  const end=security.indexOf('export function securityResponseHeaders(',start);
  assert.ok(start>=0&&end>start);
  const scope=security.slice(start,end);
  assert.match(scope,/readCookie\(req, COOKIE_NAMES\.access\)/);
  assert.match(scope,/readCookie\(req, COOKIE_NAMES\.refresh\)/);
  assert.match(scope,/if \(!accessCookie && !refreshCookie\) return next\(\)/);
  assert.match(scope,/timingSafeTextEqual\(cookieToken, headerToken\)/);
  assert.doesNotMatch(scope,/req\.header\('authorization'\)|if \(\/\^Bearer/);
  assert.match(context,/const cookieMode = auth\.mode === 'cookie'/);
  assert.match(context,/validateCsrfAgainstSession\(/);
});

test('#1364 CORS rejects noncanonical origins and does not reflect the untrusted header',()=>{
  assert.match(security,/\.map\(canonicalCorsOrigin\)/);
  assert.match(security,/allowedOrigins\.has\(canonicalCorsOrigin\(origin\)\)/);
  assert.doesNotMatch(security,/Origen CORS no permitido:\s*\$\{origin\}/);
});
