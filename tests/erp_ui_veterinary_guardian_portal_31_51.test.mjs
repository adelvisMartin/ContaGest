import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { veterinaryBackendSource, veterinaryWorkspaceSource } from '../qa/support/vertical-authority-sources.mjs';

const read=(path)=>fs.readFileSync(path,'utf8');

test('31/51 persists only hashed, revocable, RLS-protected guardian grants',()=>{
  const sql=read('backend/prisma/migrations/20260923134500_veterinary_guardian_portal_v3151/migration.sql');
  for(const token of ['VeterinaryGuardianPortalGrant','tokenSha256','expiresAt','revokedAt','lastUsedAt'])assert.ok(sql.includes(token),token);
  assert.doesNotMatch(sql,/"token"\s+text/i);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL/);
});

test('31/51 staff grant API uses 256-bit tokens, <=7 day TTL, explicit scopes and no query secret',()=>{
  const source=veterinaryBackendSource();
  for(const token of ['guardian-portal/grants','randomBytes(32)','sha256(portalToken)','communications.manage','expiresInHours','max(168)','scopes','#access='])assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/\?token=/);
  assert.doesNotMatch(source,/after:\{[^}]*portalToken/s);
  assert.doesNotMatch(source,/after:\{[^}]*tokenSha256/s);
});

test('31/51 public boundary accepts token only in POST body and derives tenant/patient from grant',()=>{
  const source=read('backend/src/modules/verticals/veterinary-guardian-portal.public.routes.ts');
  const app=read('backend/src/app.ts');
  assert.match(source,/router\.post\('\/session'/);
  assert.match(source,/sessionSchema\.parse\(req\.body/);
  assert.doesNotMatch(source,/req\.params\.token|req\.query.*token/);
  assert.match(source,/createHash\('sha256'\)/);
  assert.match(source,/"revokedAt" IS NULL/);
  assert.match(source,/"expiresAt">now\(\)/);
  assert.match(source,/JOIN public\."CarePatient"/);
  assert.ok(app.indexOf("'/api/v1/public/veterinary-portal'")<app.indexOf('app.use(csrfProtection)'));
});

test('31/51 public snapshot is allow-listed and excludes clinical narrative/internal payloads',()=>{
  const source=read('backend/src/modules/verticals/veterinary-guardian-portal.public.routes.ts');
  for(const token of ['appointments','discharges','documents','billing','communications'])assert.ok(source.includes(token),token);
  for(const forbidden of ['attachmentPath','clinicalData','"diagnosis"','"findings"','"impression"','"payload"','providerMessageId'])assert.ok(!source.includes(forbidden),forbidden);
  assert.match(source,/Cache-Control'.*no-store/);
  assert.match(source,/Referrer-Policy'.*no-referrer/);
  assert.match(source,/X-Robots-Tag'.*noindex/);
  assert.equal((source.match(/UPDATE public\."VeterinaryGuardianPortalGrant"/g)||[]).length,1);
  assert.match(source,/"lastUsedAt"=now\(\)/);
  assert.doesNotMatch(source,/INSERT INTO|DELETE FROM/);
});

test('31/51 frontend keeps token in fragment/session storage and never reads query-string secret',()=>{
  const portal=read('frontend/src/guardianPortal.jsx');
  assert.match(portal,/replace\(\/\^#\//);
  assert.match(portal,/get\('access'\)/);
  assert.match(portal,/sessionStorage\.setItem\('cg_veterinary_portal_access'/);
  assert.match(portal,/history\.replaceState/);
  assert.match(portal,/\/public\/veterinary-portal\/session/);
  assert.match(portal,/method:'POST'/);
  assert.match(portal,/noAuth:true/);
  assert.doesNotMatch(portal,/location\.search|get\('token'\)/);
  assert.doesNotMatch(portal,/x\.diagnosis|x\.impression|guardianText/);
});

test('31/51 frontend has one admin owner, explicit scopes and independent public Vite entry',()=>{
  const vite=read('frontend/vite.config.js');
  const workspace=veterinaryWorkspaceSource();
  const panel=read('frontend/src/components/veterinary/VeterinaryGuardianPortalPanel.jsx');
  assert.match(vite,/portal-veterinaria/);
  assert.equal((workspace.match(/import \{ VeterinaryGuardianPortalPanel \}/g)||[]).length,1);
  assert.equal((workspace.match(/<VeterinaryGuardianPortalPanel/g)||[]).length,1);
  assert.match(workspace,/\['tutor',\s*'Portal tutor'/);
  for(const token of ['guardianPortalGrants','createGuardianPortalGrant','revokeGuardianPortalGrant','expiresInHours','scopes'])assert.ok(panel.includes(token),token);
  assert.doesNotMatch(panel,/expiresInDays|\?token=/);
});

test('31/51 Wave A fails closed on token leakage, sensitive fields and duplicate owner regressions',()=>{
  const audit=read('scripts/erp-ui-wave-a-audit-v251.mjs');
  for(const token of ['VeterinaryGuardianPortalPanel','tokenSha256','veterinary-guardian-portal.public.routes.ts','portal-veterinaria','lastUsedAt','max(168)'])assert.ok(audit.includes(token),token);
});
