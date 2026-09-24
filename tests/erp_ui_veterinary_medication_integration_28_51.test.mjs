import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read=(path)=>fs.readFileSync(path,'utf8');

test('28/51 extends canonical CarePrescription instead of creating a second prescription table',()=>{
  const migration=read('backend/prisma/migrations/20260922214500_veterinary_medication_integration_v2851/migration.sql');
  for(const token of ['ALTER TABLE public."CarePrescription"','"productId"','"labelSnapshot"','"veterinaryMeta"','CarePrescription_productId_fkey','CarePrescription_tenant_product_idx']) assert.ok(migration.includes(token),token);
  assert.doesNotMatch(migration,/CREATE TABLE/i);
  assert.doesNotMatch(migration,/Lot|Batch|InventoryMovement/);
});

test('28/51 veterinary prescription requires medication dose frequency and duration',()=>{
  const source=read('backend/src/modules/verticals/veterinary.routes.ts');
  const start=source.indexOf('const veterinaryMedicationPrescriptionSchema');
  const end=source.indexOf('const labOrderSchema',start);
  const block=source.slice(start,end);
  for(const token of ['medication: z.string','dose: z.string','frequency: z.string','duration: z.string','productId: z.string().uuid().optional().nullable()']) assert.ok(block.includes(token),token);
  assert.match(block,/\.strict\(\)/);
});

test('28/51 prescription references remain patient professional encounter and product tenant scoped',()=>{
  const source=read('backend/src/modules/verticals/veterinary.routes.ts');
  const start=source.indexOf("router.post('/medications/prescriptions'");
  const end=source.indexOf("router.get('/clinical-inventory'",start);
  const block=source.slice(start,end);
  assert.match(block,/CarePatient"[\s\S]*"tenantId"=\$1[\s\S]*"kind"='animal'/);
  assert.match(block,/CareProfessional"[\s\S]*"tenantId"=\$1/);
  assert.match(block,/CareEncounter"[\s\S]*"tenantId"=\$1[\s\S]*"patientId"=\$3/);
  assert.match(block,/Product"[\s\S]*"tenantId"=\$1[\s\S]*"active"=true/);
});

test('28/51 server creates label and provenance from authenticated context',()=>{
  const source=read('backend/src/modules/verticals/veterinary.routes.ts');
  const start=source.indexOf("router.post('/medications/prescriptions'");
  const end=source.indexOf("router.get('/clinical-inventory'",start);
  const block=source.slice(start,end);
  for(const token of ['veterinary-medication-label.v1','labelSnapshot','veterinaryMeta','actorUserId','actorEmail',"inventoryConsumption:'not-performed'",'prescribedAt']) assert.ok(block.includes(token),token);
  assert.match(block,/ctx\(req\)\.userId\|\|null/);
  assert.match(block,/ctx\(req\)\.email\|\|null/);
  assert.doesNotMatch(block,/body\.actorUserId|body\.actorEmail/);
});

test('28/51 product linkage is optional and does not mutate stock or create a lot authority',()=>{
  const source=read('backend/src/modules/verticals/veterinary.routes.ts');
  const start=source.indexOf("router.post('/medications/prescriptions'");
  const end=source.indexOf("router.get('/clinical-inventory'",start);
  const block=source.slice(start,end);
  assert.doesNotMatch(block,/InventoryMovement|inventoryMovement\.create|applyStandardEffect|stock.*decrement/i);
  assert.doesNotMatch(block,/lotId|lotNumber|batchId|batchNumber/);
});

test('28/51 inventory product discovery is separately permission guarded',()=>{
  const source=read('backend/src/modules/verticals/veterinary.routes.ts');
  const start=source.indexOf("router.get('/medication-products'");
  const end=source.indexOf("router.post('/medications/prescriptions'",start);
  const block=source.slice(start,end);
  assert.match(block,/requirePermission\('inventory\.manage'\)/);
  assert.match(block,/FROM public\."Product"/);
  assert.match(block,/"tenantId"=\$1/);
});

test('28/51 prescription reads join professional and product through the same tenant',()=>{
  const source=read('backend/src/modules/verticals/health-extended.routes.ts');
  assert.match(source,/pr\."tenantId"=p\."tenantId"/);
  assert.match(source,/prod\."tenantId"=p\."tenantId"/);
  assert.match(source,/prod\."name" AS "productName"/);
  assert.match(source,/prod\."sku" AS "productSku"/);
});

test('28/51 UI owns one integrated prescription flow with label and optional inventory trace',()=>{
  const panel=read('frontend/src/components/veterinary/VeterinaryMedicationPanel.jsx');
  const workspace=read('frontend/src/components/veterinary/VeterinaryWorkspace.jsx');
  for(const token of ['Medicación integrada','Medicamento','Dosis','Frecuencia','Duración','Etiqueta clínica','Producto de inventario (opcional)','VeterinaryService.medicationProducts(','VeterinaryService.createMedicationPrescription(']) assert.ok(panel.includes(token),token);
  assert.equal((workspace.match(/<VeterinaryMedicationPanel/g)||[]).length,1);
  assert.equal((workspace.match(/import \{ VeterinaryMedicationPanel \}/g)||[]).length,1);
  assert.doesNotMatch(workspace,/case'prescription':|openDialog\('prescription'/);
  assert.doesNotMatch(panel,/calculateDose|recommendDose|autoDose|doseRecommendation/);
});

test('28/51 inventory permission failure does not block clinical prescribing',()=>{
  const source=read('frontend/src/components/veterinary/VeterinaryMedicationPanel.jsx');
  assert.match(source,/cause\?\.status===403/);
  assert.match(source,/prescripción clínica sigue disponible sin vínculo de producto/);
  assert.match(source,/productId:form\.productId\|\|null/);
});

test('28/51 Wave A fails closed on medication ownership and inventory-boundary regressions',()=>{
  const source=read('scripts/erp-ui-wave-a-audit-v251.mjs');
  for(const token of ['VeterinaryMedicationPanel','VeterinaryService.medicationProducts(','VeterinaryService.createMedicationPrescription(','inventoryConsumption','28/51 must not consume inventory','CarePrescription_productId_fkey']) assert.ok(source.includes(token),token);
});
