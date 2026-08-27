import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd().endsWith(`${path.sep}frontend`)
  ? path.resolve(process.cwd(), '..')
  : process.cwd();
const lockPath = path.join(root, 'package-lock.json');
const raw = fs.readFileSync(lockPath);
const parsed = JSON.parse(raw.toString('utf8'));
const excelSpec = parsed?.packages?.backend?.dependencies?.exceljs;
const expected = 'npm:@excel.js/exceljs@0.15.0';
if (excelSpec !== expected) {
  throw new Error(`runtime lock esperaba ${expected} y obtuvo ${String(excelSpec)}`);
}

const outputDir = path.join(root, 'frontend', 'public', '__runtime_lock_probe');
fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
const base64 = raw.toString('base64');
const chunkSize = 24_000;
const chunks = [];
for (let offset = 0, index = 0; offset < base64.length; offset += chunkSize, index += 1) {
  const name = `chunk-${String(index).padStart(3, '0')}.txt`;
  const value = base64.slice(offset, offset + chunkSize);
  fs.writeFileSync(path.join(outputDir, name), value, 'utf8');
  chunks.push({ name, length: value.length });
}
const manifest = {
  sha256: crypto.createHash('sha256').update(raw).digest('hex'),
  bytes: raw.length,
  base64Bytes: base64.length,
  chunks,
  exceljs: excelSpec
};
fs.writeFileSync(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
console.log(`[runtime-lock-probe] sha256=${manifest.sha256} bytes=${manifest.bytes} chunks=${chunks.length}`);
