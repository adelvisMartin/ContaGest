import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const guard = await readFile(new URL('../frontend/public/hipico-control/assets/js/dialog-accessibility.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../frontend/public/hipico-control/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../frontend/public/hipico-control/assets/js/app.js', import.meta.url), 'utf8');
const sw = await readFile(new URL('../frontend/public/hipico-control/sw.js', import.meta.url), 'utf8');

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

test('dialog guard makes the background inert, labels it and restores prior shell accessibility state', () => {
  assert.match(guard, /shell\.inert = true/);
  assert.match(guard, /shellPreviousAriaHidden = shell\.getAttribute\('aria-hidden'\)/);
  assert.match(guard, /shellPreviousAriaHidden == null/);
  assert.match(guard, /shell\.setAttribute\('aria-hidden', shellPreviousAriaHidden\)/);
  assert.match(guard, /h1,h2,h3,h4,\[data-dialog-title\],header strong/);
  assert.match(guard, /aria-labelledby/);
  assert.match(guard, /crypto\.randomUUID\(\)/);
});

test('dynamic icon-only actions receive stable accessible names without overwriting visible labels', () => {
  assert.match(app, /data-action="calendar-prev"/);
  assert.match(app, /data-action="calendar-next"/);
  assert.match(app, /class="button icon-button button--primary" data-action="focus-fast">/);
  assert.match(guard, /'calendar-prev': 'Mes anterior'/);
  assert.match(guard, /'calendar-next': 'Mes siguiente'/);
  assert.match(guard, /'focus-fast': 'Captura rápida'/);
  assert.match(guard, /!hasAccessibleName\(element\)/);
  assert.match(guard, /element\.setAttribute\('aria-label', label\)/);
  assert.match(guard, /ensureActionLabels\(document\)/);
});

test('dialog replacement clears stale active reference before activating the next overlay', () => {
  assert.match(guard, /const nextDialog = document\.querySelector\(DIALOG_SELECTOR\);\s*activeDialog = null;/s);
  assert.match(guard, /if \(nextDialog instanceof HTMLElement\) \{\s*activate\(nextDialog\);/s);
  assert.match(guard, /current === last \|\| !activeDialog\.contains\(current\)/);
});

test('dialog accessibility is loaded before the main app and available offline', () => {
  const guardIndex = index.indexOf('dialog-accessibility.js');
  const appIndex = index.indexOf('assets/js/app.js');
  assert.ok(guardIndex >= 0 && appIndex > guardIndex);
  assert.match(sw, /dialog-accessibility\.js/);
});
