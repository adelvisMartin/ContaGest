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

/** Reject ambiguous ZIP member paths; XLSX members are read-only but must be canonical. */
export function assertXlsxZipEntryName(name) {
  if (typeof name !== 'string' || !name || name.length > 240 ||
      name.startsWith('/') || name.includes('\\') || name.includes('\0') ||
      name.split('/').some(segment=>segment==='.' || segment==='..') ||
      /[\u0000-\u001f\u007f]/u.test(name)) {
    throw new TypeError('XLSX_ZIP_ENTRY_NAME_INVALID');
  }
  return name;
}

/** XLSX XML must not process entities or DTDs from untrusted uploads. */
export function assertSafeImportXml(source) {
  if (typeof source !== 'string' || /<!DOCTYPE|<!ENTITY/iu.test(source))
    throw new TypeError('XLSX_XML_DTD_FORBIDDEN');
  return source;
}
