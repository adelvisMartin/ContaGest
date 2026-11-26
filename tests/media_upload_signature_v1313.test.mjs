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

  const scopedParserAt = app.indexOf("app.post('/api/v1/media/upload', csrfProtection, express.json({ limit: '5mb' }));");
  const globalParserAt = app.indexOf('app.use(express.json({');
  assert.ok(scopedParserAt >= 0, 'Only /api/v1/media/upload should accept a 5 MiB JSON body');
  assert.ok(globalParserAt > scopedParserAt, 'Route-specific parser must precede global parser');
  assert.ok(app.indexOf('app.use(globalRateLimit)') < scopedParserAt, 'Global rate limit must still run first');
  assert.ok(app.indexOf('app.use(enforceProductionSecrets)') < scopedParserAt, 'Production secrets gate must still run first');
  assert.ok(app.indexOf('app.use(csrfProtection)') > scopedParserAt, 'Global CSRF gate remains intact');
  assert.match(app, /app\.post\('\/api\/v1\/media\/upload', csrfProtection, express\.json\(\{ limit: '5mb' \}\)\)/, 'Cookie CSRF must execute before 5 MiB parsing');
});


// Exercise the actual Express upload handler with isolated provider/DB fakes.
// Full HTTP, tenant/RLS and storage integrations are separate required gates.
const uploadStart = source.indexOf("router.post('/upload', asyncHandler(");
const uploadEnd = source.indexOf("router.get('/dental-attachments'", uploadStart);
assert.ok(uploadStart >= 0 && uploadEnd > uploadStart, 'generic upload handler must be located');
const uploadHandlerSource = stripTypeScriptTypes(source.slice(uploadStart, uploadEnd));

function buildUploadScenario({ signFailure = false, emptySign = false, updateFailure = false, cleanupError = false, authFailure = false, scanFailure = false } = {}) {
  const events = [];
  let uploadHandler;
  const provider = {
    upload: async () => { events.push('upload'); return { error: null }; },
    createSignedUrl: async () => {
      events.push('sign');
      if (signFailure) return { data: null, error: new Error('provider-private-path') };
      if (emptySign) return { data: null, error: null };
      return { data: { signedUrl: 'signed.local' }, error: null };
    },
    remove: async () => {
      events.push('remove');
      return { error: cleanupError ? new Error('provider cleanup failed') : null };
    }
  };
  runInNewContext(uploadHandlerSource, {
    router: { post: (_path, fn) => { uploadHandler = fn; } },
    asyncHandler: fn => fn,
    uploadSchema: { parse: value => value },
    authorize: async () => {
      events.push('authorize');
      if (authFailure) throw new HttpError(403, 'No permitido');
    },
    parseDataUrl: () => ({
      mime: 'image/png', extension: 'png',
      bytes: Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])
    }),
    // Isolated handler boundary: record scan ordering and exercise fail-closed rejection.
    // The real scanner protocol is exercised separately in external-file-scan.test.ts.
    scanExternalFile: async bytes => {
      events.push('scan');
      assert.deepEqual(bytes, cases.find(item => item.mime === 'image/png').bytes);
      if (scanFailure) throw new HttpError(422, 'EXTERNAL_FILE_MALWARE_DETECTED');
    },
    tenantPath: () => 'tenant-a/profile/profile-1/file.png',
    client: () => ({ storage: { from: () => provider } }),
    registerStorageObject: async () => { events.push('register'); },
    updateEntityPhoto: async () => {
      events.push('update');
      if (updateFailure) throw new Error('database failed');
    },
    markStorageObjectDeleted: async () => { events.push('mark-deleted'); },
    crypto: { createHash: () => ({ update: () => ({ digest: () => 'sha256-test' }) }) },
    BUCKET: 'contagest-media', HttpError,
    ok: (res, data, status) => { events.push('ok'); res.data = data; res.status = status; }
  });
  assert.equal(typeof uploadHandler, 'function');
  const req = {
    context: { tenantId: 'tenant-a', userId: 'profile-1' },
    body: { entityType: 'profile', entityId: 'profile-1', dataUrl: 'fixture' }
  };
  const res = {};
  return { events, res, execute: () => uploadHandler(req, res) };
}

test('#1313 media signing succeeds before the entity photo is committed', async () => {
  const { events, res, execute } = buildUploadScenario();
  await execute();
  assert.deepEqual(events, ['authorize', 'scan', 'upload', 'register', 'sign', 'update', 'ok']);
  assert.equal(res.status, 201);
  assert.equal(res.data.signedUrl, 'signed.local');
});

test('#1313 failed or empty signing cleans up without changing the photo', async () => {
  for (const options of [{signFailure:true}, {emptySign:true}]) {
    const { events, execute } = buildUploadScenario(options);
    await assert.rejects(execute(), error =>
      error.status === 502 && !error.message.includes('provider-private-path'));
    assert.deepEqual(events, ['authorize', 'scan', 'upload', 'register', 'sign', 'remove', 'mark-deleted']);
  }
});

test('#1313 cleanup failure does not claim a failed removal was deleted', async () => {
  const { events, execute } = buildUploadScenario({ signFailure:true, cleanupError:true });
  await assert.rejects(execute(), error => error.status === 502);
  assert.deepEqual(events, ['authorize', 'scan', 'upload', 'register', 'sign', 'remove']);
});

test('#1313 DB update rollback and pre-upload authorization remain enforced', async () => {
  const dbFailure = buildUploadScenario({ updateFailure:true });
  await assert.rejects(dbFailure.execute(), /database failed/);
  assert.deepEqual(dbFailure.events, ['authorize', 'scan', 'upload', 'register', 'sign', 'update', 'remove', 'mark-deleted']);

  const unauthorised = buildUploadScenario({ authFailure:true });
  await assert.rejects(unauthorised.execute(), error => error.status === 403);
  assert.deepEqual(unauthorised.events, ['authorize']);
});

test('#1391 rejected media scan has no storage, signing or database effects', async () => {
  const scenario = buildUploadScenario({ scanFailure: true });
  await assert.rejects(scenario.execute(), error => error.status === 422 && error.message === 'EXTERNAL_FILE_MALWARE_DETECTED');
  assert.deepEqual(scenario.events, ['authorize', 'scan']);
  assert.deepEqual(scenario.res, {});
});

test('#1391 clinical PDF import rejects embedded actions, remote links and encryption', () => {
  const { assertPassiveClinicalPdf } = runInNewContext(
    stripTypeScriptTypes(section('assertPassiveClinicalPdf', 'safeFileName')) + '\n({assertPassiveClinicalPdf})',
    {Buffer, HttpError}
  );
  const pdf = (inner='') => Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog ' + inner + ' >> endobj\n%%EOF\n', 'latin1');
  assert.equal(assertPassiveClinicalPdf(pdf(), 'application/pdf'),undefined);
  for (const element of ['/JavaScript 2 0 R','/J#53 2 0 R','/OpenAction 3 0 R',
    '/URI (https://external.example)','/EmbeddedFile 4 0 R','/Encrypt 7 0 R','/ObjStm 8 0 R']) {
    assert.throws(() => assertPassiveClinicalPdf(pdf(element), 'application/pdf'),
      error => error.status === 422 && /no autorizados/.test(error.message), element);
  }
  assert.throws(()=>assertPassiveClinicalPdf(Buffer.from('%PDF-1.7'), 'application/pdf'),
    error => error.status===422 && /estructura/.test(error.message));
});
test('#1391 clinical and generic media writes must scan before uploading',()=>{
  const upload = source.split("router.post('/upload'")[1].split("router.get('/dental-attachments'")[0];
  const clinicalStart = source.search(/router\.post\(\s*'\/dental-attachments',/);
  const clinicalEnd = source.indexOf("router.post('/sign'", clinicalStart);
  assert.ok(clinicalStart >= 0 && clinicalEnd > clinicalStart, 'clinical POST handler must be located');
  const clinical = source.slice(clinicalStart, clinicalEnd);
  const genericScan = upload.indexOf('await scanExternalFile(image.bytes)');
  const genericWrite = upload.indexOf('.upload(path, image.bytes');
  assert.ok(genericScan >= 0 && genericWrite > genericScan);
  const pdfGuard = clinical.indexOf('assertPassiveClinicalPdf(bytes,mime)');
  const clinicalScan = clinical.indexOf('await scanExternalFile(bytes)');
  const clinicalWrite = clinical.indexOf('.upload(storagePath,bytes');
  assert.ok(pdfGuard >= 0 && clinicalScan > pdfGuard && clinicalWrite > clinicalScan);
});
