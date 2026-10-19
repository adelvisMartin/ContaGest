import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const schema=fs.readFileSync('backend/src/modules/verticals/veterinary.schemas.ts','utf8');
const portal=fs.readFileSync('backend/src/modules/verticals/veterinary-guardian-portal.public.routes.ts','utf8');
const panel=fs.readFileSync('frontend/src/components/veterinary/VeterinaryGuardianPortalPanel.jsx','utf8');
const ui=fs.readFileSync('frontend/src/guardianPortal.jsx','utf8');

test('vaccine data is explicitly opt-in on portal grants',()=>{
  assert.match(schema,/VETERINARY_GUARDIAN_PORTAL_SCOPES.*'vaccines'/);
  assert.match(panel,/\['vaccines','Vacunas'\]/);
  assert.match(portal,/allowed\('vaccines'\)/);
});

test('portal vaccine read stays patient+tenant scoped with bounded sanitized fields',()=>{
  assert.match(portal,/FROM public\."CareImmunization"/);
  assert.match(portal,/WHERE "tenantId"=\$1 AND "patientId"=\$2/);
  assert.match(portal,/LIMIT 40/);
  assert.match(portal,/vaccines:vaccineRows\.map/);
  const vaccineBlock=portal.slice(portal.indexOf('vaccines:vaccineRows.map'),portal.indexOf('discharges:dischargeRows.map'));
  assert.doesNotMatch(vaccineBlock,/"notes"|row\.notes|SELECT \*/);
  assert.match(ui,/data\.vaccines/);
});
