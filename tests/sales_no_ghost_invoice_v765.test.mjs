import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../frontend/src/pages/SalesPage.jsx', import.meta.url), 'utf8');
const from = source.indexOf('  async function submit(event){');
const to = source.indexOf('  function sendToQuote(sale){', from);
const submit = source.slice(from, to);

test('Sales page has one recognizable submit flow', () => {
  assert.ok(from > 0 && to > from);
  assert.equal((source.match(/async function submit\(event\)/g)||[]).length, 1);
});
test('no local ghost invoice or shadow audit on persistence failure', () => {
  assert.doesNotMatch(source, /create-sale-offline-fallback/);
  assert.doesNotMatch(submit, /source:\s*['"]local['"]/);
  assert.doesNotMatch(submit, /uid\('sale'\)|draft\.sales\.unshift\(local\)/);
  assert.doesNotMatch(submit, /RuntimePolicy\.handlePersistenceFailure|allowFallback/);
});
test('the double-submit guard covers the entire asynchronous submission', () => {
  assert.match(source, /saleSaveInFlight\s*=\s*useRef\(false\)/);
  assert.match(submit, /if \(saleSaveInFlight\.current\) return/);
  assert.match(submit, /saleSaveInFlight\.current = true/);
  assert.match(submit, /finally\s*\{\s*saleSaveInFlight\.current = false;/);
});
test('no local mutation occurs before server ID is validated', () => {
  const request = submit.indexOf('await SupabaseSyncService.createSale(payload)');
  const confirmed = submit.indexOf("typeof saved.id !== 'string'");
  const commit = submit.indexOf('Store.update(');
  assert.ok(request > -1 && confirmed > request && commit > confirmed);
});
test('ambiguous server failure keeps form and recommends reconciliation', () => {
  const failure = submit.slice(submit.lastIndexOf('}catch{'));
  assert.match(failure, /Consulta y sincroniza Ventas antes de intentar otra vez/);
  assert.match(failure, /se conservó el formulario/);
  assert.doesNotMatch(failure, /Store\.update|setSales\(|setForm\(/);
});
test('draft success never claims an accounting posting', () => {
  assert.match(submit, /form\.status==='Borrador'/);
  assert.match(submit, /Borrador confirmado por el servidor/);
  assert.doesNotMatch(submit, /Venta guardada y contabilizada/);
});
