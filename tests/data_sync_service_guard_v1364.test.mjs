import test from 'node:test';
import assert from 'node:assert/strict';
import { DataSyncService, SYNC_RESOURCES } from '../frontend/src/services/dataSyncService.js';

function withContext(origin, action, native = false) {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
  const calls = [];
  globalThis.window = {
    location: { origin, protocol:new URL(origin).protocol },
    ...(native ? { Capacitor:{isNativePlatform:()=>true} } : {})
  };
  globalThis.fetch = async (url, options) => {
    calls.push({url,options});
    return {
      ok:true, headers:{get:()=> 'application/json'},
      json:async()=>({ok:true})
    };
  };
  return Promise.resolve().then(()=>action(calls)).finally(()=>{
    if(previousWindow===undefined)delete globalThis.window;
    else globalThis.window=previousWindow;
    if(previousFetch===undefined)delete globalThis.fetch;
    else globalThis.fetch=previousFetch;
  });
}

test('no business state is sent to a backend URL not in the trusted origin set', () =>
  withContext('https://contagest.example', async calls => {
    const state = { ledger:[{id:'private-financial-record',amount:95}],quote:{taxes:{}} };
    await assert.rejects(DataSyncService.pushAll('https://evil.test',state), error => error.status === 400);
    assert.equal(calls.length,0, 'authorization failure must precede first POST');
  })
);

test('unapproved pull cannot alter locally stored business state', () =>
  withContext('https://contagest.example', async calls => {
    const current = { clients:[{name:'Original'}],quote:{taxes:{IVA:16}} };
    await assert.rejects(DataSyncService.pullAll('https://evil.test', current), error => error.status === 400);
    assert.deepEqual(current,{ clients:[{name:'Original'}],quote:{taxes:{IVA:16}} });
    assert.equal(calls.length,0);
    assert.throws(() => DataSyncService.health('https://evil.test'), error => error.status === 400);
    assert.equal(calls.length,0);
  })
);

test('same-origin sync retains all 14 resource uploads and error-free happy path', () =>
  withContext('https://contagest.example', async calls => {
    const state = {ledger:[{amount:80}],quote:{taxes:{IVA:16}}};
    const results = await DataSyncService.pushAll('/api/v1',state);
    assert.equal(results.length,SYNC_RESOURCES.length);
    assert.equal(calls.length,SYNC_RESOURCES.length);
    assert.ok(calls.every(c=>c.url.startsWith('/api/v1/api/')));
    assert.ok(calls.every(c=>c.options.redirect==='error' && c.options.method==='POST'));
    assert.equal(JSON.parse(calls.find(c=>c.url.endsWith('/ledger')).options.body)[0].amount,80);
  })
);

test('a native release without approved API never performs a sync transfer', () =>
  withContext('https://localhost', async calls => {
    await assert.rejects(DataSyncService.pushAll('/api/v1',{quote:{taxes:{}}}), error=>error.status===400);
    assert.equal(calls.length,0);
  },true)
);
