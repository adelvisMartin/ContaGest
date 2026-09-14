import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAutomationEvidence } from './automation.store.js';

test('agent evidence rejects secret-shaped keys recursively before persistence', () => {
  assert.throws(
    () => normalizeAutomationEvidence({ meta: { token: 'should-never-persist' } }),
    /HIPICO_AGENT_EVIDENCE_FORBIDDEN_KEY/
  );
  assert.throws(
    () => normalizeAutomationEvidence({ trace: [{ safe: true }, { apiKey: 'should-never-persist' }] }),
    /HIPICO_AGENT_EVIDENCE_FORBIDDEN_KEY/
  );
  assert.throws(
    () => normalizeAutomationEvidence({ nested: { authorization: { value: 'Bearer secret' } } }),
    /HIPICO_AGENT_EVIDENCE_FORBIDDEN_KEY/
  );
});

test('agent evidence preserves bounded non-secret structured evidence', () => {
  const evidence = {
    classifier: { version: 'v1', confidence: 0.98 },
    observations: [{ kind: 'race_context', matched: true }]
  };
  assert.deepEqual(normalizeAutomationEvidence(evidence), evidence);
});

test('agent evidence keeps the existing size and top-level object boundaries', () => {
  assert.throws(() => normalizeAutomationEvidence(['not', 'an', 'object']), /HIPICO_AGENT_EVIDENCE_INVALID/);
  assert.throws(
    () => normalizeAutomationEvidence({ payload: 'x'.repeat(17 * 1024) }),
    /HIPICO_AGENT_EVIDENCE_TOO_LARGE/
  );
});
