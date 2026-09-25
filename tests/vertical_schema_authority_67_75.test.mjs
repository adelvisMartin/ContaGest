import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');
const verticalDir='backend/src/modules/verticals';
const routeFiles=fs.readdirSync(verticalDir)
  .filter((name)=>name.endsWith('.routes.ts'))
  .map((name)=>`${verticalDir}/${name}`)
  .sort();

test('67/75 keeps Zod construction out of vertical route handlers',()=>{
  for(const path of routeFiles){
    const source=read(path);
    assert.doesNotMatch(source,/from ['"]zod['"]/, `${path} must consume a domain schema authority instead of importing zod`);
    assert.doesNotMatch(source,/\bz\.(?:object|enum|union|literal|record|array|string|number|boolean|coerce|preprocess|discriminatedUnion)\b/, `${path} must not construct request schemas inline`);
  }
});

test('67/75 moves the remaining legacy request contracts behind domain schema authorities',()=>{
  const communications=read('backend/src/modules/verticals/communications.routes.ts');
  const gym=read('backend/src/modules/verticals/gym-extended.routes.ts');
  const health=read('backend/src/modules/verticals/health-extended.routes.ts');
  const veterinaryAppointments=read('backend/src/modules/verticals/veterinary-crud-appointments.routes.ts');
  const veterinaryPatients=read('backend/src/modules/verticals/veterinary-crud-patients.routes.ts');
  const guardianPortal=read('backend/src/modules/verticals/veterinary-guardian-portal.public.routes.ts');
  const diagnostics=read('backend/src/modules/verticals/veterinary-diagnostics.routes.ts');

  assert.match(communications,/from '.\/communications\.schemas\.js'/);
  for(const name of ['gymPaymentSchema','gymClassBookingSchema','gymMembershipStatusSchema']) assert.match(gym,new RegExp(name));
  for(const name of ['carePrescriptionSchema','careConsentSchema','dentalTreatmentConsentSchema','consentRevocationSchema']) assert.match(health,new RegExp(name));
  for(const [source,name] of [
    [veterinaryAppointments,'veterinaryAppointmentPatchSchema'],
    [veterinaryPatients,'veterinaryPatientPatchSchema'],
    [guardianPortal,'veterinaryGuardianPortalSessionSchema']
  ]) assert.match(source,new RegExp(name));
  assert.match(diagnostics,/import type \{ VeterinaryLabResultFlagInput \} from '.\/veterinary\.schemas\.js'/);
});

test('67/75 schema files expose the migrated contracts without changing route parsing',()=>{
  const communicationsSchemas=read('backend/src/modules/verticals/communications.schemas.ts');
  const gymSchemas=read('backend/src/modules/verticals/gym.schemas.ts');
  const healthSchemas=read('backend/src/modules/verticals/health.schemas.ts');
  const veterinarySchemas=read('backend/src/modules/verticals/veterinary.schemas.ts');

  for(const name of ['communicationTemplateSchema','communicationRenderSchema']) assert.match(communicationsSchemas,new RegExp(`export const ${name}`));
  for(const name of ['gymPaymentSchema','gymClassBookingSchema','gymMembershipStatusSchema']) assert.match(gymSchemas,new RegExp(`export const ${name}`));
  for(const name of ['carePrescriptionSchema','careConsentSchema','dentalTreatmentConsentSchema','consentRevocationSchema']) assert.match(healthSchemas,new RegExp(`export const ${name}`));
  for(const name of ['veterinaryAppointmentPatchSchema','veterinaryPatientPatchSchema','veterinaryGuardianPortalSessionSchema']) assert.match(veterinarySchemas,new RegExp(`export const ${name}`));
  assert.match(veterinarySchemas,/export type VeterinaryLabResultFlagInput/);

  const routeSources=routeFiles.map(read).join('\n');
  for(const schema of [
    'communicationTemplateSchema','communicationRenderSchema',
    'gymPaymentSchema','gymClassBookingSchema','gymMembershipStatusSchema',
    'carePrescriptionSchema','careConsentSchema','dentalTreatmentConsentSchema','consentRevocationSchema',
    'veterinaryAppointmentPatchSchema','veterinaryPatientPatchSchema','veterinaryGuardianPortalSessionSchema'
  ]) assert.match(routeSources,new RegExp(`${schema}\\.parse\\(`),`${schema} must remain an active parse boundary`);
});

test('67/75 does not weaken QA through bypasses',()=>{
  const source=routeFiles.map(read).join('\n');
  assert.doesNotMatch(source,/test\.skip|test\.only|waitForTimeout|force:\s*true/);
});
