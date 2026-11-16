import test from 'node:test';
import assert from 'node:assert/strict';
import { labReadOnlyQueryPurpose, queryCanonicalLab } from '../src/lab-canonical-query.mjs';

const classification = { intent: 'conversation', risk: 'safe' };
const base = {
  ingestUrl: 'https://lab.example.test/api/v1/hipico-bot/bridge/events',
  token: 'synthetic-local-only',
  labGroupId: 'synthetic-lab-group',
  labChannelKey: 'synthetic-lab',
  messageId: 'synthetic-event-01',
  senderId: 'synthetic-participant-01',
  purpose: 'status',
};

const obfuscated = [
  '¿Resultado y pa\u200bgar premio?',
  '¿Resultado y pa\u200dgar premio?',
  '¿Resultado y pa\u00adgar premio?',
  '¿Resultado y co\u034fbrar?',
  '\u061c¿Resultado de carrera 5?',
  '¿Resultado y \u2060retirar dinero?',
  '\u202e¿Resultado de carrera 5?',
  '¿Estado de carrera 5?\u2066PAGAR\u2069',
  '¿Estado de carrera 5?\ufeff',
];

test('#1291 LAB classifier rejects invisible obfuscation of money instructions and bidi text', () => {
  for (const text of obfuscated) {
    assert.equal(labReadOnlyQueryPurpose(text, classification), null, JSON.stringify(text));
  }
  // Legitimate emoji ZWJ are not interpreted as a command obfuscation.
  assert.equal(labReadOnlyQueryPurpose('¿Resultado de carrera 5? 👩‍💻', classification), 'result');
});

test('#892 canonical LAB network request rejects obfuscated text before fetch or side effects', async () => {
  let calls = 0;
  for (const text of obfuscated) {
    const result = await queryCanonicalLab({
      ...base,
      text,
      fetchImpl: async () => {
        calls += 1;
        throw new Error('This synthetic request must not be sent');
      },
    });
    assert.deepEqual(result, { available: false, reason: 'LAB_CANONICAL_DISABLED' }, JSON.stringify(text));
  }
  assert.equal(calls, 0);
});
