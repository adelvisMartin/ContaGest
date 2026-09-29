import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  FINDING,
  assignOwner,
  analyzeTable,
  buildManifest,
  deterministicManifestHash,
  assertCoverage,
  INTROSPECTION_SQL,
} from '../scripts/relational-normalization-audit-v633.mjs';

const policy = {
  expectedPublicTableCount: 3,
  ownershipRules: [
    { pattern: '^hipico_', owner: 'hipico' },
    { pattern: '^Care', owner: 'care' },
    { pattern: '.*', owner: 'platform-core', fallback: true },
  ],
  externalIdColumns: ['providerMessageId'],
  p1Remediation: {
    MISSING_FK: 634,
    INDEX_GAP: 684,
    CASCADE_RISK: 685,
  },
  cascadeRiskTablePatterns: ['Audit', 'Ledger', 'Fiscal', 'Tax'],
  naturalKeyColumns: ['rif','email','sku','number'],
};

function table(overrides={}) {
  return {
    schema:'public', table:'Example', columns:[
      {name:'id',type:'text',nullable:false,default:null},
      {name:'tenantId',type:'text',nullable:false,default:null},
    ], primaryKey:['id'], foreignKeys:[], uniqueConstraints:[], checks:[], indexes:[], ...overrides,
  };
}

test('owner classification is deterministic and exposes fallback confidence',()=>{
  assert.deepEqual(assignOwner('hipico_messages',policy),{owner:'hipico',confidence:'pattern',rule:'^hipico_'});
  assert.deepEqual(assignOwner('UnknownThing',policy),{owner:'platform-core',confidence:'fallback',rule:'.*'});
});

test('tenantId without FK is P1 MISSING_FK mapped to #634',()=>{
  const result=analyzeTable(table({table:'BankMovement'}),policy);
  const finding=result.findings.find((x)=>x.category===FINDING.MISSING_FK);
  assert.equal(finding.severity,'P1');
  assert.equal(finding.remediationIssue,634);
  assert.match(finding.detail,/tenantId/);
});

test('foreign key without a supporting leading index is INDEX_GAP',()=>{
  const result=analyzeTable(table({
    table:'budgetwallet_security_events',
    columns:[{name:'id',type:'uuid',nullable:false},{name:'owner_id',type:'uuid',nullable:false}],
    foreignKeys:[{name:'owner_fk',columns:['owner_id'],referencedTable:'users',referencedColumns:['id'],onDelete:'CASCADE',onUpdate:'NO ACTION'}],
  }),policy);
  const finding=result.findings.find((x)=>x.category===FINDING.INDEX_GAP);
  assert.equal(finding.severity,'P1');
  assert.equal(finding.remediationIssue,684);
});

test('external id-like columns are not treated as local missing foreign keys',()=>{
  const result=analyzeTable(table({
    table:'Webhook',
    columns:[{name:'id',type:'text',nullable:false},{name:'providerMessageId',type:'text',nullable:true}],
  }),policy);
  assert.equal(result.findings.some((x)=>x.category===FINDING.MISSING_FK),false);
});

test('cascade on historical ledger/audit tables is reviewable P1, not silently destructive',()=>{
  const result=analyzeTable(table({
    table:'AuditLog',
    foreignKeys:[{name:'tenant_fk',columns:['tenantId'],referencedTable:'Tenant',referencedColumns:['id'],onDelete:'CASCADE',onUpdate:'CASCADE'}],
    indexes:[{name:'audit_tenant_idx',columns:['tenantId'],unique:false}],
  }),policy);
  const finding=result.findings.find((x)=>x.category===FINDING.CASCADE_RISK);
  assert.equal(finding.severity,'P1');
  assert.equal(finding.remediationIssue,685);
});

test('coverage rejects partial inventory and accepts exact table count',()=>{
  assert.throws(()=>assertCoverage([table()],policy),/TABLE_COVERAGE_MISMATCH/);
  assert.doesNotThrow(()=>assertCoverage([table({table:'A'}),table({table:'B'}),table({table:'C'})],policy));
});

test('manifest requires remediation issue for every P0/P1 finding',()=>{
  const tables=[
    table({table:'A',foreignKeys:[{name:'tenant_fk',columns:['tenantId'],referencedTable:'Tenant',referencedColumns:['id'],onDelete:'RESTRICT',onUpdate:'CASCADE'}],indexes:[{name:'a_tenant',columns:['tenantId'],unique:false}]}),
    table({table:'B',columns:[{name:'id',type:'text',nullable:false}],primaryKey:['id']}),
    table({table:'C',columns:[{name:'id',type:'text',nullable:false}],primaryKey:['id']}),
  ];
  const manifest=buildManifest({candidateSha:'a'.repeat(40),tables,policy});
  assert.equal(manifest.summary.tableCount,3);
  assert.equal(manifest.summary.unassignedP0P1,0);
});

test('natural key protected by unique index is not reported as WEAK_UNIQUE',()=>{
  const result=analyzeTable(table({
    table:'Product',
    columns:[{name:'id',type:'text',nullable:false},{name:'sku',type:'text',nullable:false}],
    primaryKey:['id'],
    indexes:[{name:'Product_tenantId_sku_key',columns:['tenantId','sku'],unique:true,valid:true}],
  }),policy);
  assert.equal(result.findings.some((x)=>x.category===FINDING.WEAK_UNIQUE),false);
});

test('manifest hash is deterministic across timestamps and key order',()=>{
  const a={candidateSha:'a',generatedAt:'x',summary:{b:2,a:1}};
  const b={summary:{a:1,b:2},candidateSha:'a',generatedAt:'later',manifestSha256:'ignored'};
  assert.equal(deterministicManifestHash(a),deterministicManifestHash(b));
});

test('current 113-table baseline has an explicit bounded-context owner rule',async()=>{
  const currentPolicy=JSON.parse(await readFile(new URL('../config/relational-normalization-v633.json',import.meta.url),'utf8'));
  const names=`AccountUser AccountingRule AddressGeocode AiConversation AnalyticsEvent AuditLog AuthLoginAttempt BankAccount BankMovement CareAppointment CareCommunicationLog CareConsent CareDiagnosticStudy CareEncounter CareHospitalObservation CareHospitalization CareImmunization CareLabOrder CareLabResult CareMeasurement CarePatient CarePrescription CareProcedure CareProfessional ChartAccount Client ClosingPeriod Commission CommunicationTemplate CookiePreference CoordinateCard CoordinateChallenge CustomerAccount DemoAccess Employee FiscalDocument FoodOrder FoodOrderItem GymAssessment GymCheckIn GymClass GymClassBooking GymExercise GymMeal GymMember GymMembership GymMembershipPlan GymNutritionPlan GymPayment GymRoutine GymRoutineExercise GymTrainer HipicoBotOutbox HipicoWebhookEvent HrParameter ImportBatch InventoryMovement LedgerEntry LedgerLine LegalAcceptance LicenseActivation LicenseKey ModuleEntitlement ModuleRecord NotificationLog OrderEvent PayrollPeriod PayrollReceipt Permission Product ProductCode PurchaseInvoice PurchaseInvoiceLine RegulatoryFeed Role RolePermission SalesAgent SalesInvoice SalesInvoiceLine Subscription SubscriptionPayment SubscriptionTenant Supplier TaxDeclaration TaxPeriod Tenant TenantMembership UserProfile UserRole UserSession budgetwallet_analytics_events budgetwallet_audit_journal budgetwallet_devices budgetwallet_entitlements budgetwallet_import_batches budgetwallet_integrity_events budgetwallet_profiles budgetwallet_purchase_events budgetwallet_security_events budgetwallet_sync_events budgetwallet_workspaces contagest_keepalive hipico_audit_events hipico_bot_channels hipico_ledger_entries hipico_messages hipico_operation_events hipico_outbox hipico_profiles hipico_reconciliations hipico_shadow_evaluations hipico_users hipico_workspaces`.split(' ');
  assert.equal(names.length,113);
  const classified=names.map((name)=>({name,...assignOwner(name,currentPolicy)}));
  assert.deepEqual(classified.filter((row)=>row.confidence==='fallback'),[]);
  assert.equal(new Set(classified.map((row)=>row.owner)).size>=10,true);
});

test('introspection uses catalog metadata only and never selects application rows',()=>{
  assert.match(INTROSPECTION_SQL,/pg_class/);
  assert.match(INTROSPECTION_SQL,/pg_constraint/);
  assert.match(INTROSPECTION_SQL,/pg_index/);
  assert.doesNotMatch(INTROSPECTION_SQL,/SELECT\s+\*\s+FROM\s+public\./i);
});
