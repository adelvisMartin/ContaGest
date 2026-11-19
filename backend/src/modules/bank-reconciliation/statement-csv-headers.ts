/**
 * #743 Bank CSV header authority. Headers are untrusted: two spelling variants
 * of a monetary/date field must never silently select one and discard another.
 */
export class StatementCsvHeadersError extends Error {
  constructor() { super('BANK_STATEMENT_CSV_HEADERS_AMBIGUOUS'); }
}

// Hidden format controls can disguise a second monetary/date column.
// Only a file-wide UTF-8 BOM at the very start of the first header is valid.
const INVISIBLE_HEADER = /[\u007f-\u009f\u00ad\u034f\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/u;

const normalizeHeader = (value: string): string =>
  value.trim().toLowerCase().replace(/[\s-]+/g, '_').replace(/_/g, '');

/**
 * Resolve at most one source column for each canonical financial field.
 * A single FITID column may intentionally supply both id and reference.
 * Unknown columns remain available in raw evidence if their names are unique.
 */
export function resolveStatementCsvHeaders(
  headers: readonly string[], aliases: Readonly<Record<string, readonly string[]>>
): Record<string, number> {
  const normalized = headers.map((header, index) => {
    const value = index === 0 && header.startsWith('\ufeff') ? header.slice(1) : header;
    if (INVISIBLE_HEADER.test(value)) throw new StatementCsvHeadersError();
    return normalizeHeader(value);
  });
  if (normalized.some((name) => name.length === 0) || new Set(normalized).size !== normalized.length) {
    throw new StatementCsvHeadersError();
  }
  const indexes: Record<string, number> = Object.create(null);
  for (const [canonical, accepted] of Object.entries(aliases)) {
    const recognized = new Set(accepted.map(normalizeHeader));
    let matched = -1;
    for (let index = 0; index < normalized.length; index += 1) {
      if (!recognized.has(normalized[index])) continue;
      if (matched !== -1) throw new StatementCsvHeadersError();
      matched = index;
    }
    indexes[canonical] = matched;
  }
  return indexes;
}
