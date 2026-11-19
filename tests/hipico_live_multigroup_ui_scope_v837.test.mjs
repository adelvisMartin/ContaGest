import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scopeItems } from '../frontend/public/hipico-control/assets/js/operational-ledger.js';

const app = readFileSync(new URL('../frontend/public/hipico-control/assets/js/app.js', import.meta.url), 'utf8');

test('loaded Hípico UI consumes canonical scoped rows, not cross-group legacy wildcard', () => {
  assert.match(app, /import \{ scopeItems as scopeGroupItems \} from ["']\.\/operational-ledger\.js["']/);
  assert.match(app, /function groupItems\(items, groupId = activeGroupId\(\)\) \{ return scopeGroupItems\(workspace, items, groupId\); \}/);
  assert.doesNotMatch(app, /!item\.groupId \|\| item\.groupId === groupId/);
});

test('1000 synthetic multigroup snapshots do not leak legacy rows into another group', () => {
  for (let i = 0; i < 1000; i += 1) {
    const first = `first-${i}`;
    const second = `second-${i}`;
    const third = `third-${i}`;
    const activeGroupId = i % 2 ? second : third;
    const workspace = {
      config: { groups: [{ id: first }, { id: second }, { id: third }], activeGroupId }
    };
    const entities = [
      { id: 'legacy' },
      { id: 'first', groupId: first },
      { id: 'second', groupId: second },
      { id: 'third', groupId: third }
    ];
    assert.deepEqual(scopeItems(workspace, entities, first).map(row => row.id), ['legacy', 'first']);
    assert.deepEqual(scopeItems(workspace, entities, second).map(row => row.id), ['second']);
    assert.deepEqual(scopeItems(workspace, entities, third).map(row => row.id), ['third']);
    assert.deepEqual(scopeItems(workspace, entities, 'unknown').map(row => row.id), []);
    assert.deepEqual(scopeItems(workspace, entities).map(row => row.id), [i % 2 ? 'second' : 'third']);
  }
});

test('legacy-only workspace remains readable in its original first group', () => {
  const workspace = { config: { whatsappGroups: [{ id: 'original' }, { id: 'new' }] } };
  assert.deepEqual(scopeItems(workspace, [{ id: 'older' }, { id: 'newer', groupId: 'new' }], 'original').map(row => row.id), ['older']);
  assert.deepEqual(scopeItems(workspace, [{ id: 'older' }, { id: 'newer', groupId: 'new' }], 'new').map(row => row.id), ['newer']);
  assert.deepEqual(scopeItems(workspace, null, 'new'), []);
});
