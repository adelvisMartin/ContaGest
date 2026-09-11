import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scopeItems } from '../frontend/public/hipico-control/assets/js/operational-ledger.js';

const appSource = readFileSync(new URL('../frontend/public/hipico-control/assets/js/app.js', import.meta.url), 'utf8');

test('legacy groupless records belong only to the first group', () => {
  const workspace = { config: { groups: [{ id: 'g1' }, { id: 'g2' }] } };
  const rows = [{ id: 'legacy' }, { id: 'one', groupId: 'g1' }, { id: 'two', groupId: 'g2' }];
  assert.deepEqual(scopeItems(workspace, rows, 'g1').map((row) => row.id), ['legacy', 'one']);
  assert.deepEqual(scopeItems(workspace, rows, 'g2').map((row) => row.id), ['two']);
});

test('runtime groupItems delegates to the canonical first-group fallback ledger', () => {
  assert.match(appSource, /import \{ scopeItems as scopeLedgerItems \} from "\.\/operational-ledger\.js";/);
  assert.match(appSource, /function groupItems\(items, groupId = activeGroupId\(\)\) \{ return scopeLedgerItems\(workspace, items, groupId\); \}/);
  assert.doesNotMatch(appSource, /function groupItems[\s\S]{0,220}!item\.groupId\s*\|\|\s*item\.groupId\s*===\s*groupId/);
});

test('advanced loading is scoped to active group and emits fully tagged records', () => {
  assert.match(appSource, /function loadAdvancedGroup\(key\) \{[\s\S]*?const groupId = activeGroupId\(\);/);
  assert.match(appSource, /groupItems\(workspace\.advancedBets, groupId\)\.filter\(\(b\) => b\.status === "staged"/);
  assert.match(appSource, /groupItems\(workspace\.races, groupId\)\.find\(\(r\) => r\.date === date/);
  assert.match(appSource, /groupItems\(workspace\.days, groupId\)\.find\(\(d\) => d\.date === date && d\.status === "open"\)/);
  assert.match(appSource, /const loaded = bets\.map\(\(b\) => \(\{ id: uid\("bet"\), groupId,/);
});

test('daily and weekly close never create or update records in another group', () => {
  assert.match(appSource, /function closeDay\(\)[\s\S]*?const groupId = activeGroupId\(\);/);
  assert.match(appSource, /workspace\.days\.push\(\{ id: uid\("day"\), groupId, date: today\(\), status: "open", closure: null/);
  assert.match(appSource, /groupItems\(workspace\.participants\)\.forEach\(\(p\) => p\.previousWeekBalance = balanceAt\(p\.id\)\)/);
  assert.doesNotMatch(appSource, /workspace\.participants\.forEach\(\(p\) => p\.previousWeekBalance = balanceAt\(p\.id\)\)/);
});
