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


test('1000 varied multigroup workspaces enforce canonical legacy scope without mutation', () => {
  for (let i=0;i<1000;i++) {
    const groupCount = 2 + (i % 7);
    const groups = Array.from({length:groupCount},(_,j)=>({id:'g-'+i+'-'+j}));
    const selectedIndex=(i*7+Math.floor(i/7))%groupCount;
    const selectedId=groups[selectedIndex].id;
    const config=i%3===0?{whatsappGroups:groups,activeWhatsappGroupId:selectedId}:i%3===1?{groups,activeGroupId:selectedId}:{groups,activeWhatsappGroupId:selectedId};
    const workspace={config};
    const rows=[{id:'legacy-'+i},{id:'null-'+i,groupId:null},{id:'blank-'+i,groupId:''},...groups.map((g,j)=>({id:'owned-'+i+'-'+j,groupId:g.id})),{id:'orphan-'+i,groupId:'not-known-'+i}];
    const old=structuredClone(rows);
    const byGroup=groups.map(g=>scopeItems(workspace,rows,g.id));
    for(let j=0;j<groupCount;j++){
      const ids=byGroup[j].map(x=>x.id);
      assert.ok(ids.includes('owned-'+i+'-'+j));
      assert.equal(ids.includes('orphan-'+i),false);
      for(let k=0;k<groupCount;k++)if(k!==j)assert.equal(ids.includes('owned-'+i+'-'+k),false);
      for(const prefix of ['legacy','null','blank'])assert.equal(ids.includes(prefix+'-'+i),j===0);
    }
    assert.deepEqual(scopeItems(workspace,rows).map(x=>x.id),byGroup[selectedIndex].map(x=>x.id));
    assert.deepEqual(rows,old);
  }
});

test('history mobile and desktop reuse one scoped participant index per render', () => {
  const start = app.indexOf('function renderHistory()');
  const end = app.indexOf('function renderReports()');
  assert.ok(start >= 0 && end > start, 'live history function must exist');
  const history = app.slice(start, end);
  assert.match(history, /const participantsById = pMap\(\)/);
  assert.equal((history.match(/pMap\(\)/g)||[]).length,1);
  assert.equal((history.match(/pCode\(r\.participantId, participantsById\)/g)||[]).length,2);
  assert.match(app, /function pCode\(id, participantsById = pMap\(\)\) \{ return participantsById\.get\(id\)\?\.code \|\| ""; \}/);
});

test('fresh participant index after group switch prevents same-ID label leakage',()=>{
  const ws={config:{groups:[{id:'g-a'},{id:'g-b'}],activeGroupId:'g-a'},participants:[{id:'same',groupId:'g-a',code:'A'},{id:'same',groupId:'g-b',code:'B'},{id:'legacy',code:'OLD'}]};
  const index=()=>new Map(scopeItems(ws,ws.participants).map(p=>[p.id,p]));
  assert.equal(index().get('same')?.code,'A');
  assert.equal(index().get('legacy')?.code,'OLD');
  ws.config.activeGroupId='g-b';
  assert.equal(index().get('same')?.code,'B');
  assert.equal(index().has('legacy'),false);
});


test('PWA rotates its atomic offline cache when the scoped UI changes', () => {
  const sw = readFileSync(new URL('../frontend/public/hipico-control/sw.js', import.meta.url), 'utf8');
  const index = readFileSync(new URL('../frontend/public/hipico-control/index.html', import.meta.url), 'utf8');
  const cacheDeclaration = sw.split('\n').find(line => line.startsWith('const SHELL_CACHE = ')) || '';
  const revision = /shell-r(\d+)-consolidator-v4-1-3/.exec(cacheDeclaration);
  assert.ok(revision && Number(revision[1]) >= 40, 'this security fix must supersede cached r39 app.js');
  assert.match(index, /src="\.\/assets\/js\/app\.js"/);
  for (const file of ['app.js', 'operational-ledger.js', 'pwa-update.js']) {
    assert.ok(sw.includes("'./assets/js/" + file + "'"), file + ' must be prefetched for offline launch');
  }
  assert.match(sw, /key !== SHELL_CACHE\)\.map\(\(key\) => caches\.delete\(key\)\)/);
  assert.match(sw, /await self\.skipWaiting\(\)/);
  assert.match(sw, /await self\.clients\.claim\(\)/);
  assert.doesNotMatch(sw, /indexedDB\.deleteDatabase|localStorage\.clear|sessionStorage\.clear/);
});
