import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('el service worker forma parte de la salida pública de Vite', async () => {
  const [worker, vercelRaw] = await Promise.all([
    read('frontend/public/sw.js'),
    read('frontend/vercel.json')
  ]);
  const vercel = JSON.parse(vercelRaw);
  assert.match(worker, /contagest-ve-v11-14-0/);
  const shell = worker.match(/const APP_SHELL.*;/)?.[0] || '';
  for (const required of ['/', '/index.html', '/manifest.webmanifest', '/icons/contagest-app-192.svg', '/icons/contagest-app-512.svg']) {
    assert.ok(shell.includes(`'${required}'`), required);
  }
  assert.doesNotMatch(shell, /\/api\//);
  assert.ok(vercel.headers.some((entry) =>
    entry.source === '/sw.js'
    && entry.headers.some((header) => header.key === 'Service-Worker-Allowed' && header.value === '/')
  ));
});

test('salud usa un Lambda nuevo y expone la revisión desplegada', async () => {
  const [status, vercelRaw] = await Promise.all([
    read('frontend/api/status.ts'),
    read('frontend/vercel.json')
  ]);
  const vercel = JSON.parse(vercelRaw);
  assert.match(status, /VERSION = '11\.14\.0'/);
  assert.match(status, /VERCEL_GIT_COMMIT_SHA/);
  assert.equal(vercel.functions['api/status.ts']?.maxDuration, 30);
  assert.ok(vercel.routes
    .filter((route) => ['/health','/api/health'].includes(route.src))
    .every((route) => route.dest === '/api/status.ts'));
});
