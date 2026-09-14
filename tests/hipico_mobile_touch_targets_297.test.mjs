import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css=await readFile(new URL('../frontend/public/hipico-control/assets/css/app.css',import.meta.url),'utf8');

test('canonical UI enforces the 44px critical-control contract through landscape phone widths and coarse pointers',()=>{
  assert.match(css,/@media\s*\(max-width:\s*900px\),\s*\(pointer:\s*coarse\)/);
  assert.match(css,/\.button,[\s\S]*\.nav-button,[\s\S]*\.mobile-nav button,[\s\S]*\[role="button"\]\s*\{\s*min-height:\s*var\(--hc-touch,\s*44px\)/);
  assert.match(css,/\.icon-button\s*\{[^}]*min-width:\s*var\(--hc-touch,\s*44px\)[^}]*height:\s*var\(--hc-touch,\s*44px\)/s);
  assert.match(css,/\.ops-button, \.ops-icon, \.ops-dialog select, \.ops-message summary\s*\{\s*min-height:\s*var\(--hc-touch,\s*44px\)/);
});

test('canonical UI honors reduced-motion preference without removing content',()=>{
  assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css,/animation-duration:\s*\.01ms\s*!important/);
  assert.match(css,/transition-duration:\s*\.01ms\s*!important/);
  assert.match(css,/scroll-behavior:\s*auto\s*!important/);
});