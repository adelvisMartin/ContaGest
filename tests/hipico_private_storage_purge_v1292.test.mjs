import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Execute the actual shipped IndexedDB ownership methods; replace only
// browser storage calls with deterministic synthetic stores.
const source=readFileSync(new URL('../frontend/public/hipico-control/assets/js/store-v2.js',import.meta.url),'utf8');
const start=source.indexOf('export async function bindCloudIdentity(');
const end=source.indexOf('function canonicalize(',start);
assert.ok(start>=0&&end>start,'The Hípico private storage owner must exist');
const program=source.slice(start,end).replace(/^export /gm,'')
  +'\n({bindCloudIdentity,clearPrivateSessionState,getSnapshot:()=>lastWorkspaceSnapshot})';

function harness({cloudOwner='owner-a',session={access_token:'synthetic-private-token'},mode='cloud',failClear=null}={}){
  const settings=new Map();
  if(cloudOwner)settings.set('cloudOwnerId',cloudOwner);
  if(session)settings.set('cloudSession',session);
  if(mode)settings.set('mode',mode);
  const stores={
    workspaces:new Map([['primary',{id:'primary',workspace:{private:'owner-a'}}],
      ['archived:owner-a:1',{id:'archived:owner-a:1',workspace:{private:'old archived'}}]]),
    snapshots:new Map([['snapshot-1',{workspace:{private:'old snapshot'}}]]),
    outbox:new Map([['pending-1',{payload:'private pending event'}]]),
    syncMeta:new Map()
  };
  const calls=[];
  const context={
    lastWorkspaceSnapshot:{private:'cached in memory'},
    flushWorkspaceWrites:async()=>calls.push('flush'),
    getSetting:async(key,fallback=null)=>settings.has(key)?settings.get(key):fallback,
    setSetting:async(key,value)=>{
      calls.push('set:'+key);
      if(value===null||value===undefined)settings.delete(key); else settings.set(key,value);
    },
    clearStore:async(name)=>{
      calls.push('clear:'+name);
      if(name===failClear)throw new Error('Synthetic IndexedDB purge failure');
      stores[name].clear();
    },
    getRecord:async(name,id)=>stores[name].get(id)||null,
    putRecord:async(name,value)=>{stores[name].set(value.key||value.id,value);return value;},
    deleteRecord:async(name,id)=>stores[name].delete(id),
    nowIso:()=> '2026-11-17T00:00:00.000Z'
  };
  return {api:vm.runInNewContext(program,context),settings,stores,calls};
}

test('#1292 cloud logout purges primary, archived workspaces, snapshots and outbox',async()=>{
  const h=harness();
  h.stores.syncMeta.set('identitySwitch',{
    key:'identitySwitch',previousOwnerId:'owner-a',nextOwnerId:'owner-b'
  });
  await h.api.clearPrivateSessionState();
  for(const key of ['workspaces','snapshots','outbox'])assert.equal(h.stores[key].size,0,key);
  for(const key of ['cloudSession','cloudOwnerId','mode'])assert.equal(h.settings.has(key),false,key);
  assert.equal(h.api.getSnapshot(),null);
  assert.ok(h.stores.syncMeta.has('sessionCleared'));
  assert.equal(h.stores.syncMeta.has('identitySwitch'),false,
    'Cloud logout must remove historical owner IDs from local diagnostics');
});

test('#1292 pure local mode is not destroyed by cloud logout cleanup',async()=>{
  const h=harness({cloudOwner:null,session:null,mode:'local'});
  await h.api.clearPrivateSessionState();
  assert.equal(h.stores.workspaces.size,2);
  assert.equal(h.stores.snapshots.size,1);
  assert.equal(h.stores.outbox.size,0);
  assert.equal(h.settings.get('mode'),'local');
});

test('#1292 account switch never archives private state under the previous owner',async()=>{
  const h=harness();
  const result=await h.api.bindCloudIdentity('owner-b');
  assert.equal(result.changed,true);
  for(const key of ['workspaces','snapshots','outbox'])assert.equal(h.stores[key].size,0,key);
  assert.equal(h.settings.get('cloudOwnerId'),'owner-b');
  assert.equal(h.api.getSnapshot(),null);
  assert.ok(h.stores.syncMeta.has('identitySwitch'));
  assert.equal(JSON.stringify(h.stores.syncMeta.get('identitySwitch')).includes('owner-a'),false);
  assert.equal(JSON.stringify(h.stores.syncMeta.get('identitySwitch')).includes('owner-b'),false);
});

test('#1292 refreshing the same owner does not purge their offline workspace',async()=>{
  const h=harness();
  const result=await h.api.bindCloudIdentity('owner-a');
  assert.equal(result.changed,false);
  assert.equal(h.stores.workspaces.size,2);
  assert.equal(h.stores.snapshots.size,1);
  assert.equal(h.stores.outbox.size,1);
});

test('#1292 failed private-store deletion must not look like completed logout',async()=>{
  const h=harness({failClear:'workspaces'});
  await assert.rejects(h.api.clearPrivateSessionState(),/Synthetic IndexedDB purge failure/);
  assert.equal(h.stores.workspaces.size,2);
  assert.equal(h.settings.get('cloudOwnerId'),'owner-a','Retry must retain the identity marker');
});
