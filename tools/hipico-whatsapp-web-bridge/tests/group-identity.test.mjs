import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertPinnedGroupIdentity,
  extractGroupIds,
  normalizeGroupId,
  redactGroupId,
  selectUniqueGroupId
} from '../src/group-identity.mjs';

const sourceId = '120363111111111111-1111111111@g.us';
const labId = '120363222222222222-2222222222@g.us';

test('extracts stable @g.us IDs from WhatsApp DOM-like attributes', () => {
  const ids = extractGroupIds(
    `false_${sourceId}_ABC123`,
    `true_${labId}_XYZ999`,
    `duplicate_${sourceId}`
  );
  assert.deepEqual(ids.sort(), [labId, sourceId].sort());
});

test('DOM separators do not become part of the group JID', () => {
  assert.deepEqual(extractGroupIds(`row_${sourceId}_tail`), [sourceId]);
  assert.deepEqual(extractGroupIds(`prefix:${labId};suffix`), [labId]);
  assert.deepEqual(extractGroupIds(`bad_${sourceId}x_tail`), []);
});

test('normalization rejects user and malformed JIDs', () => {
  assert.equal(normalizeGroupId(sourceId.toUpperCase()), sourceId);
  assert.equal(normalizeGroupId('584121234567@s.whatsapp.net'), '');
  assert.equal(normalizeGroupId('not-a-group'), '');
});

test('destination guard requires exact ID plus exact normalized title', () => {
  assert.equal(assertPinnedGroupIdentity({
    role: 'lab',
    expectedId: labId,
    expectedTitle: 'Control hípico lab',
    actualId: labId,
    actualTitle: 'Control hípico lab',
    sourceId
  }), true);

  assert.throws(() => assertPinnedGroupIdentity({
    role: 'lab', expectedId: labId, expectedTitle: 'Control hípico lab', actualId: sourceId,
    actualTitle: 'Control hípico lab', sourceId
  }), /LAB_ID_MISMATCH/);

  assert.throws(() => assertPinnedGroupIdentity({
    role: 'lab', expectedId: sourceId, expectedTitle: 'Control hípico lab', actualId: sourceId,
    actualTitle: 'Control hípico lab', sourceId
  }), /LAB_POINTS_TO_SOURCE/);

  assert.throws(() => assertPinnedGroupIdentity({
    role: 'lab', expectedId: labId, expectedTitle: 'Control hípico lab', actualId: labId,
    actualTitle: 'Grupo parecido', sourceId
  }), /LAB_TITLE_MISMATCH/);
});

test('ambiguous discovery never guesses a group ID', () => {
  assert.equal(selectUniqueGroupId([sourceId]), sourceId);
  assert.equal(selectUniqueGroupId([sourceId, labId]), '');
  assert.equal(selectUniqueGroupId([sourceId, labId], labId), labId);
  assert.equal(selectUniqueGroupId([sourceId], labId), '');
});

test('logs can redact group IDs', () => {
  const redacted = redactGroupId(sourceId);
  assert.match(redacted, /^120363…1111@g\.us$/);
  assert.equal(redacted.includes(sourceId), false);
});
