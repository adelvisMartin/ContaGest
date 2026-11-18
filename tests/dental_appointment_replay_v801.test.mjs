import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const routes=readFileSync('backend/src/modules/verticals/health-core.routes.ts','utf8');
const schema=readFileSync('backend/src/modules/verticals/health.schemas.ts','utf8');
const ui=readFileSync('frontend/src/components/dentistry/DentalSchedulePanel.jsx','utf8');
const sql=readFileSync('backend/prisma/migrations/20261117061000_dental_appointment_request_replay_v801/migration.sql','utf8');
test('#801 serializes dental conflicts and saves a durable replay key',()=>{
  const s=routes.slice(routes.indexOf("router.post('/health/appointments'"),
    routes.indexOf("router.patch('/health/appointments"));
  assert.match(s,/await lockAppointmentSchedule\(tx,tenantId\)/);
  assert.match(s,/assertAppointmentSlotAvailable/);
  assert.match(s,/schedulingMeta\?\.requestFingerprint!==requestFingerprint/);
  assert.match(s,/created\.replayed\?200:201/);
  assert.match(sql,/CareAppointment_dental_tenant_request_unique/);
  assert.match(schema,/requestKey: z\.string\(\)\.uuid\(\)\.optional\(\)/);
});
test('#801 UI keeps retry key for identical payload, rotates after changes',()=>{
  assert.match(ui,/pendingCreate\.current\?\.signature!==signature/);
  assert.match(ui,/pendingCreate\.current=null/);
  assert.match(ui,/createInFlight\.current/);
  assert.match(ui,/requestKey:pendingCreate\.current\.requestKey/);
});
