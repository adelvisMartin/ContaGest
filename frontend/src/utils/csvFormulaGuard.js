/**
 * Spreadsheet formula guard for untrusted, human-readable CSV cells.
 * Keep all leading characters: trimming changes business data and can make
 * an invisible prefix pass through a less strict downstream exporter.
 * A typed number/bigint is already numeric data; a text value that happens
 * to look numeric is still untrusted text, including signed decimals.
 */
const FORMULA_PREFIX = /^[\u0000-\u0020\u007f-\u009f\u00a0\u00ad\u034f\u061c\u115f\u1160\u1680\u180e\u2000-\u200f\u2028-\u202e\u202f\u205f\u2060-\u2069\u2800\u3000\u3164\ufe00-\ufe0f\ufeff\uffa0]*[=+\-@]/u;

export function neutralizeSpreadsheetFormula(value) {
  const text = String(value ?? '');
  const numeric = (typeof value === 'number' && Number.isFinite(value)) || typeof value === 'bigint';
  return !numeric && FORMULA_PREFIX.test(text) ? `'${text}` : text;
}
