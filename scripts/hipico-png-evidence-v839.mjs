/**
 * Bounded PNG validation for #839 browser evidence. Even a decodable PNG
 * never proves a browser actually ran: the same-SHA Chromium gate is separate.
 */
import { inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_BYTES = 30 * 1024 * 1024;
const MAX_RAW_BYTES = 96 * 1024 * 1024;
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});

const COLOR_DEPTHS = new Map([
  [0, { channels: 1, depths: [1, 2, 4, 8, 16] }],
  [2, { channels: 3, depths: [8, 16] }],
  [3, { channels: 1, depths: [1, 2, 4, 8] }],
  [4, { channels: 2, depths: [8, 16] }],
  [6, { channels: 4, depths: [8, 16] }]
]);
const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8],
  [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];

function chunkCrc(bytes, start, end) {
  let crc = 0xffffffff;
  for (let i = start; i < end; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function imageRows(width, height, bitsPerPixel, interlace) {
  const passes = interlace ? ADAM7 : [[0, 0, 1, 1]];
  const rows = [];
  let total = 0;
  for (const [x0, y0, dx, dy] of passes) {
    const w = Math.max(0, Math.ceil((width - x0) / dx));
    const h = Math.max(0, Math.ceil((height - y0) / dy));
    if (!w || !h) continue;
    const rowSize = 1 + Math.ceil(w * bitsPerPixel / 8);
    total += rowSize * h;
    if (total > MAX_RAW_BYTES) return null;
    rows.push({ rowSize, count: h });
  }
  return { total, rows };
}

export function validHipicoPngEvidence(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 57 || bytes.length > MAX_BYTES ||
      !bytes.subarray(0, 8).equals(SIGNATURE)) return false;
  let offset = 8;
  let header = null;
  let palette = false;
  let sawImageData = false;
  let imageDataEnded = false;
  const compressed = [];
  let compressedSize = 0;
  let chunks = 0;
  while (offset + 12 <= bytes.length) {
    if (++chunks > 8192) return false;
    const length = bytes.readUInt32BE(offset);
    if (length > bytes.length - offset - 12) return false;
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type) ||
        bytes.readUInt32BE(offset + 8 + length) !==
          chunkCrc(bytes, offset + 4, offset + 8 + length)) return false;
    const dataOffset = offset + 8;
    if (!header) {
      if (type !== 'IHDR' || length !== 13) return false;
      const width = bytes.readUInt32BE(dataOffset);
      const height = bytes.readUInt32BE(dataOffset + 4);
      const depth = bytes[dataOffset + 8];
      const colorType = bytes[dataOffset + 9];
      const compression = bytes[dataOffset + 10];
      const filter = bytes[dataOffset + 11];
      const interlace = bytes[dataOffset + 12];
      const color = COLOR_DEPTHS.get(colorType);
      if (width < 320 || height < 240 || width > 16384 || height > 16384 ||
          !color?.depths.includes(depth) || compression !== 0 || filter !== 0 ||
          (interlace !== 0 && interlace !== 1)) return false;
      header = { width, height, depth, colorType, channels: color.channels, interlace };
    } else {
      if (type === 'IHDR' || (type[0] >= 'A' && type[0] <= 'Z' &&
          !['IDAT', 'IEND', 'PLTE'].includes(type))) return false;
      if (type === 'PLTE') {
        if (palette || sawImageData || !length || length % 3 !== 0 || length > 768 ||
            [0, 4].includes(header.colorType)) return false;
        palette = true;
      } else if (type === 'IDAT') {
        if (imageDataEnded || (header.colorType === 3 && !palette)) return false;
        sawImageData = true;
        compressedSize += length;
        if (compressedSize > MAX_BYTES) return false;
        compressed.push(bytes.subarray(dataOffset, dataOffset + length));
      } else if (sawImageData) imageDataEnded = true;
    }
    offset += length + 12;
    if (type === 'IEND') {
      if (length !== 0 || !sawImageData || offset !== bytes.length) return false;
      const layout = imageRows(header.width, header.height,
        header.depth * header.channels, header.interlace);
      if (!layout || !compressedSize) return false;
      try {
        const { buffer: raw, engine } = inflateSync(
          Buffer.concat(compressed, compressedSize),
          { maxOutputLength: MAX_RAW_BYTES, info: true });
        // zlib can accept a complete stream with unconsumed trailing bytes.
        // A screenshot proof must not conceal extra IDAT data.
        if (engine.bytesWritten !== compressedSize || raw.length !== layout.total)
          return false;
        let cursor = 0;
        for (const pass of layout.rows) {
          for (let row = 0; row < pass.count; row++) {
            if (raw[cursor] > 4) return false;
            cursor += pass.rowSize;
          }
        }
        return cursor === raw.length;
      } catch { return false; }
    }
  }
  return false;
}
