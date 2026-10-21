/**
 * Import batch report CSV output must never expose executable spreadsheet cells.
 * Whitespace, tabs, newlines, BOM and non-breaking space must not evade
 * the formula guard; never interpret or evaluate the cell contents.
 */
export function encodeImportReportCsvCell(value: unknown): string {
  let cell=String(value??'');
  // Flatten control characters to avoid record splitting and invisible prefixes.
  cell=cell.replace(/[\u0000-\u001f\u007f-\u009f]/gu,' ');
  // Leading whitespace is allowed in CSV, but can hide Excel/Calc formula prefixes.
  if(/^[\s\u00a0\u2000-\u200a\u202f\u205f\u3000\ufeff]*[=+\-@]/u.test(cell))
    cell="'"+cell;
  return '"'+cell.replace(/"/g,'""')+'"';
}
