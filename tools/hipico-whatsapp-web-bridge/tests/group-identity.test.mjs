import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertPinnedGroupIdentity,
  extractGroupIds,
  normalizeGroupId,
  redactGroupId,
  selectUniqueGroupId
} from '../src/group-identity.mjs';

const legacySourceId = '120363111111111111-1111111111@g.us';
const legacyLabId = '120363222222222222-2222222222@g.us';
const modernSourceId = '120363333333333333@g.us';
const modernLabId = '120363444444444444@g.us';

test('extracts modern and legacy stable @g.us IDs from WhatsApp DOM-like attributes', () => {
  const ids = extractGroupIds(
    `false_${legacySourceId}_ABC123`,
    `true_${modernLabId}_XYZ999`,
    `duplicate_${legacySourceId}`,
    `modern_${modernSourceId}`
  );
  assert.deepEqual(ids.sort(), [legacySourceId, modernLabId, modernSourceId].sort());
});

test('DOM separators do not become part of either group JID format', () => {
  assert.deepEqual(extractGroupIds(`row_${legacySourceId}_tail`), [legacySourceId]);
  assert.deepEqual(extractGroupIds(`prefix:${modernLabId};suffix`), [modernLabId]);
  assert.deepEqual(extractGroupIds(`bad_${legacySourceId}x_tail`), []);
  assert.deepEqual(extractGroupIds(`bad_${modernSourceId}.evil_tail`), []);
});

test('normalization accepts modern and legacy groups but rejects user and malformed JIDs', () => {
  assert.equal(normalizeGroupId(legacySourceId.toUpperCase()), legacySourceId);
  assert.equal(normalizeGroupId(modernSourceId.toUpperCase()), modernSourceId);
  assert.equal(normalizeGroupId('584121234567@s.whatsapp.net'), '');
  assert.equal(normalizeGroupId('1234@g.us'), '');
  assert.equal(normalizeGroupId('not-a-group'), '');
});

test('destination guard requires exact ID plus exact normalized title', () => {
  assert.equal(assertPinnedGroupIdentity({
    role: 'lab',
    expectedId: modernLabId,
    expectedTitle: 'Control hípico lab',
    actualId: modernLabId,
    actualTitle: 'Control hípico lab',
    sourceId: modernSourceId
  }), true);

  assert.throws(() => assertPinnedGroupIdentity({
    role: 'lab', expectedId: modernLabId, expectedTitle: 'Control hípico lab', actualId: modernSourceId,
    actualTitle: 'Control hípico lab', sourceId: modernSourceId
  }), /LAB_ID_MISMATCH/);

  assert.throws(() => assertPinnedGroupIdentity({
    role: 'lab', expectedId: modernSourceId, expectedTitle: 'Control hípico lab', actualId: modernSourceId,
    actualTitle: 'Control hípico lab', sourceId: modernSourceId
  }), /LAB_POINTS_TO_SOURCE/);

  assert.throws(() => assertPinnedGroupIdentity({
    role: 'lab', expectedId: modernLabId, expectedTitle: 'Control hípico lab', actualId: modernLabId,
    actualTitle: 'Grupo parecido', sourceId: modernSourceId
  }), /LAB_TITLE_MISMATCH/);
});

test('ambiguous discovery never guesses a group ID', () => {
  assert.equal(selectUniqueGroupId([legacySourceId]), legacySourceId);
  assert.equal(selectUniqueGroupId([legacySourceId, modernLabId]), '');
  assert.equal(selectUniqueGroupId([legacySourceId, modernLabId], modernLabId), modernLabId);
  assert.equal(selectUniqueGroupId([legacySourceId], modernLabId), '');
});

test('logs redact modern and legacy group IDs', () => {
  const legacyRedacted = redactGroupId(legacySourceId);
  const modernRedacted = redactGroupId(modernSourceId);
  assert.match(legacyRedacted, /^120363…1111@g\.us$/);
  assert.match(modernRedacted, /^120363…3333@g\.us$/);
  assert.equal(legacyRedacted.includes(legacySourceId), false);
  assert.equal(modernRedacted.includes(modernSourceId), false);
});
