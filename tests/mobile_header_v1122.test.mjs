import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const layout=readFileSync(new URL('../frontend/src/components/layout.js', import.meta.url),'utf8');
const compact=readFileSync(new URL('../frontend/src/styles/compact-enterprise-v1110.css', import.meta.url),'utf8');
const shell=readFileSync(new URL('../frontend/src/styles/shell-contract.css', import.meta.url),'utf8');

test('mobile header uses the same canonical ContaGest mark as the desktop shell',()=>{
  assert.match(layout,/contagest-mark\.svg/);
  assert.doesNotMatch(layout,/import logoUrl from ['"]\.\.\/\.\.\/assets\/img\/logo\.png/);
  assert.match(layout,/data-header-responsive="v11\.22"/);
});

test('mobile BCV markup separates the compact numeric amount from the desktop currency label',()=>{
  assert.match(layout,/id="tasaHeaderMobile" class="hf-rate-mobile"/);
  assert.match(layout,/rateMobile=compactRate\(state\.bcv\.rate\)/);
  assert.match(shell,/\.hf-rate-copy > strong > \.hf-rate-full[\s\S]*display:none !important/);
  assert.match(shell,/\.hf-rate-mobile[\s\S]*display:block !important/);
});

test('theme control renders one SVG glyph and suppresses legacy button pseudo glyphs',()=>{
  assert.match(layout,/const ThemeSvg =/);
  assert.match(layout,/id="btnTema"[\s\S]*\$\{ThemeSvg\(darkTheme\)\}<\/button>/);
  assert.doesNotMatch(layout,/id="btnTema"[\s\S]{0,220}<i class="fa-solid/);
  assert.match(shell,/#btnTema::before,[\s\S]*#btnTema::after[\s\S]*content:none !important/);
});

test('first-priority shell contract owns critical mobile geometry during legacy migration',()=>{
  assert.match(compact,/@layer cg\.shell-contract, cg\.context;/);
  assert.match(compact,/@import '\.\/shell-contract\.css' layer\(cg\.shell-contract\);/);
  assert.match(shell,/\.hf-app-topbar\.hf-topbar[\s\S]*display:flex !important[\s\S]*flex-flow:row nowrap !important/);
  assert.match(shell,/#btnCommandPalette\.hf-command-trigger[\s\S]*position:static !important/);
  assert.match(shell,/#btnActualizarTasaTop,[\s\S]*\.hf-rate-update \{ display:none !important; \}/);
});
