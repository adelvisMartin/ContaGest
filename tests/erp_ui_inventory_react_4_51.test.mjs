import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PAGE_REGISTRY } from '../frontend/src/data/pageRegistry.js';

const read=(path)=>fs.readFileSync(path,'utf8');

test('4/51 inventory route points to the React Cg/MUI renderer',()=>{
  assert.deepEqual(PAGE_REGISTRY.inventario,['./pages/InventoryPage.jsx','InventoryPage']);
  assert.equal(fs.existsSync('frontend/src/pages/InventoryPage.js'),false);
});

test('4/51 inventory owns one React root and no imperative legacy lifecycle',()=>{
  const source=read('frontend/src/pages/InventoryPage.jsx');
  assert.equal((source.match(/createRoot\(/g)||[]).length,1);
  for(const primitive of ['CgProvider','CgPageHeader','CgButton','CgTextField','CgSelect','CgStatusChip','CgDataTable','CgDialog','CgMoney'])assert.ok(source.includes(primitive),primitive);
  assert.doesNotMatch(source,/components\/ui\/index\.js|escapeHtml|mountSubmit|querySelector|addEventListener|innerHTML|window\.prompt/);
});

test('4/51 inventory preserves stock sync adjustment reversal and quote contracts',()=>{
  const source=read('frontend/src/pages/InventoryPage.jsx');
  for(const token of [
    'calculateInventory(','RuntimePolicy.handlePersistenceFailure(','SupabaseSyncService.pullProducts(',
    'SupabaseSyncService.createProduct(','InventoryService.createMovement(','InventoryService.adjust(','InventoryService.reverse(',
    "navigate('cotizacion')"
  ]) assert.ok(source.includes(token),token);
  assert.match(source,/quantityExact\?\?/);
  assert.match(source,/reversedById/);
  assert.match(source,/reasonCode/);
});

test('4/51 inventory source audit fails closed on legacy renderer regression',()=>{
  const audit=read('scripts/erp-ui-inventory-audit-v451.mjs');
  assert.match(audit,/InventoryPage\.jsx/);
  assert.match(audit,/InventoryPage\.js/);
  assert.match(audit,/imperative inventory lifecycle/i);
  assert.match(audit,/exactly one React root/i);
});
