import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { healthBackendSource } from '../qa/support/vertical-authority-sources.mjs';

const read=(path)=>fs.readFileSync(path,'utf8');

test('19/51 migration extends CareAppointment without creating a second scheduling authority',()=>{
  const source=read('backend/prisma/migrations/20260921135000_dental_advanced_scheduling_v1951/migration.sql');
  for(const token of [
    'ALTER TABLE public."CareAppointment"',
    "'waitlisted'",
    '"recallDueAt"',
    '"schedulingMeta"',
    'CareAppointment_tenant_professional_slot_idx',
    'CareAppointment_tenant_room_slot_idx',
    'CareAppointment_tenant_recall_idx'
  ]) assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/CREATE TABLE\s+.*Dental.*Appointment/i);
});

test('19/51 scheduling backend serializes tenant writes and rejects overlapping active slots',()=>{
  const source=healthBackendSource();
  for(const token of [
    'appointmentStatusSchema',
    "'waitlisted'",
    'lockAppointmentSchedule',
    'pg_advisory_xact_lock',
    'assertAppointmentSlotAvailable',
    'ACTIVE_APPOINTMENT_STATUSES',
    '"startsAt" < $5::timestamptz',
    '"endsAt" > $4::timestamptz',
    '"professionalId"=$7',
    'lower(btrim("room"))=lower(btrim($8))',
    '"patientId"=$6'
  ]) assert.ok(source.includes(token),token);
});

test('19/51 appointment creation validates tenant ownership and waitlist does not reserve capacity',()=>{
  const source=healthBackendSource();
  const start=source.indexOf("router.post('/health/appointments'");
  const end=source.indexOf("router.patch('/health/appointments/:id'",start);
  const block=source.slice(start,end);
  assert.match(block,/CarePatient/);
  assert.match(block,/CareProfessional/);
  assert.match(block,/b\.status!=='waitlisted'/);
  assert.match(block,/assertAppointmentSlotAvailable/);
  assert.match(block,/schedulingMeta/);
  assert.match(block,/requestedAt/);
  assert.match(block,/requestedBy/);
});

test('19/51 appointment patch owns confirmation waitlist conversion and recall evidence',()=>{
  const source=healthBackendSource();
  const start=source.indexOf("router.patch('/health/appointments/:id'");
  const end=source.indexOf("router.get('/health/encounters'",start);
  const block=source.slice(start,end);
  assert.ok(start>0,'PATCH appointment route');
  for(const token of [
    'FOR UPDATE',
    'assertAppointmentSlotAvailable',
    "status==='confirmed'",
    'confirmedAt',
    'confirmedBy',
    "current.status==='waitlisted'&&status==='scheduled'",
    'convertedAt',
    'convertedBy',
    'recallDueAt',
    'updatedBy'
  ]) assert.ok(block.includes(token),token);
});

test('19/51 appointment reads include typed dentistry filter and future recall rows',()=>{
  const source=healthBackendSource();
  const start=source.indexOf("router.get('/health/appointments'");
  const end=source.indexOf("router.post('/health/appointments'",start);
  const block=source.slice(start,end);
  assert.match(block,/req\.query\.type/);
  assert.match(block,/a\."recallDueAt" IS NOT NULL/);
  assert.match(block,/a\."type"=\$4/);
  assert.match(block,/LIMIT 1000/);
});

test('19/51 UI exposes one declarative advanced schedule owner',()=>{
  const page=read('frontend/src/pages/DentistryPracticePage.jsx');
  const panel=read('frontend/src/components/dentistry/DentalSchedulePanel.jsx');
  assert.equal((page.match(/<DentalSchedulePanel/g)||[]).length,1);
  assert.doesNotMatch(page,/submitAppointment|appointmentForm|appointmentIso/);
  assert.doesNotMatch(panel,/querySelector|addEventListener|innerHTML|document\./);
  for(const token of [
    'Agenda odontológica avanzada',
    'Sillón / recurso',
    'Duración',
    'Agregar a lista de espera',
    'Intentar programar',
    'Confirmar',
    'Guardar recall',
    'La lista de espera conserva la franja preferida pero no bloquea profesional ni sillón'
  ]) assert.ok(panel.includes(token),token);
});

test('19/51 page refreshes canonical appointments after create and update',()=>{
  const page=read('frontend/src/pages/DentistryPracticePage.jsx');
  const service=read('frontend/src/services/verticalService.js');
  assert.match(page,/HealthVerticalService\.appointments\(\{type:'dentistry'\}\)/);
  assert.match(page,/HealthVerticalService\.createAppointment\(payload\)/);
  assert.match(page,/HealthVerticalService\.updateAppointment\(id,payload\)/);
  assert.match(service,/updateAppointment\(id, payload\).*method:'PATCH'/);
});
