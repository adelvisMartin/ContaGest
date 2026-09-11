import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const guard = readFileSync(new URL('../frontend/public/hipico-control/assets/js/dialog-accessibility.js', import.meta.url), 'utf8');
const index = readFileSync(new URL('../frontend/public/hipico-control/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../frontend/public/hipico-control/assets/js/app.js', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../frontend/public/hipico-control/sw.js', import.meta.url), 'utf8');

test('all application modal surfaces expose modal dialog semantics', () => {
  assert.match(app, /class="modal modern-modal" role="dialog" aria-modal="true"/);
  assert.match(app, /class="calendar-card" role="dialog" aria-modal="true"/);
});

test('dialog guard provides initial focus, Escape close, tab trap and focus restoration', () => {
  assert.match(guard, /DIALOG_SELECTOR\s*=\s*'\[role="dialog"\]\[aria-modal="true"\]'/);
  assert.match(guard, /target\.focus\(\{ preventScroll: true \}\)/);
  assert.match(guard, /event\.key === 'Escape'/);
  assert.match(guard, /event\.key === 'Tab'/);
  assert.match(guard, /event\.shiftKey/);
  assert.match(guard, /returnFocus/);
  assert.match(guard, /target\?\.isConnected/);
});

test('dialog replacement preserves the original launcher instead of replacing return focus',()=>{
  assert.match(guard,/if \(!returnFocus && document\.activeElement instanceof HTMLElement\) returnFocus = document\.activeElement/);
  assert.doesNotMatch(guard,/if \(!activeDialog\) returnFocus = document\.activeElement/);
  assert.match(guard,/if \(activeDialog && !activeDialog\.isConnected\) activeDialog = null/);
});

test('dialog guard makes the background inert, labels it and restores prior shell accessibility state', () => {
  assert.match(guard, /shell\.inert = true/);
  assert.match(guard, /shellPreviousAriaHidden = shell\.getAttribute\('aria-hidden'\)/);
  assert.match(guard, /shellPreviousAriaHidden == null/);
  assert.match(guard, /shell\.setAttribute\('aria-hidden', shellPreviousAriaHidden\)/);
  assert.match(guard, /aria-labelledby/);
  assert.match(guard, /hipico-dialog-title-/);
});

test('dialog accessibility is loaded before overlay-producing modules and available offline', () => {
  const guardIndex = index.indexOf('dialog-accessibility.js');
  const appIndex = index.indexOf('assets/js/app.js');
  const raceGuardIndex=index.indexOf('race-context-guard.js');
  assert.ok(guardIndex >= 0 && raceGuardIndex > guardIndex && appIndex > guardIndex);
  assert.match(sw, /dialog-accessibility\.js/);
});
