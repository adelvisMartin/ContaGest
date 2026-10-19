import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareFiscalLegalSourceDraft } from '../backend/src/modules/fiscal/fiscal-legal-source-policy.ts';

const actor = Object.freeze({ tenantId: 'tenant-A', userId: 'reviewer-A' });
const input = Object.freeze({ sourceType: 'official_gazette', reference: 'Gaceta de prueba 123', title: 'Fuente de ejemplo', sourceUrl: 'https://example.org/gazeta', publishedAt: '2026-01-02T13:00:00Z', contentSha256: 'ABCDEF00'.repeat(8) });
const clock = new Date('2026-10-16T14:30:00.000Z');
const draft = (patch = {}, context = actor) => prepareFiscalLegalSourceDraft({ ...input, ...patch }, context, clock);
const denied = (fn) => assert.throws(fn, { message: 'FISCAL_LEGAL_SOURCE_DRAFT_INVALID' });

test('#751 stores only an immutable DRAFT with actor-derived tenant, normalized SHA and server capture time', () => {
  const result = draft();
  assert.equal(result.tenantId, actor.tenantId);
  assert.equal(result.createdBy, actor.userId);
  assert.equal(result.status, 'DRAFT');
  assert.equal(result.capturedAt, clock.toISOString());
  assert.equal(result.contentSha256, input.contentSha256.toLowerCase());
  assert.ok(Object.isFrozen(result));
  assert.ok(Object.isFrozen(result.snapshotMetadata));
});

test('#751 rejects client-controlled status, tenant and reviewer overrides', () => {
  for (const patch of [{ status: 'ACTIVE' }, { tenantId: 'tenant-B' }, { createdBy: 'intruder' }, { reviewedAt: '2026-10-16T00:00:00Z' }]) denied(() => draft(patch));
  denied(() => draft({}, { tenantId: '', userId: 'admin' }));
  denied(() => draft({}, { tenantId: 'tenant-A', userId: '' }));
});

test('#751 source URL is optional but cannot be insecure, embedded-credential or fragment-bearing', () => {
  assert.equal(draft({ sourceUrl: null }).sourceUrl, null);
  for (const url of ['http://example.org/a', 'https://user:pass@example.org/a', 'javascript:alert(1)', 'https://example.org/path#token', 'not-a-url']) denied(() => draft({ sourceUrl: url }));
});

test('#751 source timestamps are strict UTC and cannot be silently normalized or future-dated', () => {
  for (const publishedAt of ['2026-02-30T00:00:00Z', '2026-01-01T00:00:00+02:00', '2027-01-01T00:00:00Z', '2026-01-01', '']) denied(() => draft({ publishedAt }));
  assert.equal(draft({ publishedAt: null }).publishedAt, null);
});

test('#751 bad hash, unbounded metadata, unrecognized type and missing references fail closed', () => {
  for (const patch of [{ contentSha256: 'abcdef' }, { contentSha256: 'g'.repeat(64) }, { sourceType: 'approved' }, { reference: 'x' }, { title: '' }, { snapshotMetadata: { captureMethod: 'manual', secret: 'oops' } }, { snapshotMetadata: { captureMethod: 'archive', contentBytes: -1 } }, { snapshotMetadata: { captureMethod: 'archive', contentBytes: 50_000_001 } }]) denied(() => draft(patch));
});
