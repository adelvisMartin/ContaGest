import test from 'node:test';
import assert from 'node:assert/strict';
import { DataSyncService, SYNC_RESOURCES } from '../frontend/src/services/dataSyncService.js';

async function withSyncBackend(handler, run) {
  const previous = {window:globalThis.window,fetch:globalThis.fetch};
  const calls=[];
  globalThis.window={location:{origin:'https://contagest.example',protocol:'https:'}};
  globalThis.fetch=async (url,options)=>{calls.push({url,options});return handler(url,options)};
  try {return await run(calls);} finally {
    for(const [key,value] of Object.entries(previous)){
      if(value===undefined)delete globalThis[key];else globalThis[key]=value;
    }
  }
}

const resourceValue=(url)=>String(url).endsWith('/taxes')?{IVA:10}:[{id:'new-resource'}];
const ok=(value)=>({ok:true,status:200,json:async()=>value,headers:{get:()=>null}});
const fail=()=>({ok:false,status:503,json:async()=>({message:'Error de red'}),headers:{get:()=>null}});

test('partial resource failure cannot mutate existing customer/accounting state',async()=>{
 await withSyncBackend(url=>String(url).endsWith('/banking')?fail():ok(resourceValue(url)), async calls=>{
   const draft={clients:[{id:'old-client'}],ledger:[{id:'old-entry'}],quote:{taxes:{IVA:16}},banking:[{id:'old-bank'}]};
   const before=structuredClone(draft);
   const result=await DataSyncService.pullAll('/api/v1',draft);
   assert.equal(result.length,SYNC_RESOURCES.length);
   assert.equal(result.find(r=>r.resource==='banking')?.ok,false);
   assert.equal(calls.length,SYNC_RESOURCES.length);
   assert.deepEqual(draft,before,'no partial import permitted after 503');
 });
});

test('complete successful pull replaces scoped resources only after all responses arrive',async()=>{
 await withSyncBackend(url=>ok(resourceValue(url)),async calls=>{
  const draft={clients:[{id:'old-client'}],quote:{taxes:{IVA:16}},settings:{theme:'dark'}};
  const result=await DataSyncService.pullAll('/api/v1',draft);
  assert.equal(result.length,SYNC_RESOURCES.length);
  assert.ok(result.every(r=>r.ok));
  assert.equal(calls.length,SYNC_RESOURCES.length);
  assert.deepEqual(draft.clients,[{id:'new-resource'}]);
  assert.deepEqual(draft.quote.taxes,{IVA:10});
  assert.equal(draft.settings.theme,'dark');
 });
});

test('all 14 failure positions preserve the complete previous snapshot', async () => {
  for (const rejectedResource of SYNC_RESOURCES) {
    await withSyncBackend(url=>String(url).endsWith('/'+rejectedResource)?fail():ok(resourceValue(url)), async calls=>{
      const draft={clients:[{id:'existing-c'}],ledger:[{id:'existing-l'}],quote:{taxes:{IVA:16}},settings:{theme:'dark'}};
      const snapshot=structuredClone(draft);
      const results=await DataSyncService.pullAll('/api/v1',draft);
      assert.equal(results.filter(r=>!r.ok).length, 1, rejectedResource);
      assert.equal(results.find(r=>r.resource===rejectedResource)?.ok,false, rejectedResource);
      assert.deepEqual(draft,snapshot, rejectedResource);
      assert.equal(calls.length,SYNC_RESOURCES.length, rejectedResource);
    });
  }
});
