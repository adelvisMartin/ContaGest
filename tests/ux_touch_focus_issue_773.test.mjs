import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../frontend/public/design-system/contagest-ux-contract-v1.css', import.meta.url), 'utf8');
const tokens = readFileSync(new URL('../frontend/public/design-system/contagest-semantic-tokens-v1.css', import.meta.url), 'utf8');

function mediaBlock(source, declaration) {
  const start = source.indexOf(declaration);
  assert.notEqual(start, -1, `missing media query ${declaration}`);
  const open = source.indexOf('{', start);
  assert.notEqual(open, -1);
  let depth = 1;
  for (let i = open + 1; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') depth -= 1;
    if (depth === 0) return source.slice(open + 1, i);
  }
  assert.fail(`unbalanced media query: ${declaration}`);
}

test('#773 touch target remains token-owned, mobile/coarse-only, excludes non-text inputs', () => {
  const cssBlock = mediaBlock(css, '@media (max-width: 760px) and (pointer: coarse)');
  assert.match(tokens, /--cg-v-control-touch:\s*44px;/);
  assert.match(cssBlock, /min-height:\s*var\(--cg-v-control-touch\)/);
  for (const type of ['checkbox', 'radio', 'range', 'hidden']) {
    assert.ok(cssBlock.includes(`:not([type="${type}"])`), `${type} must not be stretched`);
  }
  assert.match(cssBlock, /\bselect\b/);
  assert.match(cssBlock, /\btextarea\b/);
  assert.doesNotMatch(cssBlock, /!important/);
  assert.doesNotMatch(cssBlock, /min-width/);
});

test('#773 OS forced-colors keeps visible focus, no hardcoded brand or cloned palette', () => {
  const media = mediaBlock(css, '@media (forced-colors: active)');
  assert.match(media, /:focus-visible/);
  assert.match(media, /outline-color:\s*Highlight/);
  assert.match(css, /outline:\s*2px solid var\(--cg-v-focus\)/);
  assert.doesNotMatch(media, /#[a-f\d]{3,8}\b|rgba?\s*\(/i);
  assert.doesNotMatch(media, /!important/);
  assert.match(tokens, /html\[data-theme="dark"\]/);
  assert.match(tokens, /--cg-v-focus:/);
  assert.match(tokens, /--cg-v-control-touch:/);
});

test('#773 keeps one behavior adapter, reduced motion and prior mobile button targets', () => {
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /@media \(max-width:\s*760px\)/);
  assert.match(css, /:where\(button,a\[href\],\[role="button"\]/);
  assert.doesNotMatch(css, /@import|url\(https?:|font-face|background-image/i);
});
