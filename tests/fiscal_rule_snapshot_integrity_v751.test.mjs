import test from 'node:test';
import assert from 'node:assert/strict';
import { assertFiscalRuleSnapshotIntegrity, fiscalEvidenceHash } from '../backend/src/modules/fiscal/fiscal-rule-snapshot-integrity.ts';

function snapshot() {
  const data = {
    tenantId: 'TENANT-A', ruleKey: 'synthetic.iva', version: 1,
    effectiveFrom: '2099-01-01T00:00:00.000Z', effectiveTo: '2099-07-01T00:00:00.000Z',
    source: 'QA Gazette NOT A LEGAL SOURCE', documentation: 'synthetic QA only',
    definition: { basis: 'net', syntheticRate: '10.00' },
  };
  return {
    ...data, ruleVersion: 1, ruleHash: fiscalEvidenceHash(data),
    effectiveFrom: new Date(data.effectiveFrom), effectiveTo: new Date(data.effectiveTo),
  };
}
const denied = (value, tenant = 'TENANT-A') =>
  assert.throws(() => assertFiscalRuleSnapshotIntegrity(value, tenant), /FISCAL_RULE_SNAPSHOT_INTEGRITY/);

test('#751 keeps the original canonical hash for existing fiscal snapshots', () => {
  const value = snapshot();
  assert.doesNotThrow(() => assertFiscalRuleSnapshotIntegrity(value, 'TENANT-A'));
  assert.equal(fiscalEvidenceHash({ z: 1, a: { y: 2, x: 3 } }),
    fiscalEvidenceHash({ a: { x: 3, y: 2 }, z: 1 }));
});

test('#751 historical replay is not reinterpreted when future versions are created', () => {
  const old = snapshot();
  const newVersion = { ...old, ruleVersion: 2, ruleHash: 'f'.repeat(64) };
  denied(newVersion);
  assert.doesNotThrow(() => assertFiscalRuleSnapshotIntegrity(old, 'TENANT-A'));
});

test('#751 refuses tampered rates, sources, date bounds, version and hash', () => {
  const value = snapshot();
  for (const changed of [
    { definition: { ...value.definition, syntheticRate: '50.00' } },
    { source: 'source changed' },
    { documentation: 'documentation changed' },
    { effectiveFrom: new Date('2099-01-02T00:00:00.000Z') },
    { effectiveTo: null },
    { ruleVersion: 2 },
    { ruleHash: '0'.repeat(64) },
    { ruleHash: 'broken' },
    { effectiveFrom: new Date('not-a-date') },
    { effectiveTo: new Date('2098-01-01T00:00:00.000Z') },
    { definition: ['unsupported'] },
  ]) denied({ ...value, ...changed });
});

test('#751 tenant A snapshots cannot be replayed as tenant B', () => {
  const value = snapshot();
  denied(value, 'TENANT-B');
  denied({ ...value, tenantId: 'TENANT-B' }, 'TENANT-B');
});
