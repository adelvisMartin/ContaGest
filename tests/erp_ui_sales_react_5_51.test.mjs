import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PAGE_REGISTRY } from '../frontend/src/data/pageRegistry.js';

const read=(path)=>fs.readFileSync(path,'utf8');

test('5/51 sales route points to React Cg/MUI renderer',()=>{
  assert.deepEqual(PAGE_REGISTRY.ventas,['./pages/SalesPage.jsx','SalesPage']);
  assert.equal(fs.existsSync('frontend/src/pages/SalesPage.js'),false);
});

test('5/51 sales renderer owns one React root without imperative legacy lifecycle',()=>{
  const source=read('frontend/src/pages/SalesPage.jsx');
  assert.equal((source.match(/createRoot\(/g)||[]).length,1);
  for(const primitive of ['CgProvider','CgPageHeader','CgButton','CgTextField','CgSelect','CgStatusChip','CgDataTable','CgMoney','CgState'])assert.ok(source.includes(primitive),primitive);
  assert.doesNotMatch(source,/components\/ui\/index\.js|escapeHtml|mountSubmit|querySelector|addEventListener|innerHTML/);
});

test('5/51 sales requires server-confirmed persistence and preserves quote transfer',()=>{
  const source=read('frontend/src/pages/SalesPage.jsx');
  for(const token of [
    'SupabaseSyncService.pullSales(', 'SupabaseSyncService.createSale(',
    'SALES_SERVER_CONFIRMATION_MISSING', 'saleSaveInFlight.current',
    'saved.id', 'Venta no confirmada.', 'Consulta y sincroniza Ventas',
    "navigate('cotizacion')", 'draft.quote.manualAmount', 'draft.quote.observation'
  ]) assert.ok(source.includes(token),token);
  // A timeout may occur after the database commits. A generated client-side
  // sale/log ID or an automatic offline fallback would create a second effect.
  assert.doesNotMatch(source, /create-sale-offline-fallback|RuntimePolicy\.handlePersistenceFailure\(/);
  assert.doesNotMatch(source, /uid\(['"](?:sale|log)['"]\)/);
  const serverCall=source.indexOf('await SupabaseSyncService.createSale(payload)');
  const confirm=source.indexOf("throw new Error('SALES_SERVER_CONFIRMATION_MISSING')",serverCall);
  const update=source.indexOf('draft.sales=[saved,',serverCall);
  assert.ok(serverCall>=0 && confirm>serverCall && update>confirm,
    'UI must validate server receipt before mutating visible sales state');
});

test('5/51 sales source audit fails closed on imperative regression',()=>{
  const audit=read('scripts/erp-ui-sales-audit-v551.mjs');
  assert.match(audit,/SalesPage\.jsx/);
  assert.match(audit,/SalesPage\.js/);
  assert.match(audit,/imperative sales lifecycle/i);
  assert.match(audit,/exactly one React root/i);
});
