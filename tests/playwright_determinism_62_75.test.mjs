import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const qaRoot=path.resolve('qa');
const specs=fs.readdirSync(qaRoot,{recursive:true})
  .map((entry)=>String(entry).replace(/\\/g,'/'))
  .filter((entry)=>entry.endsWith('.spec.mjs'))
  .sort();

test('62/75 active Playwright specs contain no fixed waitForTimeout sleeps',()=>{
  assert.ok(specs.length>=40,`expected active QA specs, found ${specs.length}`);
  const offenders=[];
  for(const relative of specs){
    const source=fs.readFileSync(path.join(qaRoot,relative),'utf8');
    if(/\.waitForTimeout\s*\(/.test(source))offenders.push(relative);
  }
  assert.deepEqual(offenders,[]);
});

test('62/75 shared readiness uses route state fonts and animation frames instead of timers',()=>{
  const source=fs.readFileSync('qa/support/playwright-determinism.mjs','utf8');
  for(const token of ['document.fonts?.ready','requestAnimationFrame','data-theme','dataset?.route','renderedRoute','waitForStableLayout','waitForRouteReady']){
    assert.ok(source.includes(token),token);
  }
  assert.doesNotMatch(source,/setTimeout\s*\(|waitForTimeout\s*\(/);
});

test('62/75 sequential credential input relies on Playwright events and explicit value/focus assertions',()=>{
  const source=fs.readFileSync('qa/login-input-interaction.spec.mjs','utf8');
  assert.match(source,/pressSequentially\('0000'/);
  assert.match(source,/toHaveValue\('0000'\)/);
  assert.match(source,/toHaveValue\('qa\.user@example\.test'\)/);
  assert.match(source,/toHaveValue\('Synthetic-QA-Value-2026'\)/);
  assert.doesNotMatch(source,/waitForTimeout/);
});
