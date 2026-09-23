import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const routes=()=>fs.readFileSync('backend/src/modules/verticals/veterinary.routes.ts','utf8');
const sales=()=>fs.readFileSync('backend/src/modules/sales/sales.routes.ts','utf8');
const service=()=>fs.readFileSync('frontend/src/services/verticalService.js','utf8');
const workspace=()=>fs.readFileSync('frontend/src/components/veterinary/VeterinaryWorkspace.jsx','utf8');
const panel=()=>fs.readFileSync('frontend/src/components/veterinary/VeterinaryFinancialPanel.jsx','utf8');
const migration=()=>fs.readFileSync('backend/prisma/migrations/20260922224500_veterinary_financial_flow_v3051/migration.sql','utf8');

test('30/51 persists workflow provenance without becoming clinical or ledger authority',()=>{
  const sql=migration();
  for(const token of ['VeterinaryFinancialCase','VeterinaryFinancialConsumptionLink','estimateSha256','authorizationConsentId','careEncounterId','hospitalizationId','salesInvoiceId']) assert.ok(sql.includes(token),token);
  assert.match(sql,/status.*proposed.*authorized.*attended.*invoiced.*cancelled/s);
  assert.match(sql,/currency.*VES/s);
});

test('30/51 estimate is server-priced and server-hashed',()=>{
  const source=routes();
  assert.match(source,/veterinaryEstimateLineSchema/);
  const productSchema=source.slice(source.indexOf('const veterinaryEstimateProductLineSchema'),source.indexOf("const veterinaryEstimateLineSchema"));
  assert.match(productSchema,/kind:z\.literal\('product'\)/);
  assert.match(productSchema,/productId:z\.string\(\)\.uuid\(\)/);
  assert.doesNotMatch(productSchema,/unitPrice|taxRate/);
  assert.match(source,/SELECT "id","sku","name","unit","price","taxRate"/);
  assert.match(source,/unitPrice:product\.price/);
  assert.match(source,/taxRate:product\.taxRate/);
  assert.match(source,/calculateInvoiceTotals/);
  assert.match(source,/estimateSha256/);
  assert.match(source,/createHash\('sha256'\)/);
});

test('30/51 authorization creates a signed CareConsent with server actor and timestamp',()=>{
  const source=routes();
  assert.match(source,/financial-cases\/:id\/authorize/);
  assert.match(source,/veterinary-financial-authorization/);
  assert.match(source,/INSERT INTO public\."CareConsent"/);
  assert.match(source,/typed-attestation/);
  assert.match(source,/actorUserId/);
  assert.match(source,/actorEmail/);
  assert.match(source,/estimateSha256\)!==sha256\(financialCase\.estimateSnapshot\|\|\{\}\)/);
  assert.doesNotMatch(source,/body\.signedAt|body\.actorUserId|body\.actorEmail/);
});

test('30/51 care transition validates exactly one same-patient clinical authority',()=>{
  const source=routes();
  assert.match(source,/financial-cases\/:id\/attend/);
  assert.match(source,/careEncounterId/);
  assert.match(source,/hospitalizationId/);
  assert.match(source,/exactamente una fuente clínica/i);
  assert.match(source,/CareEncounter/);
  assert.match(source,/CareHospitalization/);
  assert.match(source,/authorizationStatus!=='signed'/);
});

test('30/51 invoice uses service estimate plus explicit real consumptions and remains draft',()=>{
  const source=routes();
  assert.match(source,/financial-cases\/:id\/invoice/);
  assert.match(source,/inventoryMovementIds/);
  assert.match(source,/VeterinaryFinancialConsumptionLink/);
  assert.match(source,/m\.\"source\"='veterinary-prescription'/);
  assert.match(source,/p\."price",p\."taxRate"/);
  assert.match(source,/unitPrice:movement\.price/);
  assert.match(source,/taxRate:movement\.taxRate/);
  assert.match(source,/status:'draft'/);
  assert.doesNotMatch(source,/ledgerEntry\.create|LedgerEntry/);
});

test('30/51 prevents double billing and protects linked draft sales invoices',()=>{
  const source=routes();
  const salesSource=sales();
  assert.match(source,/pg_advisory_xact_lock/);
  assert.match(source,/movement_unique|VeterinaryFinancialConsumptionLink/);
  assert.match(source,/already linked|ya fue facturado|ya está facturado/i);
  assert.match(salesSource,/VeterinaryFinancialCase/);
  assert.match(salesSource,/flujo financiero veterinario/i);
});

test('30/51 frontend exposes the complete workflow through canonical services',()=>{
  const svc=service();
  const ui=workspace();
  const financial=panel();
  for(const token of ['financialCases','financialCatalog','createFinancialCase','authorizeFinancialCase','attendFinancialCase','financialConsumptions','invoiceFinancialCase']) assert.ok(svc.includes(token),token);
  assert.match(ui,/VeterinaryFinancialPanel/);
  assert.match(ui,/finanzas/);
  for(const token of ['Estimación','Autorizar','Atención registrada','Crear factura borrador','Consumos reales','No contabiliza']) assert.ok(financial.includes(token),token);
  assert.match(financial,/reportVeterinaryError/);
  assert.doesNotMatch(financial,/querySelector|addEventListener|innerHTML/);
});

test('30/51 invoice snapshot contains commercial provenance but not clinical diagnosis fields',()=>{
  const source=routes();
  assert.match(source,/invoiceSnapshot/);
  assert.match(source,/estimateSha256/);
  assert.match(source,/consumptionMovementIds/);
  assert.doesNotMatch(source,/invoiceSnapshot[\s\S]{0,1200}(subjective|assessment|diagnosis|clinicalNotes)/i);
});
