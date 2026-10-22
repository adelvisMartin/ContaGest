import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertFiscalRuleSnapshotIntegrity, assertFiscalRuleVersionIntegrity, fiscalEvidenceHash,
} from '../backend/src/modules/fiscal/fiscal-rule-snapshot-integrity.ts';

function source() {
  return {
    tenantId: 'TENANT-A', ruleKey: 'synthetic.iva', version: 1,
    effectiveFrom: '2099-01-01T00:00:00.000Z', effectiveTo: '2099-07-01T00:00:00.000Z',
    source: 'QA Gazette NOT A LEGAL SOURCE', documentation: 'synthetic QA only',
    definition: { basis: 'net', syntheticRate: '10.00' },
  };
}
function rule() {
  const data = source();
  return { ...data, hash: fiscalEvidenceHash(data),
    effectiveFrom: new Date(data.effectiveFrom), effectiveTo: new Date(data.effectiveTo) };
}
function snapshot() {
  const { hash, version, ...rest } = rule();
  return { ...rest, ruleVersion: version, ruleHash: hash };
}
const invalid = (fn) => assert.throws(fn, /FISCAL_RULE_EVIDENCE_INTEGRITY/);

test('#751 retains the original canonical SHA-256 contract', () => {
  assert.equal(fiscalEvidenceHash({ z: 1, a: { y: 2, x: 3 } }),
    fiscalEvidenceHash({ a: { x: 3, y: 2 }, z: 1 }));
  assert.doesNotThrow(() => assertFiscalRuleSnapshotIntegrity(snapshot(), 'TENANT-A'));
  assert.doesNotThrow(() => assertFiscalRuleVersionIntegrity(rule(), 'TENANT-A', new Date('2099-06-15T00:00:00.000Z')));
});

test('#751 checks inclusive start/exclusive end in UTC independent of process timezone', () => {
  const value = rule();
  assert.doesNotThrow(() => assertFiscalRuleVersionIntegrity(value, 'TENANT-A', new Date('2099-01-01T00:00:00.000Z')));
  assert.doesNotThrow(() => assertFiscalRuleVersionIntegrity(value, 'TENANT-A', new Date('2099-06-30T23:59:59.999Z')));
  for (const at of ['2098-12-31T23:59:59.999Z', '2099-07-01T00:00:00.000Z']) {
    invalid(() => assertFiscalRuleVersionIntegrity(value, 'TENANT-A', new Date(at)));
  }
  invalid(() => assertFiscalRuleVersionIntegrity(value, 'TENANT-A', new Date('invalid')));
});

test('#751 fails closed on altered rule/snapshot provenance, dates, definition or hash', () => {
  const a = rule();
  const b = snapshot();
  const mutations = [
    { definition: { syntheticRate: '50.00', basis: 'net' } },
    { source: 'unverified source' },
    { documentation: 'unexpected' },
    { effectiveFrom: new Date('2099-01-02T00:00:00.000Z') },
    { effectiveTo: null },
    { ruleKey: 'synthetic.islr' },
    { effectiveFrom: new Date('invalid') },
    { effectiveTo: new Date('2098-01-01T00:00:00.000Z') },
    { definition: [] }, { definition: null },
  ];
  for (const changed of mutations) {
    invalid(() => assertFiscalRuleVersionIntegrity({ ...a, ...changed }, 'TENANT-A', new Date('2099-06-15T00:00:00Z')));
    invalid(() => assertFiscalRuleSnapshotIntegrity({ ...b, ...changed }, 'TENANT-A'));
  }
  invalid(() => assertFiscalRuleVersionIntegrity({ ...a, version: 2 }, 'TENANT-A', new Date('2099-06-15T00:00:00Z')));
  invalid(() => assertFiscalRuleSnapshotIntegrity({ ...b, ruleVersion: 2 }, 'TENANT-A'));
  invalid(() => assertFiscalRuleSnapshotIntegrity({ ...b, ruleHash: 'f'.repeat(64) }, 'TENANT-A'));
  invalid(() => assertFiscalRuleSnapshotIntegrity({ ...b, ruleHash: 'broken' }, 'TENANT-A'));
});

test('#751 blocks rule selection and historical read for other tenants', () => {
  invalid(() => assertFiscalRuleVersionIntegrity(rule(), 'TENANT-B', new Date('2099-03-01T00:00:00Z')));
  invalid(() => assertFiscalRuleSnapshotIntegrity(snapshot(), 'TENANT-B'));
  invalid(() => assertFiscalRuleSnapshotIntegrity({ ...snapshot(), tenantId: 'TENANT-B' }, 'TENANT-B'));
});

test('#751 future rate versions do not reinterpret immutable historical snapshots', () => {
  const original = snapshot();
  const newer = { ...rule(), version: 2, effectiveFrom: new Date('2099-07-01T00:00:00Z'), effectiveTo: null };
  // Deliberately inconsistent until a fresh independently hashed version is created.
  invalid(() => assertFiscalRuleVersionIntegrity(newer, 'TENANT-A', new Date('2099-07-01T00:00:00Z')));
  assert.doesNotThrow(() => assertFiscalRuleSnapshotIntegrity(original, 'TENANT-A'));
});
