import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');
const backend=()=>read('backend/src/modules/verticals/health.routes.ts');
const page=()=>read('frontend/src/pages/DentistryPracticePage.jsx');
const panel=()=>read('frontend/src/components/dentistry/DentalSchedulePanel.jsx');
const service=()=>read('frontend/src/services/verticalService.js');
const migration=()=>read('backend/prisma/migrations/20260921124500_dental_advanced_schedule_v1951/migration.sql');

test('19/51 migration adds dental resources waitlist recall and appointment resource/confirmation fields',()=>{
  const source=migration();
  for(const token of ['CareDentalResource','CareDentalWaitlist','CareDentalRecall','resourceId','confirmationData']) assert.ok(source.includes(token),token);
  for(const kind of ['chair','room','equipment']) assert.ok(source.includes(`'${kind}'`),kind);
  for(const state of ['waiting','contacted','booked','cancelled']) assert.ok(source.includes(`'${state}'`),state);
  for(const state of ['pending','contacted','scheduled','dismissed']) assert.ok(source.includes(`'${state}'`),state);
  assert.match(source,/durationMinutes" BETWEEN 15 AND 480/);
});

test('19/51 advanced appointment scheduler serializes tenant scheduling and blocks overlaps',()=>{
  const source=backend();
  assert.match(source,/pg_advisory_xact_lock/);
  assert.match(source,/dental-schedule/);
  assert.match(source,/"startsAt"<\$\d+::timestamptz/);
  assert.match(source,/"endsAt">\$\d+::timestamptz/);
  for(const token of ['patientId','professionalId','resourceId','Conflicto de agenda']) assert.ok(source.includes(token),token);
});

test('19/51 appointment duration and end time are computed server-side',()=>{
  const source=backend();
  assert.match(source,/durationMinutes/);
  assert.match(source,/new Date\(startsAt\.getTime\(\)\+payload\.durationMinutes\*60000\)/);
  assert.match(source,/15.*480|480.*15/);
});

test('19/51 dental scheduling validates tenant patient professional and active resource',()=>{
  const source=backend();
  for(const token of ['validateDentalSchedulePatient','validateDentalScheduleProfessional','validateDentalScheduleResource','CarePatient','CareProfessional','CareDentalResource']) assert.ok(source.includes(token),token);
  assert.match(source,/"tenantId"=\$1/);
});

test('19/51 waitlist booking reuses the canonical conflict-checked scheduler',()=>{
  const source=backend();
  assert.match(source,/router\.post\('\/health\/dental-schedule\/waitlist\/:id\/book'/);
  assert.match(source,/createDentalScheduledAppointment/);
  assert.match(source,/status"='booked'|status\"='booked'/);
  assert.match(source,/FOR UPDATE/);
});

test('19/51 confirmations are server-authored with actor timestamp and explicit terminal actions',()=>{
  const source=backend();
  assert.match(source,/appointments\/:id\/confirmation/);
  assert.match(source,/z\.enum\(\['confirm','cancel','no-show'\]\)/);
  for(const token of ['confirmationData','confirmedAt','actorUserId','actorEmail','action']) assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/body\.actorUserId|body\.actorEmail|body\.confirmedAt/);
});

test('19/51 recalls can be created tracked and linked automatically to a scheduled appointment',()=>{
  const source=backend();
  for(const token of ['CareDentalRecall','recallId',"status='scheduled'",'appointmentId']) assert.ok(source.includes(token),token);
  assert.match(source,/dental-schedule\/recalls/);
});

test('19/51 frontend uses only advanced scheduler for dentistry appointment creation',()=>{
  const source=page();
  assert.match(source,/DentalSchedulePanel/);
  assert.equal((source.match(/<DentalSchedulePanel/g)||[]).length,1);
  assert.doesNotMatch(source,/HealthVerticalService\.createAppointment\(/);
  assert.doesNotMatch(source,/onSubmit=\{submitAppointment\}/);
});

test('19/51 schedule UI covers resource conflicts waitlist confirmations and recall',()=>{
  const source=panel();
  for(const token of ['Agenda','Lista de espera','Recall','Recursos','Sillón','Duración','Confirmar','Cancelar','Agendar','conflicto']) assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/querySelector|addEventListener|innerHTML/);
});

test('19/51 service exposes canonical advanced scheduling endpoints',()=>{
  const source=service();
  for(const token of ['dentalResources','createDentalResource','dentalAppointments','createDentalAppointment','confirmDentalAppointment','dentalWaitlist','createDentalWaitlist','bookDentalWaitlist','dentalRecalls','createDentalRecall','updateDentalRecall']) assert.ok(source.includes(token),token);
});
