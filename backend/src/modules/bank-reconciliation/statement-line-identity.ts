import { createHash } from 'node:crypto';

/**
 * #743 - Storage identity for one statement line, distinct from the canonical
 * line-content fingerprint. Bank-assigned IDs remain account-unique at the DB
 * constraint; rows lacking a bank ID must never be collapsed merely because
 * their descriptions, timestamps, amounts, and counterparties are identical.
 */
export function statementImportLineHash(input: Readonly<{
  canonicalLineHash: string;
  sourceHash: string;
  rowIndex: number;
  bankLineId: string | null;
}>): string {
  const digest = /^[a-f0-9]{64}$/;
  if (!input || typeof input !== 'object' ||
      typeof input.canonicalLineHash !== 'string' || !digest.test(input.canonicalLineHash) ||
      typeof input.sourceHash !== 'string' || !digest.test(input.sourceHash) ||
      !Number.isSafeInteger(input.rowIndex) || input.rowIndex < 0 ||
      input.rowIndex >= 100_000 ||
      (input.bankLineId !== null &&
       (typeof input.bankLineId !== 'string' || input.bankLineId.length === 0))) {
    throw new TypeError('BANK_STATEMENT_LINE_IDENTITY_INVALID');
  }
  if (input.bankLineId !== null) return input.canonicalLineHash;
  return createHash('sha256')
    .update(JSON.stringify({
      version: 1,
      sourceHash: input.sourceHash,
      rowIndex: input.rowIndex,
      canonicalLineHash: input.canonicalLineHash
    }), 'utf8')
    .digest('hex');
}
