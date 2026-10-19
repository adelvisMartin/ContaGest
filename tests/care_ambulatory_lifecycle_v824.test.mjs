import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const core = fs.readFileSync('backend/src/modules/verticals/health-core.routes.ts', 'utf8');
const encounters = fs.readFileSync('backend/src/modules/verticals/health-encounters.routes.ts','utf8');
const ui = fs.readFileSync('frontend/src/pages/HealthcarePage.js','utf8');
const service = fs.readFileSync('frontend/src/services/verticalService.js','utf8');
const migration = 'backend/prisma/migrations/20261019123000_care_ambulatory_encounter_uniqueness_v824/migration.sql';

test('generic appointment create/patch cannot skip clinical commands', () => {
  assert.match(core, /assertCareAppointmentPatchTransition\(current\.status, status\)/);
  assert.match(core, /\['scheduled','confirmed','waitlisted'\]\.includes\(b\.status\)/);
  assert.match(core, /assertAppointmentSlotAvailable/);
});

test('check-in requires tenant-owned appointment, locks and idempotency evidence', () => {
  const section = core.slice(core.indexOf("router.post('/health/appointments/:id/check-in'"),core.indexOf("router.post('/health/appointments/:id/start-encounter'"));
  assert.match(section, /requirePermission\('health\.manage'\)/);
  assert.match(section, /FOR UPDATE/);
  assert.match(section, /WHERE "tenantId"=\$1 AND "id"=\$2/);
  assert.match(section, /idempotencyKey/);
  assert.match(section, /schedulingMeta/);
  assert.match(section, /\$transaction/);
});

test('start encounter commits exactly one tenant/patient/professional-linked visit', () => {
  const section = core.slice(core.indexOf("router.post('/health/appointments/:id/start-encounter'"));
  assert.match(section, /FOR UPDATE/);
  assert.match(section, /"tenantId"=\$1 AND "id"=\$2/);
  assert.match(section, /"patientId"/);
  assert.match(section, /"professionalId"/);
  assert.match(section, /INSERT INTO public\."CareEncounter"/);
  assert.match(section, /type.*ambulatory-visit/s);
  assert.match(section, /idempotencyKey/);
  assert.match(section, /\$transaction/);
});

test('postgresion uniqueness applies only to new ambulatory encounters and does not rewrite dental history', () => {
  const sql = fs.readFileSync(migration, 'utf8');
  assert.match(sql, /CREATE UNIQUE INDEX/);
  assert.match(sql, /"tenantId", "appointmentId"/);
  assert.match(sql, /"type"='ambulatory-visit'/);
  assert.doesNotMatch(sql, /DELETE FROM|UPDATE public\."CareEncounter"/);
});

test('only linked active licensed professional can open an ambulatory encounter', () => {
  const start = core.slice(core.indexOf("router.post('/health/appointments/:id/start-encounter'"));
  assert.match(start, /"userId"=\$3/);
  assert.match(start, /NULLIF\(trim\("licenseNumber"\),''\)/);
  assert.match(encounters, /b\.type==='ambulatory-visit'/);
});

test('discharge requires clinical note, signs visit and marks billing handoff pending atomically', () => {
  const finish = core.slice(core.indexOf("router.post('/health/appointments/:id/complete-encounter'"));
  assert.match(finish, /\$transaction/);
  assert.match(finish, /FOR UPDATE/);
  assert.match(finish, /"assessment"/);
  assert.match(finish, /"plan"/);
  assert.match(finish, /"signedAt"=now\(\)/);
  assert.match(finish, /"status"='completed'/);
  assert.match(finish, /billingStatus:'pending'/);
  assert.match(finish, /idempotencyKey/);
});

test('ambulatory board exposes three real commands with explicit errors', () => {
  assert.match(service, /checkInAppointment\(/);
  assert.match(service, /startAmbulatoryEncounter\(/);
  assert.match(service, /completeAmbulatoryEncounter\(/);
  assert.match(ui, /data-care-appt-checkin/);
  assert.match(ui, /data-care-appt-start/);
  assert.match(ui, /data-care-appt-complete/);
  assert.match(ui, /Toast\.show\(error\.message,'error'\)/);
});
