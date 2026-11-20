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
  // Spreadsheet import is values-only. Never accept macro projects, embedded
  // executable/OLE payloads, external connections or relationships that the
  // previewer does not need (and therefore cannot inspect for outbound links).
  if (/^(?:xl\/(?:vbaProject(?:Signature)?\.bin|activeX\/|embeddings\/|externalLinks\/|connections\.xml|queryTables\/|webExtensions\/|ctrlProps\/)|customUI\/|_xmlsignatures\/)/i.test(name) ||
      (name.endsWith('.rels') && !['_rels/.rels','xl/_rels/workbook.xml.rels'].includes(name))) {
    throw new TypeError('XLSX_UNTRUSTED_CONTENT');
  }
  return name;
}

/** XLSX XML must not process entities or DTDs from untrusted uploads. */
export function assertSafeImportXml(source) {
  if (typeof source !== 'string' || /<!DOCTYPE|<!ENTITY/iu.test(source))
    throw new TypeError('XLSX_XML_DTD_FORBIDDEN');
  return source;
}


// ZIP's CRC-32 detects accidental payload corruption; not cryptographic authenticity.
const CRC_TABLE = Uint32Array.from({length:256}, (_, value) => {
  let crc = value;
  for (let i=0;i<8;i++) crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  return crc >>> 0;
});
export function assertZipCrc32(bytes, expected) {
  if (!(bytes instanceof Uint8Array) || !Number.isSafeInteger(expected) ||
      expected < 0 || expected > 0xffffffff) {
    throw new TypeError('XLSX_ZIP_CRC_MISMATCH');
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  if (((crc ^ 0xffffffff) >>> 0) !== expected) {
    throw new TypeError('XLSX_ZIP_CRC_MISMATCH');
  }
  return true;
}
