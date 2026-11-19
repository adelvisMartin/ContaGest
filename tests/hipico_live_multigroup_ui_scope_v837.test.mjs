import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { escapeHtml } from '../frontend/public/hipico-control/assets/js/ui.js';
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


test('movement rendering uses one owner-scoped index and escapes untrusted currency HTML', () => {
  const pCodeSource = app.split('\n').find(line => line.startsWith('function pCode('));
  const renderSource = app.split('\n').find(line => line.startsWith('function renderMovements()'));
  assert.ok(pCodeSource && renderSource, 'source functions must remain available in the live UI');
  assert.match(renderSource, /const participantsById = pMap\(\)/);
  assert.equal((renderSource.match(/pMap\(\)/g) || []).length, 1);
  assert.equal((renderSource.match(/pCode\(m\.(?:participantId|counterpartyId), participantsById\)/g) || []).length, 2);
  assert.match(renderSource, /escapeHtml\(m\.currency \|\| "VES"\)/);

  const workspace = {
    config: { groups: [{ id: 'group-A' }, { id: 'group-B' }], activeGroupId: 'group-B' },
    participants: [
      { id: 'shared', groupId: 'group-A', code: 'PRIVATE-A' },
      { id: 'shared', groupId: 'group-B', code: 'VISIBLE-B' },
      { id: 'other', groupId: 'group-B', code: 'COUNTERPART-B' }
    ],
    movements: [
      { id: 'mA', groupId: 'group-A', type: 'transfer', participantId: 'shared', amount: 99, currency: 'VES', note: 'only A', createdAt: '2026-11-19T12:00:00.000Z' },
      { id: 'legacy', type: 'transfer', participantId: 'shared', amount: 500, currency: 'VES', note: 'legacy A', createdAt: '2026-11-19T12:00:00.000Z' },
      { id: 'mB', groupId: 'group-B', type: 'transfer', participantId: 'shared', counterpartyId: 'other', amount: 12,
        currency: '<img src=x onerror=alert(1)>', note: 'sent to B', createdAt: '2026-11-19T12:01:00.000Z' }
    ]
  };
  let mapBuilds = 0;
  const context = {
    workspace,
    escapeHtml,
    groupItems(items) { return scopeItems(context.workspace, items); },
    pMap() {
      mapBuilds += 1;
      return new Map(scopeItems(context.workspace, context.workspace.participants).map(row => [row.id, row]));
    },
    number(value) { return String(value); },
    empty() { return 'NO_MOVEMENTS'; },
    Date
  };
  context.pCode = runInNewContext('(' + pCodeSource + ')', context);
  const renderMovements = runInNewContext('(' + renderSource + ')', context);

  const html = renderMovements();
  assert.equal(mapBuilds, 1, 'not once per movement or counterparty');
  assert.ok(html.includes('VISIBLE-B'));
  assert.ok(html.includes('COUNTERPART-B'));
  assert.ok(html.includes('sent to B'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'currency is text, not a node');
  assert.ok(!html.includes('<img'), 'untrusted currency must not create elements');
  assert.ok(!html.includes('PRIVATE-A') && !html.includes('only A') && !html.includes('legacy A'));
  context.workspace.config.activeGroupId = 'group-A';
  mapBuilds = 0;
  const groupAHtml = renderMovements();
  assert.equal(mapBuilds, 1, 'fresh index after group switch');
  assert.ok(groupAHtml.includes('PRIVATE-A') && groupAHtml.includes('legacy A'));
  assert.ok(!groupAHtml.includes('VISIBLE-B') && !groupAHtml.includes('COUNTERPART-B'));
});

test('1000 synthetic movements do not rebuild index for each rendered row', () => {
  const pCodeSource = app.split('\n').find(line => line.startsWith('function pCode('));
  const renderSource = app.split('\n').find(line => line.startsWith('function renderMovements()'));
  const workspace = {
    config: { groups: [{ id: 'A' }, { id: 'B' }], activeGroupId: 'B' },
    participants: Array.from({ length: 1000 }, (_, i) => ({ id: 'p-' + i, code: 'B-' + i, groupId: 'B' })),
    movements: Array.from({ length: 1000 }, (_, i) => ({
      id: 'm-' + i, groupId: 'B', type: 'transfer',
      participantId: 'p-' + i, amount: i + 1, currency: 'VES',
      createdAt: '2026-11-19T12:00:00.000Z'
    }))
  };
  let mapBuilds = 0;
  const context = {
    workspace, escapeHtml,
    groupItems(items) { return scopeItems(workspace, items); },
    pMap() { mapBuilds++; return new Map(scopeItems(workspace, workspace.participants).map(row => [row.id, row])); },
    number(value) { return String(value); },
    empty() { return 'NO_MOVEMENTS'; },
    Date
  };
  context.pCode = runInNewContext('(' + pCodeSource + ')', context);
  const renderMovements = runInNewContext('(' + renderSource + ')', context);
  const html = renderMovements();
  assert.equal(mapBuilds, 1, 'bounded one lookup index per render regardless of row count');
  assert.equal((html.match(/class="audit-row"/g) || []).length, 1000);
  assert.ok(html.includes('B-999') && html.includes('B-0'));
});


test('cancellation policy rejects settled, cancelled, missing and closed-race bets', () => {
  const source = app.split('\n').find(line => line.startsWith('function canCancelBet('));
  const cardSource = app.split('\n').find(line => line.startsWith('function betCard('));
  assert.ok(source && cardSource, 'shared state policy and UI card must exist in the active client');
  const canCancelBet = runInNewContext('(' + source + ')');
  const context = {
    canCancelBet,
    escapeHtml,
    number: value => String(value),
    money: value => String(value),
    activeCurrency: () => 'VES',
    pMap: () => { throw new Error('card should receive a scoped index'); }
  };
  const betCard = runInNewContext('(' + cardSource + ')', context);
  const index = new Map([['p', {code:'PLAYER'}]]);
  const statuses = ['open', 'locked', 'settled', 'closed', 'result', 'cancelled'];
  const betStatuses = ['pending', 'settled', 'cancelled', 'loaded'];
  for (const raceStatus of statuses) for (const betStatus of betStatuses) {
    const race = {status:raceStatus};
    const bet = {id:'bet-1',status:betStatus,play:'1P',horse:'3',amount:100,playerId:'p'};
    const expected = raceStatus === 'open' && betStatus === 'pending';
    assert.equal(canCancelBet(race, bet), expected, raceStatus + '/' + betStatus);
    const card = betCard(bet, race, index);
    assert.equal(card.includes('data-action="cancel-bet"'), expected, raceStatus + '/' + betStatus);
  }
  assert.equal(canCancelBet({status:'open'}, null), false);
  assert.equal(canCancelBet(null, {status:'pending'}), false);
  const handler = app.slice(app.indexOf('if (action === "cancel-bet")'), app.indexOf('if (action === "use-available")'));
  assert.match(handler, /if \(!canCancelBet\(r, b\)\) throw new Error\(/, 'handler validates state again, not only its rendered button');
  assert.ok(handler.indexOf('if (!canCancelBet(r, b))') < handler.indexOf('mutate("bet_cancelled"'), 'reject before recording an irreversible audit mutation');
});

test('1000 capture cards reuse one participant index without a per-card full scan', () => {
  const source = app.split('\n').find(line => line.startsWith('function canCancelBet('));
  const cardSource = app.split('\n').find(line => line.startsWith('function betCard('));
  const canCancelBet = runInNewContext('(' + source + ')');
  let individualMapRebuilds = 0;
  const context = {
    canCancelBet, escapeHtml,
    number: value => String(value),
    money: value => String(value),
    activeCurrency: () => 'VES',
    pMap: () => { individualMapRebuilds++; return new Map(); }
  };
  const betCard = runInNewContext('(' + cardSource + ')', context);
  const index = new Map(Array.from({length:1000},(_,i)=>['p'+i,{code:'CODE-'+i}]));
  const race = {status:'open'};
  const html = Array.from({length:1000},(_,i)=>betCard({
    id:'bet-'+i,play:'1P',horse:'3',amount:i+1,status:'pending',playerId:'p'+i
  },race,index)).join('');
  assert.equal(individualMapRebuilds,0);
  assert.equal((html.match(/data-action="cancel-bet"/g)||[]).length,1000);
  assert.ok(html.includes('CODE-0') && html.includes('CODE-999'));
  const capture = app.slice(app.indexOf('function renderCapture('),app.indexOf('function canCancelBet('));
  assert.match(capture, /const participantsById = active\.length \? pMap\(\) : null/);
  assert.match(capture, /\.map\(\(b\) => betCard\(b, race, participantsById\)\)/);
});
