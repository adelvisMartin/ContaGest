import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { healthBackendSource } from '../qa/support/vertical-authority-sources.mjs';

const read=(path)=>fs.readFileSync(path,'utf8');

test('20/51 persists only an auditable provenance link between clinical and commercial authorities',()=>{
  const migration=read('backend/prisma/migrations/20260921141000_dental_erp_financial_v2051/migration.sql');
  for(const token of [
    'CREATE TABLE IF NOT EXISTS public."DentalFinancialLink"',
    '"treatmentPlanId" text NOT NULL REFERENCES public."CareEncounter"',
    '"salesInvoiceId" text NOT NULL REFERENCES public."SalesInvoice"',
    '"budgetSnapshot" jsonb NOT NULL',
    'DentalFinancialLink_tenant_plan_unique',
    'DentalFinancialLink_tenant_sale_unique',
    'ENABLE ROW LEVEL SECURITY',
    'REVOKE ALL'
  ]) assert.ok(migration.includes(token),token);
  assert.doesNotMatch(migration,/CREATE TABLE.*Invoice/i);
});

test('20/51 financial-link endpoint requires an accepted signed plan and creates only an ERP draft',()=>{
  const source=healthBackendSource();
  const start=source.indexOf("router.post('/health/encounters/:id/financial-link'");
  const end=source.indexOf("router.post('/health/measurements'",start);
  const block=source.slice(start,end);
  assert.ok(start>0,'financial-link route');
  for(const token of [
    "requirePermission('health.manage')",
    "requirePermission('sales.manage')",
    'pg_advisory_xact_lock',
    "planEncounter.status!=='signed'",
    'acceptedDentalTreatmentPlanClinicalDataSchema.parse',
    'calculateInvoiceTotals',
    "taxRate:'0'",
    "status:'draft'",
    'DentalFinancialLink',
    'budgetSnapshot',
    'dental.financial.link.created',
    'fiscalReviewRequired:true'
  ]) assert.ok(block.includes(token),token);
  assert.doesNotMatch(block,/ledgerEntry|salesInvoiceLinesForLedger|assertBalanced|postedAt|postedBy/);
});

test('20/51 accepted budget must equal server-recalculated invoice lines before persistence',()=>{
  const source=healthBackendSource();
  const start=source.indexOf("router.post('/health/encounters/:id/financial-link'");
  const end=source.indexOf("router.post('/health/measurements'",start);
  const block=source.slice(start,end);
  assert.match(block,/acceptedTotal=dentalCentsMoney\(dentalMoneyCents\(treatmentPlan\.budget\.estimatedTotal\)\)/);
  assert.match(block,/calculatedTotal=serializeDecimal\(calculated\.total,2\)/);
  assert.match(block,/calculatedTotal!==acceptedTotal/);
  assert.match(block,/presupuesto aceptado no coincide/i);
});

test('20/51 analytics separates currencies and derives collection from SalesInvoice status',()=>{
  const source=healthBackendSource();
  for(const token of [
    "router.get('/health/dental/financial'",
    "requirePermission('sales.view')",
    'totalsByCurrency',
    'professionalName',
    'procedure',
    "status==='draft'",
    "status==='issued'||status==='overdue'",
    "status==='paid'"
  ]) assert.ok(source.includes(token),token);
  assert.match(source,/new Map<string,DentalFinancialBucket>/);
  assert.doesNotMatch(source,/quotedCents\.toNumber|Number\(bucket\.quotedCents/);
});

test('20/51 commercial snapshot excludes diagnosis and records fiscal-review boundary',()=>{
  const source=healthBackendSource();
  const start=source.indexOf('const budgetSnapshot={');
  const end=source.indexOf('const inserted=',start);
  const block=source.slice(start,end);
  for(const token of [
    "schema:'dental-financial-budget.v1'",
    'treatmentPlanId',
    'patient:',
    'professional:',
    'estimatedTotal',
    'invoiceNumber',
    'fiscalReviewRequired:true',
    "fiscalPolicy:'draft-only-no-tax-assumption'",
    'procedure:',
    'lineTotal:'
  ]) assert.ok(block.includes(token),token);
  assert.doesNotMatch(block,/diagnosis|subjective|assessment|clinicalData/);
});

test('20/51 sales protects a dental-linked draft from destructive deletion',()=>{
  const source=read('backend/src/modules/sales/sales.routes.ts');
  const start=source.indexOf("router.delete('/:id'");
  const block=source.slice(start);
  assert.match(block,/DentalFinancialLink/);
  assert.match(block,/provenance financiera/);
  assert.match(block,/throw new HttpError\(409/);
});

test('20/51 UI has one declarative ERP financial owner and explicit draft-only messaging',()=>{
  const page=read('frontend/src/pages/DentistryPracticePage.jsx');
  const panel=read('frontend/src/components/dentistry/DentalFinancialPanel.jsx');
  const service=read('frontend/src/services/verticalService.js');
  assert.equal((page.match(/<DentalFinancialPanel/g)||[]).length,1);
  assert.doesNotMatch(panel,/querySelector|addEventListener|innerHTML|document\./);
  for(const token of [
    'Presupuesto, cobranza y analítica ERP',
    'Crear borrador ERP',
    'Producción por profesional',
    'Producción por procedimiento',
    'Cobrado',
    'Salud no contabiliza asientos',
    'sales.view/sales.manage'
  ]) assert.ok(panel.includes(token),token);
  assert.match(service,/dentalFinancial\(params = \{\}\)/);
  assert.match(service,/createDentalFinancialLink\(id\)/);
});

test('20/51 patient plans expose ERP link state without changing the clinical plan payload',()=>{
  const panel=read('frontend/src/components/dentistry/DentalFinancialPanel.jsx');
  assert.match(panel,/item\?\.type==='dental-treatment-plan'/);
  assert.match(panel,/item\?\.status==='signed'/);
  assert.match(panel,/plan\?\.status==='accepted'/);
  assert.match(panel,/plan\?\.acceptance\?\.status==='accepted'/);
  assert.match(panel,/linksByPlan\.get\(item\.id\)/);
});
