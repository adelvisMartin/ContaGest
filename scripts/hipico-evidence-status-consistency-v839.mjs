/** #839: all matching exact-SHA evidence reports must agree on their gate status.
 * Do not allow a PASS artifact to mask a FAIL, BLOCKED or NOT_EXECUTED sibling.
 * This is contract integrity, not proof that a physical drill occurred.
 */
export function evidenceStatusesConflict(records, statusOf) {
  if (!Array.isArray(records) || typeof statusOf !== 'function') return true;
  const statuses = new Set(records.map(item => statusOf(item?.data)));
  return statuses.size > 1;
}
