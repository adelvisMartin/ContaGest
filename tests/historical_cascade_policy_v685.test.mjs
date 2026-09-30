import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CLASSIFICATION, deriveHistoricalCascades, classifyHistoricalCascades, validatePolicy } from '../scripts/historical-cascade-policy-v685.mjs';

const policy=JSON.parse(await readFile(new URL('../config/historical-cascade-policy-v685.json',import.meta.url),'utf8'));
const migration=await readFile(new URL('../backend/prisma/migrations/20260930190000_issue_685_historical_cascade_policy/migration.sql',import.meta.url),'utf8');
const baseline=`AuditLog.AuditLog_tenantId_fkey FinancialFxLedgerLineSnapshot.FinancialFxLedgerLineSnapshot_line_fkey FinancialFxLedgerLineSnapshot.FinancialFxLedgerLineSnapshot_tenant_fkey FiscalCloseEvidence.FiscalCloseEvidence_tenantId_fkey FiscalDocument.FiscalDocument_tenantId_fkey FiscalDocumentRuleSnapshot.FiscalDocumentRuleSnapshot_tenantId_fkey FiscalRuleVersion.FiscalRuleVersion_tenantId_fkey FiscalSequence.FiscalSequence_tenantId_fkey LedgerEntry.LedgerEntry_tenantId_fkey LedgerLine.LedgerLine_entryId_fkey LegalAcceptance.LegalAcceptance_tenantId_fkey LegalAcceptance.LegalAcceptance_userId_fkey TaxDeclaration.TaxDeclaration_periodId_fkey TaxPeriod.TaxPeriod_tenantId_fkey budgetwallet_audit_journal.budgetwallet_audit_journal_owner_id_fkey hipico_audit_events.hipico_audit_events_owner_id_fkey hipico_audit_events.hipico_audit_events_workspace_id_fkey`.split(' ');

function manifest(keys=baseline){
 const by=new Map();
 for(const key of keys){const i=key.indexOf('.');const table=key.slice(0,i);const name=key.slice(i+1);if(!by.has(table))by.set(table,{table,foreignKeys:[]});by.get(table).foreignKeys.push({name,onDelete:'CASCADE'});}
 return {schemaVersion:633,tables:[...by.values()]};
}

test('classifies the complete #633 historical cascade baseline',()=>{
 validatePolicy(policy); assert.equal(policy.sourceManifestIssue,633); assert.equal(policy.canonicalDatabaseGateIssue,632); assert.equal(policy.productionConvergenceIssue,627);
 assert.deepEqual(policy.classifications.map(x=>x.key).sort(),[...baseline].sort());
 assert.ok(policy.classifications.every(x=>x.reason.length>=12&&x.recovery.length>=12));
 assert.deepEqual(new Set(policy.classifications.map(x=>x.classification)),new Set([CLASSIFICATION.INTENTIONAL_CHILD_CASCADE,CLASSIFICATION.RETENTION_RISK,CLASSIFICATION.TENANT_DELETION_POLICY]));
});

test('inventory derives from #633 manifest and fails closed on unknown historical cascades',()=>{
 assert.deepEqual(deriveHistoricalCascades(manifest(),policy.sourceTablePatterns).map(x=>x.key).sort(),[...baseline].sort());
 assert.throws(()=>classifyHistoricalCascades(manifest([...baseline,'FutureAudit.FutureAudit_parent_fkey']),policy),/UNCLASSIFIED_HISTORICAL_CASCADE:FutureAudit\.FutureAudit_parent_fkey/);
});

test('only retention-risk relations require DDL/guard hardening',()=>{
 const report=classifyHistoricalCascades(manifest(),policy); assert.equal(report.summary.candidateCount,17); assert.equal(report.summary.retentionRiskCount,11);
 assert.equal(report.ddlRelations.length,11);
 assert.equal(report.classifications.filter(x=>x.classification===CLASSIFICATION.INTENTIONAL_CHILD_CASCADE).length,2);
 assert.equal(report.classifications.filter(x=>x.classification===CLASSIFICATION.TENANT_DELETION_POLICY).length,4);
});

test('forward-only migration is atomic, preserves rows, and hardens risky cascades',()=>{
 assert.match(migration,/BEGIN;/); assert.match(migration,/COMMIT;/); assert.doesNotMatch(migration,/^\s*(DELETE|TRUNCATE)\b/im);
 assert.match(migration,/FinancialFxLedgerLineSnapshot_line_fkey[\s\S]*ON DELETE RESTRICT/);
 assert.match(migration,/FinancialFxLedgerLineSnapshot_tenant_fkey[\s\S]*ON DELETE RESTRICT/);
 assert.match(migration,/FiscalDocumentRuleSnapshot_tenantId_fkey[\s\S]*ON DELETE RESTRICT/);
 assert.match(migration,/FiscalRuleVersion_tenantId_fkey[\s\S]*ON DELETE RESTRICT/);
 assert.match(migration,/FiscalSequence_tenantId_fkey[\s\S]*ON DELETE RESTRICT/);
 assert.match(migration,/LegalAcceptance_tenantId_fkey[\s\S]*ON DELETE RESTRICT/);
 assert.match(migration,/LegalAcceptance_userId_fkey[\s\S]*ON DELETE RESTRICT/);
 assert.match(migration,/budgetwallet_audit_journal_owner_id_fkey[\s\S]*ON DELETE RESTRICT/);
 assert.match(migration,/to_regclass\('public\.budgetwallet_audit_journal'\)/);
 assert.match(migration,/ISSUE_685_OPTIONAL_CASCADE_ABSENT:budgetwallet_audit_journal_owner_id_fkey/);
 assert.match(migration,/hipico_audit_events_owner_id_fkey[\s\S]*ON DELETE RESTRICT/);
 assert.match(migration,/hipico_audit_events_workspace_id_fkey[\s\S]*ON DELETE SET NULL/);
 assert.match(migration,/TaxPeriod_lifecycle_delete_guard/);
 assert.match(migration,/data_lifecycle_protected_delete_guard/);
});
