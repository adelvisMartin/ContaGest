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
