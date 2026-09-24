import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { veterinaryBackendSource, veterinaryWorkspaceSource } from '../qa/support/vertical-authority-sources.mjs';

const read=(path)=>fs.readFileSync(path,'utf8');

test('29/51 extends canonical inventory with lot metadata but keeps balances in Product + InventoryMovement',()=>{
  const schema=read('backend/prisma/schema.prisma');
  const migration=read('backend/prisma/migrations/20260922221500_veterinary_clinical_inventory_v2951/migration.sql');
  for(const token of ['model InventoryLot','lotNumber','expiresAt','InventoryLot[]','lotId','InventoryLot?']) assert.ok(schema.includes(token),token);
  for(const token of ['CREATE TABLE IF NOT EXISTS public."InventoryLot"','ALTER TABLE public."InventoryMovement"','"lotId"','InventoryMovement_lotId_fkey','InventoryMovement_vet_clinical_act_unique']) assert.ok(migration.includes(token),token);
  assert.doesNotMatch(schema,/model InventoryLot[\s\S]*?stock\s+Decimal/);
  assert.doesNotMatch(migration,/InventoryLot"[\s\S]*?"stock"/);
});

test('29/51 core inventory route and veterinary inventory share one stock-effect implementation',()=>{
  const core=read('backend/src/modules/inventory/inventory.routes.ts');
  const shared=read('backend/src/shared/services/inventory-movement.service.ts');
  assert.match(core,/applyInventoryStandardEffect as applyStandardEffect/);
  assert.match(core,/lockInventoryProduct as lockProduct/);
  assert.doesNotMatch(core,/async function lockProduct\(/);
  assert.doesNotMatch(core,/async function applyStandardEffect\(/);
  for(const token of ['lockInventoryProduct','applyInventoryStandardEffect','INVENTORY_INSUFFICIENT_STOCK','INVENTORY_RELEASE_EXCEEDS_RESERVED']) assert.ok(shared.includes(token),token);
});

test('29/51 lot balance is derived from inventory movements',()=>{
  const shared=read('backend/src/shared/services/inventory-movement.service.ts');
  assert.match(shared,/inventoryLotBalance/);
  assert.match(shared,/FROM "InventoryMovement"/);
  assert.match(shared,/WHEN "type"='in' THEN "quantity"/);
  assert.match(shared,/WHEN "type"='out' THEN -"quantity"/);
  assert.match(shared,/WHEN "type"='adjustment' THEN "quantity"/);
});

test('29/51 clinical inventory exposes stock minimum reorder lot and expiration without duplicating stock authority',()=>{
  const source=veterinaryBackendSource();
  const start=source.indexOf("router.get('/clinical-inventory'");
  const end=source.indexOf("router.post('/clinical-inventory/lots'",start);
  const block=source.slice(start,end);
  for(const token of ["requirePermission('inventory.manage')",'"minStock"','"available"','"reorder"','InventoryLot','expiresAt','onHand']) assert.ok(block.includes(token),token);
  assert.match(block,/LEFT JOIN public\."InventoryMovement"/);
});

test('29/51 lot creation uses canonical product lock and movement effect',()=>{
  const source=veterinaryBackendSource();
  const start=source.indexOf("router.post('/clinical-inventory/lots'");
  const end=source.indexOf("router.get('/clinical-inventory/consumptions'",start);
  const block=source.slice(start,end);
  assert.match(block,/lockInventoryProduct/);
  assert.match(block,/applyInventoryStandardEffect\(tx,product,'in'/);
  assert.match(block,/tx\.inventoryMovement\.create/);
  assert.match(block,/lotId:lot\.id/);
  assert.match(block,/source:'veterinary-lot-receipt'/);
});

test('29/51 clinical consumption is explicitly derived from active prescription product and selected lot',()=>{
  const source=veterinaryBackendSource();
  const start=source.indexOf("router.post('/clinical-inventory/consume'");
  const end=source.indexOf("router.get('/dashboard'",start);
  const block=source.slice(start,end);
  for(const token of ['clinicalInventoryConsumptionSchema','prescriptionId','clinicalActId','veterinary-prescription','CarePrescription','productId','lockInventoryProduct','lockInventoryLot','inventoryLotBalance']) assert.ok(block.includes(token),token);
  assert.match(block,/prescription\.status!=='active'/);
  assert.match(block,/La prescripción no tiene producto de inventario vinculado/);
  assert.match(block,/No se puede consumir un lote vencido/);
  assert.match(block,/Existencia insuficiente en el lote seleccionado/);
  assert.match(block,/applyInventoryStandardEffect\(tx,product,'out'/);
});

test('29/51 clinical consumption is retry-safe for one clinical act',()=>{
  const source=veterinaryBackendSource();
  const start=source.indexOf("router.post('/clinical-inventory/consume'");
  const end=source.indexOf("router.get('/dashboard'",start);
  const block=source.slice(start,end);
  assert.match(block,/pg_advisory_xact_lock/);
  assert.ok(block.includes('const sourceId='));
  assert.ok(block.includes('body.prescriptionId'));
  assert.ok(block.includes('body.clinicalActId'));
  assert.match(block,/findFirst\([\s\S]*source:'veterinary-prescription'/);
  assert.match(block,/replayed:true/);
});

test('29/51 lot-aware reversals preserve lot provenance and cannot create negative lot balance',()=>{
  const source=read('backend/src/modules/inventory/inventory.routes.ts');
  const start=source.indexOf("router.post('/movements/:id/reverse'");
  const end=source.indexOf("router.get('/integrity'",start);
  const block=source.slice(start,end);
  assert.match(block,/original\.lotId/);
  assert.match(block,/lockInventoryLot/);
  assert.match(block,/inventoryLotBalance/);
  assert.match(block,/INVENTORY_LOT_REVERSAL_INVALID_BALANCE/);
  assert.match(block,/lotId: original\.lotId \|\| null/);
});

test('29/51 UI covers lot expiry minimum reorder and explicit prescription-derived consumption',()=>{
  const panel=read('frontend/src/components/veterinary/VeterinaryClinicalInventoryPanel.jsx');
  const workspace=veterinaryWorkspaceSource();
  for(const token of ['Inventario clínico','Lote','Vencimiento','Mínimo','Reorden','Cantidad consumida','Consumo derivado del acto clínico','Prescripción','VeterinaryService.clinicalInventory(','VeterinaryService.consumeClinicalInventory(']) assert.ok(panel.includes(token),token);
  assert.match(panel,/prescriptions\.filter\(\(item\)=>item\.status==='active'&&item\.productId\)/);
  assert.match(panel,/disabled=\{isExpired\(lot\.expiresAt\)\|\|Number\(lot\.onHand\)<=0\}/);
  assert.equal((workspace.match(/<VeterinaryClinicalInventoryPanel/g)||[]).length,1);
  assert.equal((workspace.match(/import \{ VeterinaryClinicalInventoryPanel \}/g)||[]).length,1);
});

test('29/51 UI never auto-selects dose or lot and inventory permission stays explicit',()=>{
  const panel=read('frontend/src/components/veterinary/VeterinaryClinicalInventoryPanel.jsx');
  assert.doesNotMatch(panel,/calculateDose|recommendDose|autoDose|doseRecommendation|autoSelectLot|recommendedLot/);
  assert.match(panel,/inventory\.manage/);
  assert.match(panel,/No hay selección automática de dosis ni de lote/);
});

test('29/51 service exposes canonical clinical inventory operations',()=>{
  const service=read('frontend/src/services/verticalService.js');
  for(const token of ['clinicalInventory()','createClinicalInventoryLot(payload)','clinicalConsumptions(patientId)','consumeClinicalInventory(payload)']) assert.ok(service.includes(token),token);
});
