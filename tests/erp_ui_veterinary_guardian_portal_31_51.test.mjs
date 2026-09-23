import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('31/51 stores only hashed revocable guardian portal grants',()=>{
  const sql=read('backend/prisma/migrations/20260923134500_veterinary_guardian_portal_v3151/migration.sql');
  for(const token of ['VeterinaryGuardianPortalGrant','tokenSha256','expiresAt','revokedAt','lastUsedAt'])assert.ok(sql.includes(token),token);
  assert.doesNotMatch(sql,/"token"\s+text/i);
  assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
  assert.match(sql,/REVOKE ALL/);
});

test('31/51 internal grant API creates one-time opaque token and supports revoke',()=>{
  const source=read('backend/src/modules/verticals/veterinary.routes.ts');
  for(const token of ['guardian-portal/grants','randomBytes(32)','sha256(portalToken)','communications.manage','portalPath','revokedAt'])assert.ok(source.includes(token),token);
  assert.match(source,/CarePatient/);
  assert.match(source,/"kind"='animal'/);
  assert.doesNotMatch(source,/INSERT[\s\S]{0,500}"token"/i);
});

test('31/51 public portal is read-only token-scoped and mounted before authenticated api routes',()=>{
  const source=read('backend/src/modules/verticals/veterinary-guardian-portal.public.routes.ts');
  const app=read('backend/src/app.ts');
  assert.match(source,/router\.get\('\/:token'/);
  assert.doesNotMatch(source,/router\.(post|put|patch|delete)\(/);
  assert.match(source,/createHash\('sha256'\)/);
  assert.match(source,/"revokedAt" IS NULL/);
  assert.match(source,/"expiresAt">now\(\)/);
  for(const token of ['appointments','discharges','documents','billing','communications'])assert.ok(source.includes(token),token);
  assert.match(source,/guardianText/);
  assert.doesNotMatch(source,/attachmentPath/);
  assert.ok(app.indexOf("'/api/v1/public/veterinary-portal'")<app.indexOf('app.use(csrfProtection)'));
});

test('31/51 public response is allow-listed and disables caching/referrer leakage',()=>{
  const source=read('backend/src/modules/verticals/veterinary-guardian-portal.public.routes.ts');
  assert.match(source,/Cache-Control'.*no-store/);
  assert.match(source,/Referrer-Policy'.*no-referrer/);
  assert.match(source,/X-Robots-Tag'.*noindex/);
  assert.doesNotMatch(source,/notes:/);
  assert.doesNotMatch(source,/payload:/);
});

test('31/51 frontend has independent public entry and one admin portal owner',()=>{
  const vite=read('frontend/vite.config.js');
  const workspace=read('frontend/src/components/veterinary/VeterinaryWorkspace.jsx');
  const panel=read('frontend/src/components/veterinary/VeterinaryGuardianPortalPanel.jsx');
  const portal=read('frontend/src/guardianPortal.jsx');
  assert.match(vite,/portal-veterinaria/);
  assert.equal((workspace.match(/VeterinaryGuardianPortalPanel/g)||[]).length,2);
  assert.match(workspace,/\['tutor',\s*'Portal tutor'/);
  for(const token of ['guardianPortalGrants','createGuardianPortalGrant','revokeGuardianPortalGrant','createCommunication'])assert.ok(panel.includes(token),token);
  assert.match(portal,/noAuth:true/);
  for(const heading of ['Citas y recordatorios','Alta y hospitalización','Documentos clínicos','Facturación y pagos','Comunicaciones'])assert.ok(portal.includes(heading),heading);
});

test('31/51 source audit fails closed on plaintext-token or duplicate-owner regression',()=>{
  const audit=read('scripts/erp-ui-wave-a-audit-v251.mjs');
  for(const token of ['VeterinaryGuardianPortalPanel','tokenSha256','veterinary-guardian-portal.public.routes.ts','portal-veterinaria'])assert.ok(audit.includes(token),token);
});
