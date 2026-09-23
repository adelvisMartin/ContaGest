import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
const read=(path)=>fs.readFile(path,'utf8');

test('vercel',async()=>{
  const vercel=await read('frontend/vercel.json');
  assert.match(vercel,/Content-Security-Policy/);
  assert.match(vercel,/frame-ancestors 'none'/);
  assert.match(vercel,/object-src 'none'/);
  assert.match(vercel,/Cache-Control\", \"value\": \"no-store, max-age=0/);
  assert.doesNotMatch(vercel,/unsafe-eval/);
});
