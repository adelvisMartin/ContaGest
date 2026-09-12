import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css=await readFile(new URL('../frontend/public/hipico-control/assets/css/mobile-accessibility.css',import.meta.url),'utf8');

test('mobile accessibility layer enforces the 44px critical-control contract through landscape phone widths',()=>{
  assert.match(css,/@media\s*\(max-width:\s*900px\),\s*\(pointer:\s*coarse\)/);
  assert.match(css,/\.button,[\s\S]*\.nav-button,[\s\S]*\.mobile-nav button,[\s\S]*\[role="button"\][\s\S]*min-height:\s*var\(--hc-touch,\s*44px\)/);
  assert.match(css,/\.icon-button\s*\{[\s\S]*min-width:\s*var\(--hc-touch,\s*44px\)[\s\S]*height:\s*var\(--hc-touch,\s*44px\)/);
});

test('accessibility layer honors reduced-motion preference without removing content',()=>{
  assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css,/animation-duration:\s*0\.01ms\s*!important/);
  assert.match(css,/transition-duration:\s*0\.01ms\s*!important/);
  assert.match(css,/scroll-behavior:\s*auto\s*!important/);
});