/** #839: all matching exact-SHA evidence reports must agree on their gate status.
 * Do not allow a PASS artifact to mask a FAIL, BLOCKED or NOT_EXECUTED sibling.
 * This is contract integrity, not proof that a physical drill occurred.
 */
export function evidenceStatusesConflict(records, statusOf, allowedSchemas = []) {
  if (!Array.isArray(records) || typeof statusOf !== 'function' ||
      !Array.isArray(allowedSchemas)) return true;
  // An invalid schema under the current SHA cannot be hidden behind a
  // second PASS report in a recognized schema for the same gate.
  if (allowedSchemas.length > 0 && records.some(item =>
      !allowedSchemas.includes(String(item?.data?.schema || '')))) return true;
  const statuses = new Set(records.map(item => statusOf(item?.data)));
  return statuses.size > 1;
}

/**
 * Validate every copy that claims the candidate SHA, not only the first PASS.
 * A corrupt sibling can otherwise be hidden by a well-formed sibling with
 * the same top-level status. Return the offending copy for an auditable error.
 */
export async function firstInvalidEvidenceCopy(records, validate) {
  if (!Array.isArray(records) || typeof validate !== 'function') {
    return { item: null, reason: 'EVIDENCE_CONTRACT_MISMATCH' };
  }
  for (const item of records) {
    try {
      const reason = await validate(item);
      if (reason) return { item, reason: String(reason) };
    } catch {
      // Filesystem/validator failures can never be treated as evidence PASS.
      return { item, reason: 'EVIDENCE_CONTRACT_MISMATCH' };
    }
  }
  return null;
}
