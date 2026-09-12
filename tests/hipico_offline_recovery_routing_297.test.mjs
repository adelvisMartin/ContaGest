import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const sw=readFileSync(new URL('../frontend/public/hipico-control/sw.js',import.meta.url),'utf8');

test('offline recovery navigation resolves to the dedicated recovery shell instead of normal app index',()=>{
  assert.match(sw,/function offlineNavigationShell\(url\)/);
  assert.match(sw,/url\.pathname\.endsWith\('\/recovery\.html'\) \? '\.\/recovery\.html' : '\.\/index\.html'/);
  assert.match(sw,/const preferred = offlineNavigationShell\(url\)/);
  assert.match(sw,/cache\.match\(scoped\(preferred\)\)/);
});

test('service worker keeps sensitive APIs and runtime metadata out of offline cache',()=>{
  assert.match(sw,/isSensitive\(url\) \|\| isRuntimeMetadata\(url\)/);
  assert.match(sw,/fetch\(request, \{ cache: 'no-store' \}\)/);
  assert.doesNotMatch(sw,/cache\.put\(request[^\n]*isSensitive/);
});
