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
  if(/^[\u0000-\u0020\u007f-\u009f\u00a0\u00ad\u034f\u061c\u115f\u1160\u1680\u180e\u2000-\u200f\u2028-\u202e\u202f\u205f\u2060-\u2069\u2800\u3000\u3164\ufe00-\ufe0f\ufeff\uffa0]*[=+\-@]/u.test(cell))
    cell="'"+cell;
  return '"'+cell.replace(/"/g,'""')+'"';
}
