import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { scopeItems } from '../frontend/public/hipico-control/assets/js/operational-ledger.js';
import { repairWorkspaceGroupScope, __test__ as storeTest } from '../frontend/public/hipico-control/assets/js/store-v2.js';
import { normalizeWorkspaceShape } from '../frontend/public/hipico-control/assets/js/workspace.js';

const appSource=await readFile(new URL('../frontend/public/hipico-control/assets/js/app.js',import.meta.url),'utf8');
const guardSource=await readFile(new URL('../frontend/public/hipico-control/assets/js/financial-config-guard.js',import.meta.url),'utf8');
const indexSource=await readFile(new URL('../frontend/public/hipico-control/index.html',import.meta.url),'utf8');
const swSource=await readFile(new URL('../frontend/public/hipico-control/sw.js',import.meta.url),'utf8');

function workspace(){
  return {
    config:{
      commission:0.05,exchangeRate:160,currency:'Bs.',activeGroupId:'g2',activeWhatsappGroupId:'g2',activeRaceByGroup:{},
      groups:[
        {id:'g1',name:'Uno',companyName:'Uno',currency:'Bs.',exchangeRate:160,commission:0.05},
        {id:'g2',name:'Dos',companyName:'Dos',currency:'Bs.',exchangeRate:220,commission:0.09}
      ]
    },
    participants:[],days:[],races:[],advancedBets:[],movements:[],exchangeRates:[],weekClosures:[],pollas:[],audit:[]
  };
}

test('canonical scope assigns legacy untagged rows only to the first/default group',()=>{
  const ws=workspace();
  const items=[{id:'legacy'},{id:'one',groupId:'g1'},{id:'two',groupId:'g2'}];
  assert.deepEqual(scopeItems(ws,items,'g1').map((item)=>item.id),['legacy','one']);
  assert.deepEqual(scopeItems(ws,items,'g2').map((item)=>item.id),['two']);
});

test('normalization and persistence make the active group the legacy financial authority',()=>{
  const normalized=normalizeWorkspaceShape(workspace());
  assert.equal(normalized.config.commission,0.09);
  assert.equal(normalized.config.exchangeRate,220);

  normalized.config.groups.find((group)=>group.id==='g2').commission=7;
  normalized.config.groups.find((group)=>group.id==='g2').exchangeRate=0;
  const previous=normalizeWorkspaceShape(workspace());
  repairWorkspaceGroupScope(normalized,previous);
  const active=normalized.config.groups.find((group)=>group.id==='g2');
  assert.equal(active.commission,0.09);
  assert.equal(active.exchangeRate,220);
  assert.equal(normalized.config.commission,0.09);
  assert.equal(normalized.config.exchangeRate,220);
});

test('newest open day wins while closed-day fallback remains chronological',()=>{
  const ws=workspace();
  ws.days=[
    {id:'old-open',groupId:'g2',date:'2026-09-10',status:'open'},
    {id:'closed',groupId:'g2',date:'2026-09-09',status:'closed'},
    {id:'new-open',groupId:'g2',date:'2026-09-11',status:'open'}
  ];
  storeTest.preferNewestOpenDay(ws);
  const days=ws.days.filter((day)=>day.groupId==='g2');
  assert.equal(days.find((day)=>day.status==='open').id,'new-open');
});

test('migration-only recovery preserves orphaned group data without collapsing tenants',()=>{
  const ws=workspace();
  ws.participants=[{id:'legacy-g3',groupId:'g3',name:'Histórico'}];
  ws.syncQueue=[{id:'sync-g3',groupId:'g3',action:'legacy_pending'}];

  repairWorkspaceGroupScope(ws,null);

  const recovered=ws.config.groups.find((group)=>group.id==='g3');
  assert.ok(recovered);
  assert.equal(recovered.active,false);
  assert.equal(ws.participants[0].groupId,'g3');
  assert.equal(ws.syncQueue[0].groupId,'g3');
  assert.doesNotThrow(()=>normalizeWorkspaceShape(ws));
});

test('runtime writes still fail closed for newly unknown group references',()=>{
  const previous=workspace();
  const ws=workspace();
  ws.participants=[{id:'bad-runtime-ref',groupId:'g3',name:'No debe autocorregirse'}];

  repairWorkspaceGroupScope(ws,previous);

  assert.equal(ws.config.groups.some((group)=>group.id==='g3'),false);
  assert.throws(
    ()=>normalizeWorkspaceShape(ws),
    (error)=>error?.code==='HIPICO_WORKSPACE_UNKNOWN_GROUP'
  );
});

test('financial UI guard enforces commission and rate bounds and is available offline',()=>{
  assert.match(guardSource,/La comisión debe estar entre 0% y 100%/);
  assert.match(guardSource,/La tasa Bs\/USD debe ser mayor que cero/);
  assert.match(guardSource,/min:\s*0,\s*max:\s*100/);
  assert.match(guardSource,/POSITIVE_RATE_MIN\s*=\s*0\.0001/);
  assert.match(guardSource,/stopImmediatePropagation/);
  assert.match(indexSource,/financial-config-guard\.js/);
  assert.match(swSource,/financial-config-guard\.js/);
});

test('equivalent multigroup race must remain open before a mirrored bet can be written',()=>{
  assert.match(appSource,/matchingRace\s*&&\s*matchingRace\.status\s*!==\s*"open"/);
  assert.match(appSource,/const blockedGroups = targetIds\.filter/);
  assert.match(appSource,/No se registró la apuesta: abre la carrera equivalente/);
});

test('offline idempotency compares semantic intent rather than transport metadata',()=>{
  const left={id:'a',idempotencyKey:'same',groupId:'g2',action:'movement',payload:{amount:10,currency:'VES'},createdAt:'one',attempts:0};
  const replay={id:'b',idempotencyKey:'same',groupId:'g2',action:'movement',payload:{currency:'VES',amount:10},createdAt:'two',attempts:4};
  const mismatch={...replay,payload:{currency:'VES',amount:20}};
  assert.equal(storeTest.sameOutboxIntent(left,replay),true);
  assert.equal(storeTest.sameOutboxIntent(left,mismatch),false);
});