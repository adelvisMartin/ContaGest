/** Extracts booking/value dates inside their owning CAMT container. */
export function camtDateField(entry, container) {
  if (typeof entry !== 'string' || !['BookgDt', 'ValDt'].includes(container))
    throw new TypeError('BANK_CAMT_DATE_FIELD_INVALID');
  const prefix = '(?:[A-Za-z_][\\w.-]*:)?';
  const start = new RegExp(`<${prefix}${container}(?:\\s[^>]*)?>`, 'i').exec(entry);
  if (!start) return '';
  const innerStart = start.index + start[0].length;
  const end = new RegExp(`</${prefix}${container}\\s*>`, 'i').exec(entry.slice(innerStart));
  if (!end) throw new TypeError('BANK_CAMT_DATE_FIELD_MALFORMED');
  const inner = entry.slice(innerStart, innerStart + end.index);
  const date = new RegExp(`<${prefix}(?:Dt|DtTm)(?:\\s[^>]*)?>([^<>]{1,64})</${prefix}(?:Dt|DtTm)\\s*>`, 'i').exec(inner);
  if (!date) throw new TypeError('BANK_CAMT_DATE_FIELD_MALFORMED');
  return date[1].trim();
}
