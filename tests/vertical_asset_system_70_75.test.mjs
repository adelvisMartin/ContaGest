import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import test from 'node:test';

test('70/75 vertical assets are local catalogued and PWA-safe',()=>{
  const run=spawnSync(process.execPath,['scripts/vertical-asset-system-audit-v7075.mjs'],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr||run.stdout);
  assert.match(run.stdout,/\[vertical-assets\]\[PASS\]/);
});

test('70/75 private shell has no critical Google Fonts or Font Awesome CDN dependency',()=>{
  const html=fs.readFileSync('frontend/index.html','utf8');
  assert.doesNotMatch(html,/fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com/);
  assert.match(html,/\/vendor\/fontawesome\/css\/all\.min\.css/);
  assert.match(html,/\/vendor\/fonts\/fonts\.css/);
});

test('70/75 preserves third-party visual asset licenses',()=>{
  for(const file of [
    'frontend/public/vendor/fontawesome/LICENSE.txt',
    'frontend/public/vendor/fonts/inter/OFL.txt',
    'frontend/public/vendor/fonts/jetbrains-mono/OFL.txt'
  ]) assert.ok(fs.statSync(file).size>100,file);
});
