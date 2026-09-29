import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sourcePath = join(process.cwd(), 'frontend/public/hipico-control/assets/js/presentation-preferences.js');

function source() {
  try { return readFileSync(sourcePath, 'utf8'); }
  catch { return ''; }
}

test('presentation preferences export theme and sidebar APIs', () => {
  const text = source();
  for (const name of ['getThemePreference', 'setThemePreference', 'migrateLegacyTheme', 'getSidebarCollapsed', 'setSidebarCollapsed']) {
    assert.match(text, new RegExp(`export\\s+function\\s+${name}`));
  }
});

test('theme contract is limited to system light dark and local storage key', () => {
  const text = source();
  assert.match(text, /hipico-control-theme/);
  assert.match(text, /new Set\(\['system', 'light', 'dark'\]\)/);
  assert.match(text, /hipico-control-sidebar-collapsed/);
});

test('legacy theme migration is one-way and never writes workspace state', () => {
  const text = source();
  assert.match(text, /migrateLegacyTheme/);
  assert.doesNotMatch(text, /workspace\.config\.theme\s*=/);
  assert.match(text, /localStorage/);
});
