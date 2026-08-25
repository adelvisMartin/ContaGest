import { normalize } from './runtime-utils.mjs';

// WhatsApp DOM attributes commonly wrap group JIDs with separators such as
// `false_<jid>_ABC123`. Word-boundaries are not valid here because `_` is a
// JavaScript word character, so a valid `@g.us_` suffix would be missed.
// Guard the numeric start and JID suffix explicitly instead.
const GROUP_ID_RE = /(?<!\d)\d{5,}-\d+@g\.us(?![a-z0-9.])/gi;

export function normalizeGroupId(value) {
  const raw = String(value || '').trim().toLowerCase();
  return /^\d{5,}-\d+@g\.us$/.test(raw) ? raw : '';
}

export function extractGroupIds(...values) {
  const ids = new Set();
  for (const value of values.flat(Infinity)) {
    const text = String(value || '');
    for (const match of text.matchAll(GROUP_ID_RE)) {
      const id = normalizeGroupId(match[0]);
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

export function assertPinnedGroupIdentity({
  role,
  expectedId,
  expectedTitle,
  actualId,
  actualTitle,
  sourceId = ''
}) {
  const wantedId = normalizeGroupId(expectedId);
  const foundId = normalizeGroupId(actualId);
  const protectedSourceId = normalizeGroupId(sourceId);
  const roleName = String(role || 'group').toUpperCase();

  if (!wantedId) throw new Error(`${roleName}_EXPECTED_ID_MISSING`);
  if (!foundId) throw new Error(`${roleName}_ACTUAL_ID_MISSING`);
  if (wantedId !== foundId) throw new Error(`${roleName}_ID_MISMATCH`);
  if (protectedSourceId && foundId === protectedSourceId && roleName !== 'SOURCE') {
    throw new Error(`${roleName}_POINTS_TO_SOURCE`);
  }
  if (expectedTitle && normalize(actualTitle) !== normalize(expectedTitle)) {
    throw new Error(`${roleName}_TITLE_MISMATCH`);
  }
  return true;
}

export function selectUniqueGroupId(candidates, expectedId = '') {
  const unique = [...new Set((candidates || []).map(normalizeGroupId).filter(Boolean))];
  const wanted = normalizeGroupId(expectedId);
  if (wanted) return unique.includes(wanted) ? wanted : '';
  return unique.length === 1 ? unique[0] : '';
}

export function redactGroupId(value) {
  const id = normalizeGroupId(value);
  if (!id) return '';
  const [left] = id.split('@');
  return `${left.slice(0, 6)}…${left.slice(-4)}@g.us`;
}
