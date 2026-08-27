import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');
const routes=read('backend/src/modules/legal/legal.routes.ts');
const service=read('frontend/src/services/legalService.js');
const profile=read('frontend/src/pages/ProfilePage.js');
const login=read('frontend/src/pages/LoginPage.js');

test('public legal catalog is read-only and mounted before tenant enforcement',()=>{
  const publicRoute=routes.indexOf("router.get('/public'");
  const tenantGate=routes.indexOf('router.use(requireTenant)');
  assert.ok(publicRoute>=0,'missing public legal catalog');
  assert.ok(tenantGate>publicRoute,'public catalog must be available before login');
  const publicBlock=routes.slice(publicRoute,tenantGate);
  assert.match(publicBlock,/currentLegalDocuments\(\)/);
  assert.doesNotMatch(publicBlock,/LegalAcceptance|CookiePreference|tenantId|userId|ipAddress|userAgent/);
  assert.match(service,/publicCatalog\(\).*noAuth:true/);
});

test('authenticated profile owns permanent legal privacy self-service',()=>{
  assert.match(profile,/Legal y privacidad/);
  assert.match(profile,/Versión \$\{safe\(doc\.version\)\}/);
  assert.match(profile,/Vigente desde/);
  assert.match(profile,/Aceptada \$\{date\(current\.acceptedAt,true\)\}/);
  assert.match(profile,/Historial de versiones aceptadas/);
  assert.match(profile,/btnDownloadLegalReceipt/);
  assert.match(profile,/btnPrintLegalReceipt/);
  assert.match(profile,/LegalService\.updateCookiePreferences\(\{analyticsCookies,marketingCookies:false\}\)/);
  assert.match(profile,/Cookies estrictamente necesarias · siempre activas/);
  assert.match(profile,/Marketing · no disponible/);
});

test('receipt intentionally excludes technical tracking evidence',()=>{
  assert.match(profile,/omite deliberadamente IP, user-agent/);
  const receiptStart=profile.indexOf('function receiptText');
  const receiptEnd=profile.indexOf('export const ProfilePage');
  const receipt=profile.slice(receiptStart,receiptEnd);
  assert.doesNotMatch(receipt,/ipAddress|updatedIp|updatedUserAgent/);
});

test('login exposes read-only policies without acceptance controls',()=>{
  assert.match(login,/btnOpenLegalPolicies/);
  assert.match(login,/LegalService\.publicCatalog\(\)/);
  assert.match(login,/Esta lectura no registra aceptación/);
  assert.match(login,/legalBody\(doc\.body\)/);
  assert.doesNotMatch(login,/LegalService\.accept\(/);
});

test('rereading policies is output-encoded before insertion',()=>{
  assert.match(profile,/const safe=.*escapeHtml/);
  assert.match(login,/const safe = .*escapeHtml/);
  assert.match(profile,/safe\(paragraph\)/);
  assert.match(login,/safe\(paragraph\)/);
});
