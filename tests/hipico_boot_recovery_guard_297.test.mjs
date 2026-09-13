import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const compat=readFileSync(new URL('../frontend/public/hipico-control/assets/js/compat.js',import.meta.url),'utf8');
const recovery=readFileSync(new URL('../frontend/public/hipico-control/assets/js/recovery.js',import.meta.url),'utf8');
const recoveryHtml=readFileSync(new URL('../frontend/public/hipico-control/recovery.html',import.meta.url),'utf8');

test('boot failure recovery link never deletes offline data before the dedicated recovery surface',()=>{
  assert.match(compat,/id="hipico-safe"/);
  assert.match(compat,/location\.replace\("\.\/recovery\.html"\)/);
  assert.match(compat,/Tus datos locales no se borrarán al abrir la recuperación/);
  assert.doesNotMatch(compat,/indexedDB\.deleteDatabase/);
  assert.doesNotMatch(compat,/localStorage\?*\.removeItem/);
  assert.doesNotMatch(compat,/clearHipicoLegacyStorage|LEGACY_KEYS/);
});

test('destructive recovery remains isolated behind explicit recovery-page confirmation and warning',()=>{
  assert.match(recovery,/window\.confirm/);
  assert.match(recovery,/indexedDB\.deleteDatabase\(['"]hipico-control['"]\)/);
  assert.match(recoveryHtml,/Borrar datos locales y abrir/);
  assert.match(recoveryHtml,/cambios locales que todavía no se hayan sincronizado no podrán recuperarse/i);
});
