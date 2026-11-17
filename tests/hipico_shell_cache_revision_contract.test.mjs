import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertHipicoShellCacheRotated } from './support/hipico-shell-cache-contract.mjs';

const candidate = (revision) => `const CACHE_VERSION = 'hipico-control-v1.13.0-rc3';
const SHELL_CACHE = \`\${CACHE_VERSION}-shell-r${revision}-consolidator-v4-1-3\`;`;

test('Hípico shell cache requires upgrade beyond the historic looping revision', () => {
  assert.throws(() => assertHipicoShellCacheRotated(candidate(38)), /supersede historic r38/);
  assert.equal(assertHipicoShellCacheRotated(candidate(39)), 39);
  assert.equal(assertHipicoShellCacheRotated(candidate(40)), 40);
  assert.throws(() => assertHipicoShellCacheRotated('const SHELL_CACHE = "unversioned";'), /exactly one/);
  assert.throws(() => assertHipicoShellCacheRotated(candidate(39) + '\n' + candidate(40)), /exactly one/);
});

test('current service-worker cache is upgraded, and old cache removal and privacy restrictions remain', () => {
  const source = readFileSync('frontend/public/hipico-control/sw.js', 'utf8');
  assertHipicoShellCacheRotated(source);
  assert.match(source, /key\.startsWith\('hipico-control-'\)\s*&&\s*key\s*!==\s*SHELL_CACHE/);
  assert.match(source, /isSensitive\(url\)\s*\|\|\s*isRuntimeMetadata\(url\)/);
  assert.match(source, /fetch\(request, \{ cache: 'no-store' \}\)/);
  assert.match(source, /await self\.skipWaiting\(\)/);
  assert.match(source, /await self\.clients\.claim\(\)/);
});
