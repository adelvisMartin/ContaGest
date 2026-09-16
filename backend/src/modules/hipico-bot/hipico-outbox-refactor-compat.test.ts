import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import {
  __test__,
  canonicalOutboxReadiness,
  claimCanonicalOutbound,
  configuredOutboxOwnerId,
  enqueueCanonicalOutbound,
  getCanonicalOutbox,
  listCanonicalOutbox,
  markCanonicalAccepted,
  markCanonicalFailed,
  markCanonicalReconciliationRequired,
  markCanonicalRetry,
  recordCanonicalReceipt,
  reconcileCanonicalOutbound,
  sameCanonicalOutboundIntent
} from './hipico-outbox.store.js';
import {
  normalizeCanonicalReceiptInput,
  normalizeCanonicalReconciliationInput,
  normalizeOutboxFailure
} from './hipico-outbox-receipt-input.js';

const moduleUrl = (name: string) => new URL(`./${name}`, import.meta.url);

void test('canonical outbox store keeps every established public function', () => {
  for (const value of [
    canonicalOutboxReadiness,
    claimCanonicalOutbound,
    configuredOutboxOwnerId,
    enqueueCanonicalOutbound,
    getCanonicalOutbox,
    listCanonicalOutbox,
    markCanonicalAccepted,
    markCanonicalFailed,
    markCanonicalReconciliationRequired,
    markCanonicalRetry,
    recordCanonicalReceipt,
    reconcileCanonicalOutbound,
    sameCanonicalOutboundIntent
  ]) {
    assert.equal(typeof value, 'function');
  }
});

void test('owner normalization and canonical intent comparison preserve behavior', () => {
  const owner = '11111111-1111-4111-8111-111111111111';
  assert.equal(configuredOutboxOwnerId({ HIPICO_OWNER_ID: ` ${owner} ` } as NodeJS.ProcessEnv), owner);
  assert.equal(configuredOutboxOwnerId({ HIPICO_OWNER_ID: 'not-a-uuid' } as NodeJS.ProcessEnv), null);

  const common = {
    ownerId: owner,
    groupKey: 'group-a',
    destination: '+584121234567',
    replyType: 'operational',
    provider: 'meta_cloud',
    payloadDigest: 'abc123'
  };
  assert.equal(sameCanonicalOutboundIntent(common, { ...common, destination: '584121234567' }), true);
  assert.equal(sameCanonicalOutboundIntent(common, { ...common, payloadDigest: 'different' }), false);
});

void test('canonical outbound normalization keeps validation codes and normalized values', () => {
  const ownerId = '11111111-1111-4111-8111-111111111111';
  const correlationId = '22222222-2222-4222-8222-222222222222';
  const row = __test__.normalizedInput({
    ownerId,
    groupKey: 'group-a',
    destination: '+584121234567',
    idempotencyKey: 'fixture-key-0001',
    replyType: 'operational',
    payload: { text: 'hola' },
    provider: 'META_CLOUD',
    maxAttempts: 999,
    correlationId
  });
  assert.equal(row.ownerId, ownerId);
  assert.equal(row.destination, '584121234567');
  assert.equal(row.provider, 'meta_cloud');
  assert.equal(row.maxAttempts, 20);
  assert.equal(row.correlationId, correlationId);
  assert.match(row.payloadDigest, /^[a-f0-9]{64}$/);

  assert.throws(
    () => __test__.normalizedInput({
      ownerId: 'bad',
      groupKey: 'group-a',
      destination: '584121234567',
      idempotencyKey: 'fixture-key-0002',
      payload: { text: 'hola' }
    }),
    (error: any) => error?.code === 'HIPICO_OUTBOX_INPUT_INVALID'
  );
});

void test('receipt and reconciliation normalization preserve bounded fields and error codes', () => {
  const ownerId = '11111111-1111-4111-8111-111111111111';
  const id = '22222222-2222-4222-8222-222222222222';
  const timestamp = new Date('2026-09-15T20:00:00.000Z');
  const receipt = normalizeCanonicalReceiptInput({
    ownerId,
    provider: ' META_CLOUD ',
    providerMessageId: ' message-001 ',
    status: 'delivered',
    timestamp,
    errorCode: ' '.repeat(3),
    metadata: { recipient: 'masked' }
  });
  assert.equal(receipt.provider, 'meta_cloud');
  assert.equal(receipt.providerMessageId, 'message-001');
  assert.equal(receipt.errorCode, null);
  assert.deepEqual(receipt.metadata, { recipient: 'masked' });

  const reconciliation = normalizeCanonicalReconciliationInput({
    ownerId,
    id,
    resolution: 'sent',
    actorRef: ' operator-token:fixture ',
    reason: ' provider receipt verified ',
    providerMessageId: ' provider-123 '
  });
  assert.equal(reconciliation.actorRef, 'operator-token:fixture');
  assert.equal(reconciliation.reason, 'provider receipt verified');
  assert.equal(reconciliation.providerMessageId, 'provider-123');

  const failure = normalizeOutboxFailure(' x '.repeat(600), '', 'AMBIGUOUS_DELIVERY');
  assert.equal(failure.error.length, 1000);
  assert.equal(failure.errorCode, 'AMBIGUOUS_DELIVERY');

  assert.throws(
    () => normalizeCanonicalReceiptInput({
      ownerId,
      providerMessageId: '',
      status: 'sent',
      timestamp
    }),
    (error: any) => error?.code === 'HIPICO_OUTBOX_RECEIPT_INVALID'
  );
  assert.throws(
    () => normalizeCanonicalReconciliationInput({
      ownerId,
      id,
      resolution: 'sent',
      actorRef: 'operator-token:fixture',
      reason: 'valid reason'
    }),
    (error: any) => error?.code === 'HIPICO_OUTBOX_RECONCILIATION_INVALID'
  );
});

void test('v8 canonical outbox normalization seams exist', () => {
  assert.equal(existsSync(moduleUrl('hipico-outbox-input.ts')), true);
  assert.equal(existsSync(moduleUrl('hipico-outbox-receipt-input.ts')), true);
});
