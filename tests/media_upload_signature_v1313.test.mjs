import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

// Exercise the production parser and signature function, without provider I/O.
const source = readFileSync(new URL('../backend/src/modules/media/media.routes.ts', import.meta.url), 'utf8');
function section(startName, nextName) {
  const start = source.indexOf('function ' + startName + '(');
  const end = source.indexOf('function ' + nextName + '(', start);
  assert.ok(start !== -1 && end > start, startName + ' must remain an executable source function');
  return source.slice(start, end);
}
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const functions = stripTypeScriptTypes(section('parseDataUrl', 'tenantPath') + section('validateClinicalMagic', 'safeFileName'));
const { parseDataUrl, validateClinicalMagic } = runInNewContext(
  functions + '\n({parseDataUrl, validateClinicalMagic})',
  {
    Buffer, HttpError, MAX_BYTES: 3 * 1024 * 1024,
    allowedMime: new Map([['image/jpeg','jpg'], ['image/png','png'], ['image/webp','webp']]),
    clinicalMime: new Map([['image/jpeg','jpg'], ['image/png','png'], ['image/webp','webp'], ['application/pdf','pdf']])
  }
);
const cases = [
  { mime: 'image/jpeg', ext: 'jpg', bytes: Buffer.from([0xff,0xd8,0xff,0xe0]) },
  { mime: 'image/png', ext: 'png', bytes: Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]) },
  { mime: 'image/webp', ext: 'webp', bytes: Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBP', 'binary') }
];
const dataUrl = (mime, bytes) => 'data:' + mime + ';base64,' + bytes.toString('base64');

test('#1313 upload preserves JPEG, PNG and WebP signatures', () => {
  for (const {mime, ext, bytes} of cases) {
    const parsed = parseDataUrl(dataUrl(mime, bytes));
    assert.equal(parsed.mime, mime);
    assert.equal(parsed.extension, ext);
    assert.deepEqual(parsed.bytes, bytes);
  }
});
test('#1313 upload refuses MIME-spoofed and HTML content', () => {
  for (const {mime} of cases) {
    for (const other of cases.filter(item => item.mime !== mime))
      assert.throws(() => parseDataUrl(dataUrl(mime, other.bytes)), error => error.status === 422 && /firma binaria/.test(error.message));
    assert.throws(() => parseDataUrl(dataUrl(mime, Buffer.from('<script>1</script>'))), error => error.status === 422 && /firma binaria/.test(error.message));
  }
});
test('#1313 generic upload retains MIME and size boundaries', () => {
  assert.throws(() => parseDataUrl(dataUrl('application/pdf', Buffer.from('%PDF-1.7'))), error => error.status === 422);
  assert.throws(() => parseDataUrl(dataUrl('image/png', Buffer.alloc(3*1024*1024+1))), error => error.status === 413);
});
test('#1313 clinical attachments retain PDF support and reject spoofing', () => {
  assert.equal(validateClinicalMagic(Buffer.from('%PDF-1.7'), 'application/pdf'), 'pdf');
  assert.throws(() => validateClinicalMagic(Buffer.from('<html>'), 'application/pdf'), error => error.status === 422);
});


test('#1313 1000 deterministic signature mutations fail closed', () => {
  let seed = 0x7201313;
  function random() {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
  }
  for (let index = 0; index < 1000; index += 1) {
    const { mime, bytes: original } = cases[index % cases.length];
    const mutableIndices = mime === 'image/webp'
      ? [0, 1, 2, 3, 8, 9, 10, 11]
      : Array.from({ length: mime === 'image/jpeg' ? 3 : 8 }, (_, i) => i);
    const corrupted = Buffer.concat([original, Buffer.alloc(random() % 257)]);
    const position = mutableIndices[random() % mutableIndices.length];
    corrupted[position] ^= 1 << (random() % 8);
    assert.throws(
      () => parseDataUrl(dataUrl(mime, corrupted)),
      error => error.status === 422 && /firma binaria/.test(error.message),
      'media=' + mime + ' case=' + index + ' changedByte=' + position
    );
  }
});

test('#1313 clinical PDF and generic WebP reject high-bit signature aliases', () => {
  const spoofedPdf = Buffer.from('%PDF-1.7');
  spoofedPdf[0] |= 0x80;
  assert.throws(
    () => validateClinicalMagic(spoofedPdf, 'application/pdf'),
    error => error.status === 422 && /firma binaria/.test(error.message)
  );
  const spoofedWebp = Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBP', 'binary');
  spoofedWebp[1] |= 0x80;
  assert.throws(
    () => parseDataUrl(dataUrl('image/webp', spoofedWebp)),
    error => error.status === 422 && /firma binaria/.test(error.message)
  );
});


test('#1313 generic upload rejects non-canonical and truncated base64 without altering valid media', () => {
  const png = cases.find(item => item.mime === 'image/png');
  const encoded = png.bytes.toString('base64');
  // Node Buffer.from quietly truncates text after padding and ignores excess padding.
  for (const bad of [encoded + 'AAAA', encoded + '===', encoded.slice(0, -1) + '==', encoded.slice(0, -2) + 'p=', 'a' + encoded]) {
    assert.throws(() => parseDataUrl('data:image/png;base64,' + bad), error => error.status === 422, bad);
  }
  assert.deepEqual(parseDataUrl('data:image/png;base64,' + encoded.slice(0, -1)).bytes, png.bytes, 'unpadded base64 remains compatible');
  assert.deepEqual(parseDataUrl('data:image/png;base64,' + encoded.slice(0, 4) + '\r\n' + encoded.slice(4)).bytes, png.bytes, 'base64 line breaks remain compatible');
});


test('#1313 oversized malformed base64 rejects with HTTP 422 rather than regex stack failure', () => {
  const bad = 'data:image/png;base64,' + 'A'.repeat(4_800_000) + '=ABC';
  assert.throws(() => parseDataUrl(bad), error => error.status === 422 && /base64/.test(error.message));
});


test('#1313 oversized canonical image rejects before allocating decoded bytes', () => {
  const prefix = cases.find(item => item.mime === 'image/png').bytes;
  const oversized = Buffer.alloc(3 * 1024 * 1024 + 1);
  prefix.copy(oversized);
  const encoded = oversized.toString('base64');
  let decodedLarge = false;
  const instrumentedBuffer = new Proxy(Buffer, {
    get(target, property) {
      if (property !== 'from') return Reflect.get(target, property);
      return (value, encoding) => {
        if (encoding === 'base64' && typeof value === 'string' && value.length > 4 * 1024 * 1024) {
          decodedLarge = true;
        }
        return Buffer.from(value, encoding);
      };
    }
  });
  const { parseDataUrl: instrumentedParser } = runInNewContext(
    functions + '\n({parseDataUrl})',
    {
      Buffer: instrumentedBuffer, HttpError, MAX_BYTES: 3 * 1024 * 1024,
      allowedMime: new Map([['image/jpeg','jpg'], ['image/png','png'], ['image/webp','webp']]),
      clinicalMime: new Map([['image/jpeg','jpg'], ['image/png','png'], ['image/webp','webp'], ['application/pdf','pdf']])
    }
  );
  assert.throws(() => instrumentedParser('data:image/png;base64,' + encoded), error => error.status === 413);
  assert.equal(decodedLarge, false, 'Do not decode data larger than MAX_BYTES into memory');
  const maximum = oversized.subarray(0, -1);
  assert.equal(instrumentedParser('data:image/png;base64,' + maximum.toString('base64')).bytes.length, 3 * 1024 * 1024, 'exact limit remains accepted');
});


test('#1313 app accepts 3 MiB image uploads without raising global JSON limit', () => {
  // Source contract: backend/src/app.ts owns global parsing; route-manifest mounts /media.
  // An actual HTTP/auth/tenant integration test must still execute against the full backend.
  const app = readFileSync(new URL('../backend/src/app.ts', import.meta.url), 'utf8');
  const env = readFileSync(new URL('../backend/src/config/env.ts', import.meta.url), 'utf8');
  const manifest = readFileSync(new URL('../backend/src/modules/route-manifest.ts', import.meta.url), 'utf8');
  assert.match(manifest, /id:\s*'media'[^\n]*path:\s*'\/media'/);
  assert.match(source, /const MAX_BYTES = 3 \* 1024 \* 1024/);
  assert.match(source, /dataUrl:\s*z\.string\(\)\.min\(30\)\.max\(5_000_000\)/);
  assert.match(env, /JSON_BODY_LIMIT:\s*z\.string\(\)\.default\('1mb'\)/);

  const scopedParserAt = app.indexOf("app.post('/api/v1/media/upload', express.json({ limit: '5mb' }));");
  const globalParserAt = app.indexOf('app.use(express.json({');
  assert.ok(scopedParserAt >= 0, 'Only /api/v1/media/upload should accept a 5 MiB JSON body');
  assert.ok(globalParserAt > scopedParserAt, 'Route-specific parser must precede global parser');
  assert.ok(app.indexOf('app.use(globalRateLimit)') < scopedParserAt, 'Global rate limit must still run first');
  assert.ok(app.indexOf('app.use(enforceProductionSecrets)') < scopedParserAt, 'Production secrets gate must still run first');
});
