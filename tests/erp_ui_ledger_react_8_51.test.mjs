import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { PAGE_REGISTRY } from '../frontend/src/data/pageRegistry.js';

const read=(path)=>fs.readFileSync(path,'utf8');

test('8/51 ledger route points to React Cg/MUI renderer',()=>{
  assert.deepEqual(PAGE_REGISTRY.contabilidad,['./pages/LedgerPage.jsx','LedgerPage']);
  assert.equal(fs.existsSync('frontend/src/pages/LedgerPage.js'),false);
});

test('8/51 ledger owns one React root without imperative render lifecycle',()=>{
  const source=read('frontend/src/pages/LedgerPage.jsx');
  assert.equal((source.match(/createRoot\(/g)||[]).length,1);
  for(const token of ['CgProvider','CgPageHeader','CgButton','CgTextField','CgSelect','CgStatusChip','CgDataTable','CgMoney','CgState'])assert.ok(source.includes(token),token);
  assert.doesNotMatch(source,/components\/ui\/index\.js|mountSubmit|querySelector|addEventListener|innerHTML/);
});

test('8/51 preserves balanced-document persistence and local audit fallback',()=>{
  const source=read('frontend/src/pages/LedgerPage.jsx');
  for(const token of ['calculateLedger(','SupabaseSyncService.pullLedger(','SupabaseSyncService.createLedgerEntry(lineA)','SupabaseSyncService.createLedgerEntry(lineB)',"uid('entry')","uid('log')",'create-balanced-document-local'])assert.ok(source.includes(token),token);
  assert.match(source,/account===form\.counterAccount|form\.account===form\.counterAccount/);
});

test('8/51 preserves CSV and printable book outputs',()=>{
  const source=read('frontend/src/pages/LedgerPage.jsx');
  assert.match(source,/csvFromEntries/);
  assert.match(source,/htmlBook/);
  assert.match(source,/downloadText/);
  assert.match(source,/window\.open/);
});

test('8/51 ledger audit fails closed on legacy lifecycle',()=>{
  const audit=read('scripts/erp-ui-ledger-audit-v851.mjs');
  assert.match(audit,/imperative ledger lifecycle/i);
  assert.match(audit,/exactly one React root/i);
});
