import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';

console.log('[issue26] regenerando package-lock con npm...');
execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: { ...process.env, CI: 'true' },
});

const lock = readFileSync('package-lock.json');
const packed = gzipSync(lock, { level: 9 }).toString('base64');
const sha256 = createHash('sha256').update(lock).digest('hex');
const chunkSize = 3500;
const total = Math.ceil(packed.length / chunkSize);
console.log(`ISSUE26_LOCK_META bytes=${lock.length} packed=${packed.length} sha256=${sha256} parts=${total}`);
for (let i = 0; i < total; i += 1) {
  const chunk = packed.slice(i * chunkSize, (i + 1) * chunkSize);
  console.log(`ISSUE26_LOCK_PART_${String(i + 1).padStart(2, '0')}_OF_${String(total).padStart(2, '0')} ${chunk}`);
}

mkdirSync('frontend/dist', { recursive: true });
copyFileSync('package-lock.json', 'frontend/dist/issue26-package-lock.json');
writeFileSync('frontend/dist/index.html', '<!doctype html><meta charset="utf-8"><title>Issue 26</title><p>Lock generado por npm para QA.</p>', 'utf8');
console.log('[issue26] lock exportado');
