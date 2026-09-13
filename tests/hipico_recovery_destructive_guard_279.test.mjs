import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const script = await readFile(new URL('../frontend/public/hipico-control/assets/js/recovery.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../frontend/public/hipico-control/recovery.html', import.meta.url), 'utf8');

function executeRecovery(confirmResult, { throwDelete = false } = {}) {
  let clickHandler = null;
  const removedKeys = [];
  const deletedDatabases = [];
  const replacements = [];
  const timers = [];
  const deleteRequest = {};
  const status = { textContent: '' };
  const reset = {
    disabled: false,
    addEventListener(type, handler) {
      if (type === 'click') clickHandler = handler;
    }
  };
  const context = {
    document: {
      getElementById(id) {
        return id === 'status' ? status : id === 'reset' ? reset : null;
      }
    },
    window: { confirm: () => confirmResult },
    location: { replace(value) { replacements.push(value); } },
    localStorage: { removeItem(key) { removedKeys.push(key); } },
    indexedDB: {
      deleteDatabase(name) {
        deletedDatabases.push(name);
        if (throwDelete) throw new Error('delete unavailable');
        return deleteRequest;
      }
    },
    setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; },
    clearTimeout() {}
  };
  vm.runInNewContext(script, context, { filename: 'recovery.js' });
  assert.equal(typeof clickHandler, 'function');
  clickHandler();
  return { removedKeys, deletedDatabases, replacements, timers, deleteRequest, status, reset };
}

test('recovery copy clearly warns about local data loss before the destructive action', () => {
  assert.match(html, /elimina el workspace, copias locales, cola pendiente y acceso offline/i);
  assert.match(html, /cambios locales que todavía no se hayan sincronizado no podrán recuperarse/i);
  assert.match(html, /button--danger/);
  assert.match(html, /Borrar datos locales y abrir/);
});

test('cancelling recovery leaves localStorage and IndexedDB untouched', () => {
  const result = executeRecovery(false);
  assert.deepEqual(result.removedKeys, []);
  assert.deepEqual(result.deletedDatabases, []);
  assert.match(result.status.textContent, /cancelada/i);
  assert.equal(result.reset.disabled, false);
});

test('confirmed recovery commits localStorage cleanup only after IndexedDB deletion succeeds', () => {
  const result = executeRecovery(true);
  assert.deepEqual(result.deletedDatabases, ['hipico-control']);
  assert.deepEqual(result.removedKeys, [], 'localStorage must remain intact while IndexedDB deletion is unresolved');
  assert.equal(result.reset.disabled, true);
  assert.equal(typeof result.deleteRequest.onsuccess, 'function');
  result.deleteRequest.onsuccess();
  assert.deepEqual(result.removedKeys, [
    'hipico-control-workspace-v1',
    'hipico-control-cloud-session',
    'hipico-control-mode'
  ]);
  assert.match(result.status.textContent, /restablecido/i);
  assert.equal(result.timers.some(({ delay }) => delay <= 500), true);
});

test('blocked IndexedDB deletion remains pending and completes cleanup after the blocker closes', () => {
  const result = executeRecovery(true);
  assert.equal(typeof result.deleteRequest.onblocked, 'function');
  result.deleteRequest.onblocked();
  assert.equal(result.reset.disabled, true, 'blocked deletion is still pending and must not start a duplicate request');
  assert.match(result.status.textContent, /cierra otras pestañas|bloquead|ocupado/i);
  assert.deepEqual(result.removedKeys, []);
  assert.deepEqual(result.replacements, []);
  assert.equal(result.timers.some(({ delay }) => delay <= 500), false, 'blocked deletion must not navigate before success');

  result.deleteRequest.onsuccess();
  assert.deepEqual(result.removedKeys, [
    'hipico-control-workspace-v1',
    'hipico-control-cloud-session',
    'hipico-control-mode'
  ], 'pending deletion must finish the local cleanup when success eventually fires');
  assert.match(result.status.textContent, /restablecido/i);
  assert.equal(result.timers.some(({ delay }) => delay <= 500), true);
});

test('IndexedDB deletion error keeps all remaining local data and offers an actionable retry', () => {
  const result = executeRecovery(true);
  assert.equal(typeof result.deleteRequest.onerror, 'function');
  result.deleteRequest.onerror();
  assert.equal(result.reset.disabled, false);
  assert.match(result.status.textContent, /no se pudo|reintenta/i);
  assert.deepEqual(result.removedKeys, []);
  assert.deepEqual(result.replacements, []);
  assert.equal(result.timers.some(({ delay }) => delay <= 500), false, 'failed deletion must not navigate into a possibly unrecovered app');
});

test('synchronous IndexedDB failure also stays on recovery and preserves localStorage', () => {
  const result = executeRecovery(true, { throwDelete: true });
  assert.equal(result.reset.disabled, false);
  assert.match(result.status.textContent, /no se pudo|reintenta/i);
  assert.deepEqual(result.removedKeys, []);
  assert.deepEqual(result.replacements, []);
});
