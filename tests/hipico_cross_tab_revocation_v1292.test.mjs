import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read=(name)=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const source=read('frontend/public/hipico-control/assets/js/cloud-tab-signal.js');
const transport=source.replace(/^export /gm,'')
  + '\n({subscribeCloudSessionInvalidation,signalOtherTabsCloudSessionInvalidation})';

function makeBus(){
  const channels=[];
  const messages=[];
  class Channel {
    constructor(name){this.name=name;this.onmessage=null;channels.push(this);}
    postMessage(message){
      messages.push(structuredClone(message));
      for(const channel of channels){
        if(channel!==this && channel.name===this.name)channel.onmessage?.({data:message});
      }
    }
  }
  return {Channel,messages};
}

function tab({Channel=null,storage=null}={}){
  const events={};
  const window={
    addEventListener:(type,listener)=>{(events[type] ||= []).push(listener);},
    localStorage:storage||{setItem:()=>{}}
  };
  const globalThis={window,crypto:{randomUUID:()=> 'synthetic-nonce'}};
  if(Channel)globalThis.BroadcastChannel=Channel;
  const api=vm.runInNewContext(transport,{window,globalThis,Date,Math,Set,TypeError});
  return {api,events,window};
}

test('#1292 BroadcastChannel invalidates other tabs without broadcasting credentials or group IDs',()=>{
  const bus=makeBus();
  const first=tab({Channel:bus.Channel}),second=tab({Channel:bus.Channel});
  let firstHits=0,secondHits=0;
  first.api.subscribeCloudSessionInvalidation(()=>{firstHits++;});
  second.api.subscribeCloudSessionInvalidation(()=>{secondHits++;});
  assert.equal(first.api.signalOtherTabsCloudSessionInvalidation(),true);
  assert.equal(firstHits,0,'The originating tab handles its own local logout');
  assert.equal(secondHits,1,'Second tab must invalidate its cached private authority');
  assert.deepEqual(bus.messages.map(x=>JSON.parse(JSON.stringify(x))),[{type:'invalidate'}]);
  const payload=JSON.stringify(bus.messages);
  assert.equal(payload.includes('Bearer'),false);
  assert.equal(payload.includes('access_token'),false);
  assert.equal(payload.includes('owner'),false);
});

test('#1292 unsubscribe stops reacting to subsequent same-origin invalidations',()=>{
  const bus=makeBus();
  const a=tab({Channel:bus.Channel}),b=tab({Channel:bus.Channel});
  a.api.subscribeCloudSessionInvalidation(()=>{});
  let calls=0;
  const stop=b.api.subscribeCloudSessionInvalidation(()=>{calls++;});
  a.api.signalOtherTabsCloudSessionInvalidation();
  stop();
  a.api.signalOtherTabsCloudSessionInvalidation();
  assert.equal(calls,1);
});

test('#1292 storage-event fallback signals changes without persisting a bearer',()=>{
  const tabs=[];
  function createStorage(){
    return {setItem:(key,value)=>{
      for(const target of tabs){
        for(const callback of target.events.storage||[])
          callback({key,newValue:value});
      }
    }};
  }
  const a=tab({storage:createStorage()}),b=tab({storage:createStorage()});
  tabs.push(b);
  let received=0;
  a.api.subscribeCloudSessionInvalidation(()=>{});
  b.api.subscribeCloudSessionInvalidation(()=>{received++;});
  assert.equal(a.api.signalOtherTabsCloudSessionInvalidation(),true);
  assert.equal(received,1);
});

test('#1292 callers fail safely when cross-tab transport is not usable',()=>{
  const env=tab({storage:{setItem:()=>{throw new Error('Storage denied');}}});
  env.api.subscribeCloudSessionInvalidation(()=>{});
  assert.equal(env.api.signalOtherTabsCloudSessionInvalidation(),false);
});

test('#1292 cross-tab event is wired to the canonical session epoch and clears private UI',()=>{
  const auth=read('frontend/public/hipico-control/assets/js/supabase.js');
  const ui=read('frontend/public/hipico-control/assets/js/app.js');
  assert.match(auth,/subscribeCloudSessionInvalidation\(\(\) => \{/);
  assert.match(auth,/const expectedEpoch = \+\+sessionEpoch;\s*cachedSession = null;\s*refreshPromise = null;/);
  assert.match(auth,/signalOtherTabsCloudSessionInvalidation\(\)/);
  assert.match(auth,/new globalThis\.CustomEvent\("hipico:cloud-session-ended"\)/);
  assert.match(ui,/window\.addEventListener\("hipico:cloud-session-ended", \(\) => \{/);
  assert.match(ui,/mode = null;\s*workspace = null;\s*cloudWorkspaceId = null;\s*cloudProfile = null;/);
  assert.match(ui,/if \(mode !== "cloud" \|\| !currentSession\(\) \|\| !workspace\) \{ isSyncing = false; return; \}/);
});
