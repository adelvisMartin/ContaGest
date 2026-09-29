import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cycleTheme,
  getSidebarCollapsed,
  getThemePreference,
  hasStoredTheme,
  migrateLegacyTheme,
  normalizeTheme,
  PRESENTATION_THEMES,
  setSidebarCollapsed,
  setThemePreference
} from '../frontend/public/hipico-control/assets/js/presentation-preferences.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    snapshot() { return Object.fromEntries(values); }
  };
}

test('theme contract is exactly system light dark', () => {
  assert.deepEqual(PRESENTATION_THEMES, ['system', 'light', 'dark']);
  assert.equal(normalizeTheme('LIGHT'), 'light');
  assert.equal(normalizeTheme('dark'), 'dark');
  assert.equal(normalizeTheme('unexpected'), 'system');
});

test('stored theme is device-local and normalized', () => {
  const storage = memoryStorage();
  assert.equal(hasStoredTheme(storage), false);
  assert.equal(getThemePreference(storage), 'system');
  assert.equal(setThemePreference('dark', storage), 'dark');
  assert.equal(hasStoredTheme(storage), true);
  assert.equal(getThemePreference(storage), 'dark');
  assert.equal(storage.snapshot()['hipico-control-theme'], 'dark');
});

test('legacy workspace theme migrates only when device preference is absent', () => {
  const fresh = memoryStorage();
  assert.equal(migrateLegacyTheme('dark', fresh), 'dark');
  assert.equal(getThemePreference(fresh), 'dark');

  const existing = memoryStorage({ 'hipico-control-theme': 'light' });
  assert.equal(migrateLegacyTheme('dark', existing), 'light');
  assert.equal(getThemePreference(existing), 'light');
});

test('invalid legacy theme safely recovers to system', () => {
  const storage = memoryStorage();
  assert.equal(migrateLegacyTheme('burgundy', storage), 'system');
  assert.equal(getThemePreference(storage), 'system');
});

test('theme cycle exposes all three supported presentation modes', () => {
  assert.equal(cycleTheme('system'), 'light');
  assert.equal(cycleTheme('light'), 'dark');
  assert.equal(cycleTheme('dark'), 'system');
});

test('sidebar collapsed state persists as a local boolean', () => {
  const storage = memoryStorage();
  assert.equal(getSidebarCollapsed(storage), false);
  assert.equal(setSidebarCollapsed(true, storage), true);
  assert.equal(getSidebarCollapsed(storage), true);
  assert.equal(storage.snapshot()['hipico-control-sidebar-collapsed'], '1');
  assert.equal(setSidebarCollapsed(false, storage), false);
  assert.equal(getSidebarCollapsed(storage), false);
});
