// #770: Browser preview must bound ZIP metadata before any XLSX expansion.
const MAX_ARCHIVE_ENTRIES = 1024;
const MAX_ENTRY_BYTES = 32 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 64 * 1024 * 1024;
export function assertXlsxZipBudget({count,compressed,uncompressed,total}) {
  if (![count,compressed,uncompressed,total].every(value=>Number.isSafeInteger(value)&&value>=0) ||
      count>MAX_ARCHIVE_ENTRIES || uncompressed>MAX_ENTRY_BYTES ||
      total+uncompressed>MAX_EXPANDED_BYTES)
    throw new Error('XLSX excede los límites seguros de descompresión.');
  return total+uncompressed;
}
