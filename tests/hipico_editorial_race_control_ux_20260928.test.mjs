import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css=fs.readFileSync('frontend/public/hipico-control/assets/css/app.css','utf8');
const ui=fs.readFileSync('frontend/public/hipico-control/assets/js/ui.js','utf8');
const sw=fs.readFileSync('frontend/public/hipico-control/sw.js','utf8');

test('Control Hipico dark surfaces are neutral instead of green-cast',()=>{
  assert.match(css,/--hc-bg:\s*#121212;/);
  assert.match(css,/--hc-surface:\s*#191919;/);
  assert.match(css,/--hc-surface-subtle:\s*#232323;/);
  assert.doesNotMatch(css,/--hc-bg:\s*#111312;/);
  assert.doesNotMatch(css,/--hc-surface:\s*#191c1a;/);
});

test('canonical UI owns custom select/listbox styling and behavior',()=>{
  for(const token of ['.select-shell','.select-trigger','.select-popover','.select-option']) assert.ok(css.includes(token),`missing ${token}`);
  assert.ok(ui.includes('enhanceSelects'),'ui.js must enhance native selects');
  assert.ok(ui.includes('role="listbox"'),'custom popup must expose listbox semantics');
  assert.ok(ui.includes('aria-haspopup="listbox"'),'custom trigger must expose popup semantics');
  assert.ok(ui.includes("dispatchEvent(new Event('change', { bubbles: true }))"),'native select change contract must be preserved');
});

test('history filters and more navigation use compact editorial geometry',()=>{
  assert.match(css,/\.date-button\s*\{[^}]*white-space:\s*nowrap;/s);
  assert.match(css,/\.filter-grid\s*\{[^}]*align-items:\s*end;/s);
  assert.match(css,/\.more-dashboard\s*\{[^}]*border:\s*1px solid var\(--hc-border\)/s);
  assert.match(css,/\.more-dashboard\s+>\s+button/s);
});

test('race switcher exposes a quick change-race affordance without changing app contracts',()=>{
  assert.ok(ui.includes('enhanceRaceSwitcher'),'race add affordance must be enhanced by canonical ui.js');
  assert.ok(ui.includes('Cambiar carrera'),'quick race action must be named for operators');
  assert.match(css,/\.race-arrow--add\s*\{[^}]*width:\s*auto;/s);
});

test('service worker cache is rotated for the editorial UI assets',()=>{
  assert.match(sw,/shell-r28-editorial-race-control/);
});
