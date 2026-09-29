import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (path) => readFileSync(join(process.cwd(), path), 'utf8');
const ui = read('frontend/public/hipico-control/assets/js/ui.js');
const dialog = read('frontend/public/hipico-control/assets/js/dialog-accessibility.js');
const notice = read('frontend/public/hipico-control/assets/js/notice-bridge.js');
const css = read('frontend/public/hipico-control/assets/css/ui-system-v4-convergence.css');

test('dialog-accessibility is the only dialog lifecycle authority', () => {
  assert.match(dialog, /dialog\[open\]/);
  assert.match(dialog, /\[data-ops-close\]/);
  assert.match(dialog, /setBackgroundInert/);
  assert.match(dialog, /trapTab/);
  assert.match(dialog, /returnFocus/);
  assert.doesNotMatch(ui, /let activeDialog/);
  assert.doesNotMatch(ui, /function enhanceDialogs/);
  assert.doesNotMatch(ui, /function focusableNodes/);
});

test('toast feedback stays in canonical ui authority without parallel dependency', () => {
  assert.match(ui, /export function toast/);
  assert.match(notice, /import \{ toast \} from '\.\/ui\.js'/);
  assert.doesNotMatch(ui + notice, /react-hot-toast|sonner|notistack/i);
  assert.match(css, /\.toast\s*\{/);
  assert.match(css, /\.toast--success/);
  assert.match(css, /\.toast--error/);
});

test('native and legacy dialogs share Escape, focus trap and background inert semantics', () => {
  assert.match(dialog, /DIALOG_SELECTOR/);
  assert.match(dialog, /closeActiveDialog/);
  assert.match(dialog, /event\.key === 'Escape'/);
  assert.match(dialog, /event\.key === 'Tab'/);
  assert.match(dialog, /shell\.inert = true/);
});
