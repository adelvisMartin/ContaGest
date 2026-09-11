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

test('runtime groupItems follows the same first-group fallback contract', () => {
  assert.match(appSource, /function groupItems\(items, groupId = activeGroupId\(\)\) \{ const fallbackGroupId = groupList\(\)\[0\]\?\.id \|\| "group-1"; return \(items \|\| \[\]\)\.filter\(\(item\) => String\(item\?\.groupId \|\| fallbackGroupId\) === String\(groupId\)\); \}/);
});

test('advanced loading is scoped to active group and emits fully tagged records', () => {
  assert.match(appSource, /const bets = groupItems\(workspace\.advancedBets\)\.filter\(\(b\) => b\.status === "staged"/);
  assert.match(appSource, /let race = groupItems\(workspace\.races\)\.find\(\(r\) => r\.date === date/);
  assert.match(appSource, /const day = groupItems\(workspace\.days\)\.find\(\(d\) => d\.date === date\) \|\| \{ id: uid\("day"\), groupId: activeGroupId\(\), date, status: "open", closure: null \}/);
  assert.match(appSource, /id: uid\("bet"\), groupId: activeGroupId\(\), play: b\.play/);
});

test('daily and weekly close never create or update records in another group', () => {
  assert.match(appSource, /workspace\.days\.push\(\{ id: uid\("day"\), groupId: activeGroupId\(\), date: today\(\), status: "open", closure: null \}\)/);
  assert.match(appSource, /groupItems\(workspace\.participants\)\.forEach\(\(p\) => p\.previousWeekBalance = balanceAt\(p\.id\)\)/);
  assert.doesNotMatch(appSource, /workspace\.participants\.forEach\(\(p\) => p\.previousWeekBalance = balanceAt\(p\.id\)\)/);
});
