import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

console.log('[issue26] regenerando package-lock con npm...');
execFileSync('npm', ['install', '--package-lock-only', '--ignore-scripts'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: { ...process.env, CI: 'true' },
});

const lock = readFileSync('package-lock.json');
const packed = gzipSync(lock, { level: 9 }).toString('base64');
console.log(`ISSUE26_LOCK_GZIP_BASE64 ${packed}`);

mkdirSync('frontend/dist', { recursive: true });
copyFileSync('package-lock.json', 'frontend/dist/issue26-package-lock.json');
writeFileSync('frontend/dist/index.html', '<!doctype html><meta charset="utf-8"><title>Issue 26</title><p>Lock generado por npm para QA.</p>', 'utf8');
console.log('[issue26] lock exportado');
