import test from 'node:test';
import assert from 'node:assert/strict';
import { labReadOnlyQueryPurpose, queryCanonicalLab, resolveQuotedLabRaceScope } from '../src/lab-canonical-query.mjs';

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
  '¿Resultado y ｐａｇａｒ premio?',
  '¿Resultado y рagar premio?', // Cyrillic U+0440 replaces Latin 'p'
  '¿Estado de carrera 5? αctualizar', // Greek alpha masks Latin verb
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

test('#892 direct canonical adapter rejects monetary requests even without a classifier', async () => {
  let calls = 0;
  for (const text of ['¿Estado y pagar premio?', '¿Qué saldo queda?', 'Registra la llegada y liquidar']) {
    const result = await queryCanonicalLab({
      ...base,
      text,
      fetchImpl: async () => {
        calls += 1;
        throw new Error('Not expected');
      }
    });
    assert.deepEqual(result, { available: false, reason: 'LAB_CANONICAL_DISABLED' }, text);
  }
  assert.equal(calls, 0);
});

test('#1291 quoted LAB race scope cannot inherit from unsafe or confusable text', () => {
  const group = '120363222222222222@g.us';
  const sender = '123456789012@lid';
  const sourceId = `false_${group}_source_${sender}`;
  const replyId = `false_${group}_reply_${sender}`;
  const safeSource = '¿Cuál es el estado de carrera 5 en La Rinconada el 2026-10-12?';
  const prior = { id: sourceId, text: safeSource, fromMe: false, hasMedia: false };
  const reply = {
    id: replyId, quotedId: sourceId, text: '¿Cuál fue el resultado de esa carrera?',
    fromMe: false, hasMedia: false
  };
  assert.deepEqual(resolveQuotedLabRaceScope(reply, [prior]), {
    raceNumber: 5, racetrack: 'La Rinconada', raceDate: '2026-10-12'
  });
  for (const text of [
    safeSource + '\u200b',
    safeSource + ' рagar premio?',
    safeSource + ' ｐａｇａｒ premio?'
  ]) {
    assert.equal(resolveQuotedLabRaceScope(reply, [{ ...prior, text }]), null, JSON.stringify(text));
  }
  assert.equal(resolveQuotedLabRaceScope({ ...reply, text: reply.text + '\u2060' }, [prior]), null);
  assert.equal(resolveQuotedLabRaceScope({ ...reply, text: reply.text + ' αctualizar' }, [prior]), null);
});
