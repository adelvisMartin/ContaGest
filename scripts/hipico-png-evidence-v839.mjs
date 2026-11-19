/**
 * Structural PNG check for #839 release evidence. A valid PNG is not proof
 * that Chromium ran; that independent exact-SHA gate is required separately.
 */
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_BYTES = 30 * 1024 * 1024;
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});

function chunkCrc(bytes, start, end) {
  let crc = 0xffffffff;
  for (let i = start; i < end; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function validHipicoPngEvidence(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 57 || bytes.length > MAX_BYTES ||
      !bytes.subarray(0, 8).equals(SIGNATURE)) return false;
  let offset = 8;
  let hasHeader = false;
  let hasImageData = false;
  let imageDataEnded = false;
  let chunks = 0;
  while (offset + 12 <= bytes.length) {
    // A bounded file cannot use an unbounded list of zero-byte chunks.
    if (++chunks > 8192) return false;
    const length = bytes.readUInt32BE(offset);
    if (length > bytes.length - offset - 12) return false;
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type) ||
        bytes.readUInt32BE(offset + 8 + length) !==
          chunkCrc(bytes, offset + 4, offset + 8 + length)) return false;
    if (!hasHeader) {
      if (type !== 'IHDR' || length !== 13) return false;
      const width = bytes.readUInt32BE(offset + 8);
      const height = bytes.readUInt32BE(offset + 12);
      if (width < 320 || height < 240 || width > 16384 || height > 16384) return false;
      hasHeader = true;
    } else if (type === 'IHDR') return false;
    if (type === 'IDAT') {
      if (imageDataEnded) return false;
      if (length > 0) hasImageData = true;
    } else if (hasImageData) imageDataEnded = true;
    offset += length + 12;
    if (type === 'IEND') return length === 0 && hasImageData && offset === bytes.length;
  }
  return false;
}
