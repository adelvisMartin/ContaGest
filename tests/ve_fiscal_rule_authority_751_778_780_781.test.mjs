import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFiscalRuleAuthority, assertFiscalRuleAuthority, addRuleAuthority,
} from '../backend/src/modules/fiscal/fiscal-rule-authority-policy.ts';

// Immutable fixtures: these identify no real Venezuelan tax rates or legality.
const source = Object.freeze({
  id: 'd2b9c954-18f2-4b64-926d-c3daf7d95112',
  tenantId: 'tenant-A', reference: 'Synthetic legal source; not law',
  status: 'REVIEWED', contentSha256: 'a'.repeat(64),
  createdBy: 'author', reviewedBy: 'independent-reviewer',
  reviewedAt: '2026-01-02T10:00:00.000Z',
});
test('#751 legal authority cannot come from a tenant B or unreviewed source', () => {
  assert.throws(() => createFiscalRuleAuthority(source, 'tenant-B'));
  assert.throws(() => createFiscalRuleAuthority({ ...source, status: 'DRAFT' }, 'tenant-A'));
  assert.throws(() => createFiscalRuleAuthority({ ...source, status: 'REJECTED' }, 'tenant-A'));
  assert.throws(() => createFiscalRuleAuthority({ ...source, status: 'SUPERSEDED' }, 'tenant-A'));
  assert.throws(() => createFiscalRuleAuthority({ ...source, reviewedBy: 'author' }, 'tenant-A'));
  assert.throws(() => createFiscalRuleAuthority({ ...source, reviewedAt: null }, 'tenant-A'));
});
test('#778/#780/#781 embed only server legal evidence and reject caller overrides', () => {
  const authority = createFiscalRuleAuthority(source, 'tenant-A');
  const def = addRuleAuthority({ operation: 'fixture-only' }, authority);
  assert.equal(def._legalSource.legalSourceHash, source.contentSha256);
  assert.deepEqual(assertFiscalRuleAuthority(def._legalSource, source, 'tenant-A'), authority);
  assert.throws(() => addRuleAuthority({ _legalSource: { legalSourceId: source.id } }, authority));
  assert.throws(() => addRuleAuthority({ operation: 'x'.repeat(50_000) }, authority));
  assert.throws(() => assertFiscalRuleAuthority({ ...authority, legalSourceHash: 'b'.repeat(64) }, source, 'tenant-A'));
  assert.throws(() => assertFiscalRuleAuthority({ ...authority, legalSourceId: source.id, approved: true }, source, 'tenant-A'));
});
test('#751 reviewed source replacement and historical hash tampering are blocked', () => {
  const authority = createFiscalRuleAuthority(source, 'tenant-A');
  assert.throws(() => assertFiscalRuleAuthority(authority,
    { ...source, contentSha256: 'b'.repeat(64) }, 'tenant-A'));
  assert.throws(() => assertFiscalRuleAuthority(authority,
    { ...source, reference: 'Other statute' }, 'tenant-A'));
  assert.throws(() => assertFiscalRuleAuthority(authority,
    { ...source, reviewedBy: 'another-reviewer' }, 'tenant-A'));
});
