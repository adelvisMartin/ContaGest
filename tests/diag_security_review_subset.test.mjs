import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { escapeHtml } from '../frontend/public/hipico-control/assets/js/ui.js';
const read=(path)=>fs.readFile(path,'utf8');

test('escape',()=>{
  for(const payload of ['<img src=x onerror=alert(1)>','<svg/onload=alert(1)>','"><script>alert(1)</script>',"' onfocus='alert(1)",'<a href="javascript:alert(1)">x</a>']){
    const escaped=escapeHtml(payload);
    assert.doesNotMatch(escaped,/<script|<img|<svg|<a\s/i);
    assert.notEqual(escaped,payload);
    if(payload.includes('<'))assert.match(escaped,/&lt;/);
    if(payload.includes('>'))assert.match(escaped,/&gt;/);
    if(payload.includes('"'))assert.match(escaped,/&quot;/);
    if(payload.includes("'"))assert.match(escaped,/&#39;/);
  }
});

test('vercel',async()=>{
  const vercel=await read('frontend/vercel.json');
  assert.match(vercel,/Content-Security-Policy/);
  assert.match(vercel,/frame-ancestors 'none'/);
  assert.match(vercel,/object-src 'none'/);
  assert.match(vercel,/Cache-Control\", \"value\": \"no-store, max-age=0/);
  assert.doesNotMatch(vercel,/unsafe-eval/);
});

test('sw',async()=>{
  const sw=await read('frontend/public/hipico-control/sw.js');
  assert.match(sw,/function isSensitive/);
  assert.match(sw,/function isRuntimeMetadata/);
  assert.match(sw,/isSensitive\(url\)\s*\|\|\s*isRuntimeMetadata\(url\)/);
  assert.match(sw,/fetch\(request, \{ cache: 'no-store' \}\)/);
  assert.match(sw,/request\.method !== 'GET'/);
});
