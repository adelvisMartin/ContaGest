import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('27/51 DB contract admits immutable treatment-sheet task events',()=>{
  const migration=read('backend/prisma/migrations/20260922212500_veterinary_treatment_sheet_task_type/migration.sql');
  assert.match(migration,/CareHospitalObservation_type_check/);
  assert.match(migration,/'task'/);
  assert.doesNotMatch(migration,/DROP TABLE|CREATE TABLE/);
});

test('27/51 backend validates structured treatment-sheet entries and server provenance',()=>{
  const source=read('backend/src/modules/verticals/veterinary.routes.ts');
  for(const token of ['treatmentSheetEntrySchema','medication','feeding','fluid','task','observation','scheduled','completed','skipped','cancelled','scheduledAt','performedAt','responsibleProfessionalId'])assert.ok(source.includes(token),token);
  assert.match(source,/actorUserId:ctx\(req\)\.userId\|\|null/);
  assert.match(source,/actorEmail:ctx\(req\)\.email\|\|null/);
  assert.doesNotMatch(source,/body\.actorUserId|body\.actorEmail/);
});

test('27/51 treatment sheet is tenant scoped and append-only',()=>{
  const source=read('backend/src/modules/verticals/veterinary.routes.ts');
  assert.match(source,/router\.get\('\/hospitalizations\/:id\/treatment-sheet'/);
  assert.match(source,/router\.post\('\/hospitalizations\/:id\/treatment-sheet'/);
  assert.match(source,/CareHospitalization"[\s\S]*?"tenantId"=\$1/);
  assert.match(source,/CareProfessional"[\s\S]*?"tenantId"=\$1/);
  assert.match(source,/INSERT INTO public\."CareHospitalObservation"/);
  assert.doesNotMatch(source,/UPDATE public\."CareHospitalObservation"|DELETE FROM public\."CareHospitalObservation"/);
});

test('27/51 hospitalization and observation references reject cross-tenant professionals and encounters',()=>{
  const source=read('backend/src/modules/verticals/veterinary.routes.ts');
  assert.match(source,/El profesional no pertenece al tenant activo/);
  assert.match(source,/El encuentro no pertenece a la mascota hospitalizada|El encuentro no pertenece a la mascota activa/);
  assert.match(source,/CareProfessional" pr ON pr\."id"=o\."professionalId" AND pr\."tenantId"=o\."tenantId"/);
});

test('27/51 service exposes treatment-sheet read and append contracts',()=>{
  const source=read('frontend/src/services/verticalService.js');
  assert.match(source,/treatmentSheet\(hospitalizationId\)/);
  assert.match(source,/createTreatmentSheetEntry\(hospitalizationId, payload\)/);
});

test('27/51 Treatment Sheet UI covers medications observations feeding fluids tasks responsible and timestamps',()=>{
  const source=read('frontend/src/components/veterinary/VeterinaryTreatmentSheet.jsx');
  for(const token of ['Hoja de tratamiento','Medicacion','Observacion','Alimentacion','Fluidos','Tarea','Responsable','Programado','Realizado','Omitido','Cancelado','scheduledAt','performedAt','responsibleProfessionalId','VeterinaryService.treatmentSheet(','VeterinaryService.createTreatmentSheetEntry('])assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/calculateDose|recommendDose|autoDose|doseRecommendation/);
});

test('27/51 veterinary workspace composes exactly one treatment sheet',()=>{
  const source=read('frontend/src/components/veterinary/VeterinaryWorkspace.jsx');
  assert.equal((source.match(/<VeterinaryTreatmentSheet/g)||[]).length,1);
  assert.equal((source.match(/import \{ VeterinaryTreatmentSheet \}/g)||[]).length,1);
});

test('27/51 Wave A audit fails closed on treatment-sheet regression',()=>{
  const source=read('scripts/erp-ui-wave-a-audit-v251.mjs');
  for(const token of ['VeterinaryTreatmentSheet','treatmentSheet','createTreatmentSheetEntry','responsibleProfessionalId','scheduledAt','performedAt'])assert.ok(source.includes(token),token);
});
