import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { scopeItems } from '../frontend/public/hipico-control/assets/js/operational-ledger.js';

const appSource=await readFile(new URL('../frontend/public/hipico-control/assets/js/app.js',import.meta.url),'utf8');

function workspace(){
  return {
    config:{groups:[{id:'g1'},{id:'g2'}],activeGroupId:'g2'},
    participants:[],days:[],races:[],movements:[],exchangeRates:[],weekClosures:[],pollas:[],audit:[]
  };
}

test('canonical scopeItems assigns legacy untagged rows only to the first/default group',()=>{
  const ws=workspace();
  const items=[{id:'legacy'},{id:'one',groupId:'g1'},{id:'two',groupId:'g2'}];
  assert.deepEqual(scopeItems(ws,items,'g1').map((item)=>item.id),['legacy','one']);
  assert.deepEqual(scopeItems(ws,items,'g2').map((item)=>item.id),['two']);
});

test('app delegates group scoping to the canonical operational ledger',()=>{
  assert.match(appSource,/import \{ scopeItems as scopeLedgerItems \} from "\.\/operational-ledger\.js";/);
  assert.match(appSource,/function groupItems\(items, groupId = activeGroupId\(\)\) \{ return scopeLedgerItems\(workspace, items, groupId\); \}/);
  assert.doesNotMatch(appSource,/!item\.groupId\s*\|\|\s*item\.groupId\s*===\s*groupId/);
});

test('settlement uses the active group commission instead of a global commission value',()=>{
  assert.match(appSource,/function settleRace\(\)[\s\S]*?const commission = Number\(activeGroup\(\)\.commission\)/);
  assert.match(appSource,/settleBet\(b, r, commission\)/);
});

test('weekly close updates previousWeekBalance only inside the active group',()=>{
  assert.match(appSource,/function closeWeek\(\)[\s\S]*?groupItems\(workspace\.participants\)\.forEach\(\(p\) => p\.previousWeekBalance = balanceAt\(p\.id\)\)/);
});

test('daily and advanced creation persist groupId and avoid cross-group lookup',()=>{
  assert.match(appSource,/workspace\.days\.push\(\{ id: uid\("day"\), groupId, date: today\(\), status: "open"/);
  assert.match(appSource,/const groupId = activeGroupId\(\); const \[date, racetrack, num\] = key\.split\("\\\|"\)/);
  assert.match(appSource,/groupItems\(workspace\.advancedBets, groupId\)/);
  assert.match(appSource,/groupItems\(workspace\.races, groupId\)/);
  assert.match(appSource,/groupItems\(workspace\.days, groupId\)/);
  assert.match(appSource,/const loaded = bets\.map\(\(b\) => \(\{ id: uid\("bet"\), groupId,/);
});

test('equivalent multigroup race must be open before a mirrored bet can be written',()=>{
  assert.match(appSource,/if \(race && race\.status !== "open"\) throw new Error\(`La carrera equivalente/);
  assert.match(appSource,/const blockedGroups = targetIds\.filter/);
  assert.match(appSource,/No se registró la apuesta: abre la carrera equivalente/);
});

test('financial configuration is validated before it reaches settlement or race creation',()=>{
  assert.match(appSource,/La comisión debe estar entre 0% y 100%/);
  assert.match(appSource,/La tasa Bs\/USD debe ser mayor que cero/);
  assert.match(appSource,/name="commission" type="number" min="0" max="100"/);
  assert.match(appSource,/name="exchangeRate" type="number" min="0\.0001"/);
});

test('active-day fallback prefers the newest open day instead of the oldest legacy row',()=>{
  assert.match(appSource,/function activeDay\(\) \{ const days = groupItems\(workspace\.days\); return \[\.\.\.days\]\.reverse\(\)\.find\(\(d\) => d\.status === "open"\)/);
});
