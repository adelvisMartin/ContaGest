import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CLASSIFICATION,
  deriveImplicitIdCandidates,
  classifyManifest,
  validateClassificationPolicy,
} from '../scripts/implicit-relation-fk-hardening-v683.mjs';

const policy = JSON.parse(await readFile(new URL('../config/implicit-relation-fk-hardening-v683.json', import.meta.url), 'utf8'));
const migration = await readFile(new URL('../backend/prisma/migrations/20260930180000_issue_683_implicit_relation_fk_hardening/migration.sql', import.meta.url), 'utf8');

const BASELINE_633_KEYS = `AddressGeocode.placeId AnalyticsEvent.sessionId AnalyticsEvent.userId AuditLog.entityId BankMovement.ledgerEntryId BankMovement.tenantId CareCommunicationLog.providerMessageId CareCommunicationLog.templateId HipicoBotOutbox.providerMessageId HipicoWebhookEvent.phoneNumberId HipicoWebhookEvent.providerMessageId ImportBatch.userId InventoryMovement.sourceId InventoryMovement.tenantId LedgerEntry.sourceId NotificationLog.providerId UserProfile.authUserId budgetwallet_analytics_events.client_id budgetwallet_audit_journal.client_id budgetwallet_audit_journal.entity_id budgetwallet_audit_journal.mutation_id budgetwallet_devices.device_id budgetwallet_entitlements.product_id budgetwallet_import_batches.mutation_id budgetwallet_purchase_events.product_id budgetwallet_security_events.client_id budgetwallet_sync_events.client_id budgetwallet_sync_events.mutation_id budgetwallet_workspaces.client_id budgetwallet_workspaces.last_mutation_id hipico_audit_events.entity_id hipico_bot_channels.owner_id hipico_ledger_entries.owner_id hipico_ledger_entries.reference_id hipico_messages.external_message_id hipico_messages.owner_id hipico_messages.quoted_external_message_id hipico_messages.sender_id hipico_operation_events.owner_id hipico_outbox.external_message_id hipico_outbox.owner_id hipico_reconciliations.owner_id hipico_shadow_evaluations.observed_external_message_id hipico_shadow_evaluations.owner_id hipico_shadow_evaluations.source_external_message_id`.split(' ');

function manifestFrom(keys, {withFk=[]}={}) {
  const byTable=new Map();
  for(const key of keys){
    const split=key.indexOf('.');
    const table=key.slice(0,split); const column=key.slice(split+1);
    if(!byTable.has(table))byTable.set(table,{schema:'public',table,columns:[{name:'id',type:'text',nullable:false}],foreignKeys:[]});
    byTable.get(table).columns.push({name:column,type:'text',nullable:true});
    if(withFk.includes(key))byTable.get(table).foreignKeys.push({name:`${table}_${column}_fkey`,columns:[column],referencedTable:'Target',referencedColumns:['id']});
  }
  return {schemaVersion:633,candidateSha:'a'.repeat(40),manifestSha256:'b'.repeat(64),tables:[...byTable.values()]};
}

test('policy classifies the complete #633 implicit-id baseline with explicit rationale',()=>{
  validateClassificationPolicy(policy);
  assert.equal(policy.sourceManifestIssue,633);
  assert.deepEqual(policy.classifications.map((row)=>row.key).sort(),[...BASELINE_633_KEYS].sort());
  assert.equal(policy.classifications.filter((row)=>row.classification===CLASSIFICATION.LOCAL_RELATION).length,2);
  assert.equal(policy.classifications.filter((row)=>row.classification===CLASSIFICATION.EXTERNAL_ID).length,32);
  assert.equal(policy.classifications.filter((row)=>row.classification===CLASSIFICATION.POLYMORPHIC_REFERENCE).length,6);
  assert.equal(policy.classifications.filter((row)=>row.classification===CLASSIFICATION.DERIVED_REFERENCE).length,5);
  assert.equal(policy.classifications.every((row)=>typeof row.reason==='string'&&row.reason.trim().length>=12),true);
});

test('inventory is derived from the #633 manifest and ignores ids that already have physical FKs',()=>{
  const manifest=manifestFrom(['BankMovement.ledgerEntryId','CareCommunicationLog.templateId','AuditLog.entityId'],{withFk:['AuditLog.entityId']});
  assert.deepEqual(deriveImplicitIdCandidates(manifest).map((row)=>row.key),['BankMovement.ledgerEntryId','CareCommunicationLog.templateId']);
});

test('classification is fail-closed when a new id-like candidate appears in the manifest',()=>{
  const manifest=manifestFrom([...BASELINE_633_KEYS,'FutureTable.parentId']);
  assert.throws(()=>classifyManifest(manifest,policy),/UNCLASSIFIED_IMPLICIT_ID:FutureTable\.parentId/);
});

test('only verified local relations are eligible for #683 DDL',()=>{
  const report=classifyManifest(manifestFrom(BASELINE_633_KEYS),policy);
  assert.equal(report.summary.candidateCount,45);
  assert.deepEqual(report.ddlRelations.map((row)=>row.key),['BankMovement.ledgerEntryId','CareCommunicationLog.templateId']);
  assert.deepEqual(report.ddlRelations.map((row)=>row.target),['LedgerEntry.id','CommunicationTemplate.id']);
  assert.equal(report.classifications.filter((row)=>row.ddlOwnedByIssue683).length,2);
});

test('forward-only migration preflights both local relations before any FK DDL and never rewrites rows',()=>{
  const bankPreflight=migration.indexOf('ISSUE_683_ORPHANS:BankMovement.ledgerEntryId');
  const carePreflight=migration.indexOf('ISSUE_683_ORPHANS:CareCommunicationLog.templateId');
  const firstAdd=migration.indexOf('ADD CONSTRAINT');
  assert.ok(bankPreflight>=0&&carePreflight>=0&&firstAdd>bankPreflight&&firstAdd>carePreflight);
  assert.match(migration,/BankMovement_tenantId_ledgerEntryId_ifk_fk/);
  assert.match(migration,/CareCommunicationLog_tenantId_templateId_ifk_fk/);
  assert.equal((migration.match(/NOT VALID/g)||[]).length,2);
  assert.equal((migration.match(/VALIDATE CONSTRAINT/g)||[]).length,2);
  assert.doesNotMatch(migration,/^\s*(UPDATE|DELETE|TRUNCATE)\b/im);
  assert.match(migration,/ON DELETE NO ACTION/);
  assert.match(migration,/array_agg\(a\.attname::text ORDER BY u\.ord\)/);
});
