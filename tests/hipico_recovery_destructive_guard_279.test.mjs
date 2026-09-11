import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const script = await readFile(new URL('../frontend/public/hipico-control/assets/js/recovery.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../frontend/public/hipico-control/recovery.html', import.meta.url), 'utf8');

function executeRecovery(confirmResult) {
  let clickHandler = null;
  const removedKeys = [];
  const deletedDatabases = [];
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
    location: { replace() {} },
    localStorage: { removeItem(key) { removedKeys.push(key); } },
    indexedDB: {
      deleteDatabase(name) {
        deletedDatabases.push(name);
        return {};
      }
    },
    setTimeout() {}
  };
  vm.runInNewContext(script, context, { filename: 'recovery.js' });
  assert.equal(typeof clickHandler, 'function');
  clickHandler();
  return { removedKeys, deletedDatabases, status, reset };
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

test('confirmed recovery reaches destructive storage cleanup only after confirmation', () => {
  const result = executeRecovery(true);
  assert.deepEqual(result.removedKeys, [
    'hipico-control-workspace-v1',
    'hipico-control-cloud-session',
    'hipico-control-mode'
  ]);
  assert.deepEqual(result.deletedDatabases, ['hipico-control']);
  assert.equal(result.reset.disabled, true);
});
