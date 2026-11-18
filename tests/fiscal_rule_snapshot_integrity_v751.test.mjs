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

test('#751 a valid future rule version never reinterprets a prior snapshot', () => {
  const original = snapshot();
  const laterDefinition = {
    ...source(), version: 2,
    effectiveFrom: '2099-07-01T00:00:00.000Z', effectiveTo: null,
    definition: { basis: 'net', syntheticRate: '20.00' },
  };
  const later = {
    ...laterDefinition, hash: fiscalEvidenceHash(laterDefinition),
    effectiveFrom: new Date(laterDefinition.effectiveFrom), effectiveTo: null,
  };
  assert.doesNotThrow(() => assertFiscalRuleVersionIntegrity(later, 'TENANT-A', new Date('2099-07-01T00:00:00Z')));
  assert.doesNotThrow(() => assertFiscalRuleSnapshotIntegrity(original, 'TENANT-A'));
  assert.notEqual(original.ruleHash, later.hash);
});

test('#717 rejects non-finite numbers rather than hashing them as JSON null', () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    invalid(() => fiscalEvidenceHash({ definition: { amount: value } }));
  }
  // This historical SHA-256 comes from main before the fix; valid JSON must
  // preserve the exact digest when a new runtime rejects lossy numeric values.
  assert.equal(fiscalEvidenceHash({ definition: { amount: null } }),
    '6dfa31149b4f6e0307aee4d99cc3ae5ee6d2b512f3466548e6d93334f03d8e9c');
});

test('#717 rejects a NaN snapshot forged against a previously valid null hash', () => {
  const base = source();
  const withNull = { ...base, definition: { basis: 'net', syntheticRate: null } };
  const ruleHash = fiscalEvidenceHash(withNull);
  const forged = {
    ...withNull, ruleVersion: 1, ruleHash,
    definition: { basis: 'net', syntheticRate: NaN },
    effectiveFrom: new Date(withNull.effectiveFrom),
    effectiveTo: new Date(withNull.effectiveTo),
  };
  invalid(() => assertFiscalRuleSnapshotIntegrity(forged, 'TENANT-A'));
});

test('#717 rejects undefined, bigint and custom runtime values before provenance hashing', () => {
  const valid = fiscalEvidenceHash({ definition: { amount: 'undefined' } });
  assert.match(valid, /^[0-9a-f]{64}$/);
  for (const value of [undefined, 1n, Symbol('rate'), () => 1, new Date('2026-01-01T00:00:00Z'),
    new Map([['rate', 1]]), new Number(1), /rate/]) {
    invalid(() => fiscalEvidenceHash({ definition: { amount: value } }));
  }
  // Hashing only JSON data preserves the legacy canonical digest.
  assert.equal(fiscalEvidenceHash({ definition: { amount: null } }),
    '6dfa31149b4f6e0307aee4d99cc3ae5ee6d2b512f3466548e6d93334f03d8e9c');
});

test('#717 rejects array holes, extra properties and hidden keys that JSON would erase', () => {
  const sparse = [1, , 3];
  const decorated = [1, 2];
  decorated.extra = 'unhashed data';
  const sym = { rate: 1, [Symbol('hidden')]: 2 };
  const nonEnumerable = { rate: 1 };
  Object.defineProperty(nonEnumerable, 'hidden', { value: 2, enumerable: false });
  for (const definition of [sparse, decorated, sym, nonEnumerable]) {
    invalid(() => fiscalEvidenceHash({ definition }));
  }
  const plain = { nested: [1, 2, null], amount: '1.00' };
  const nullPrototype = Object.assign(Object.create(null), plain);
  assert.equal(fiscalEvidenceHash(nullPrototype), fiscalEvidenceHash(plain),
    'Plain JSON with a null prototype must remain compatible with historic hashes');
});

test('#717 cannot forge a fiscal snapshot using undefined in place of stored legal text', () => {
  const original = source();
  const saved = { ...original, definition: { basis: 'net', syntheticRate: 'undefined' } };
  const forged = {
    ...saved, ruleVersion: saved.version, ruleHash: fiscalEvidenceHash(saved),
    effectiveFrom: new Date(saved.effectiveFrom),
    effectiveTo: new Date(saved.effectiveTo),
    definition: { basis: 'net', syntheticRate: undefined },
  };
  invalid(() => assertFiscalRuleSnapshotIntegrity(forged, 'TENANT-A'));
});
