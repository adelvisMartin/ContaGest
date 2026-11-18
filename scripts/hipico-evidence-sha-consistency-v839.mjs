/** #839: exact candidate identity cannot select one convenient SHA alias.
 * An artifact with contradictory buildCommit/sha/candidateSha must never PASS.
 */
const SHA40 = /^[a-f0-9]{40}$/i;
const FIELDS = Object.freeze(['sha', 'candidateSha', 'buildCommit']);

export function consistentEvidenceSha(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return '';
  const values = FIELDS.filter(key => Object.prototype.hasOwnProperty.call(data, key))
    .map(key => data[key]);
  if (values.length === 0 ||
      values.some(value => typeof value !== 'string' || !SHA40.test(value.trim()))) return '';
  const normalized = values.map(value => value.trim().toLowerCase());
  return normalized.every(value => value === normalized[0]) ? normalized[0] : '';
}

export function evidenceMentionsSha(data, sha) {
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      typeof sha !== 'string' || !SHA40.test(sha)) return false;
  return FIELDS.some(key => typeof data[key] === 'string' &&
    data[key].trim().toLowerCase() === sha.toLowerCase());
}
