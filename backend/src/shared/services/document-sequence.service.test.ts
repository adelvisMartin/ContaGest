import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOCUMENT_SEQUENCE_DEFAULT_PERIOD_KEY,
  documentSequenceMaxValue,
  formatDocumentSequenceNumber,
  normalizeDocumentSequenceKey,
  normalizeDocumentSequencePeriodKey,
  normalizeDocumentSequencePosition,
  normalizeDocumentSequenceSettings
} from './document-sequence.service.js';

function captureError(fn: () => unknown) {
  try {
    fn();
    assert.fail('Expected function to throw');
  } catch (error: any) {
    return error;
  }
}

test('document sequence keys and periods normalize deterministically', () => {
  assert.equal(normalizeDocumentSequenceKey(' Sales.Invoice '), 'sales.invoice');
  assert.equal(normalizeDocumentSequencePeriodKey(undefined), DOCUMENT_SEQUENCE_DEFAULT_PERIOD_KEY);
  assert.equal(normalizeDocumentSequencePeriodKey(' 2026-09 '), '2026-09');

  const invalidKey = captureError(() => normalizeDocumentSequenceKey('sales invoice'));
  assert.equal(invalidKey.status, 422);
  assert.equal(invalidKey.details?.code, 'DOCUMENT_SEQUENCE_KEY_INVALID');
});

test('formatting is exact and stable for prefix, suffix and padding', () => {
  assert.equal(
    formatDocumentSequenceNumber({ prefix: 'FAC-', suffix: '-A', padding: 6, value: 42n }),
    'FAC-000042-A'
  );
});

test('padding bounds and position are validated without IEEE-754 conversion', () => {
  assert.equal(documentSequenceMaxValue(1), 9n);
  assert.equal(documentSequenceMaxValue(18), 999999999999999999n);
  assert.equal(normalizeDocumentSequencePosition('9007199254740993', 18), 9007199254740993n);

  const invalidPadding = captureError(() => normalizeDocumentSequenceSettings({ padding: 19 }));
  assert.equal(invalidPadding.status, 422);
  assert.equal(invalidPadding.details?.code, 'DOCUMENT_SEQUENCE_PADDING_INVALID');
});

test('overflow fails closed instead of widening a configured sequence', () => {
  const error = captureError(() => formatDocumentSequenceNumber({ prefix: '', suffix: '', padding: 2, value: 100n }));
  assert.equal(error.status, 409);
  assert.equal(error.details?.code, 'DOCUMENT_SEQUENCE_EXHAUSTED');
});

test('configured current position cannot exceed padding capacity', () => {
  const error = captureError(() => normalizeDocumentSequencePosition('1000', 3));
  assert.equal(error.status, 422);
  assert.equal(error.details?.code, 'DOCUMENT_SEQUENCE_POSITION_INVALID');
});
