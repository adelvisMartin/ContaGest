const DB_NAME='contagest-offline-v563';
const DB_VERSION=1;
const OUTBOX_STORE='outbox';
const META_STORE='meta';
const CACHE_PREFIX='contagest-ve-session-';
const SHELL_CACHE_PREFIX='contagest-ve-shell-';

export const ALLOWLISTED_OUTBOX_OPERATIONS=Object.freeze(new Set([
  'profile.preferences.update',
  'tasks.note.update',
  'support.draft.save'
]));

const hasWindow=()=>typeof window!=='undefined';
const hasIndexedDb=()=>typeof indexedDB!=='undefined';
const clean=(value)=>String(value||'').replace(/[^A-Za-z0-9._-]/g,'_').slice(0,96);

export function sessionIdentity(session){
  const tenantId=clean(session?.tenantId||session?.tenant?.id);
  const userId=clean(session?.user?.id||session?.userId);
  return tenantId?{tenantId,userId:userId||'anonymous'}:null;
}

export function cacheNamespace(session,version='v563'){
  const identity=sessionIdentity(session);
  if(!identity)return `${SHELL_CACHE_PREFIX}${clean(version)}`;
  return `${CACHE_PREFIX}${clean(version)}-${identity.tenantId}-${identity.userId}`;
}

function openDb(){
  if(!hasIndexedDb())return Promise.resolve(null);
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(OUTBOX_STORE)){
        const store=db.createObjectStore(OUTBOX_STORE,{keyPath:'id'});
        store.createIndex('sessionKey','sessionKey',{unique:false});
        store.createIndex('status','status',{unique:false});
      }
      if(!db.objectStoreNames.contains(META_STORE))db.createObjectStore(META_STORE,{keyPath:'key'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('IndexedDB unavailable'));
    request.onblocked=()=>reject(new Error('IndexedDB upgrade blocked'));
  });
}

function txDone(tx){
  return new Promise((resolve,reject)=>{
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||new Error('IndexedDB transaction failed'));
    tx.onabort=()=>reject(tx.error||new Error('IndexedDB transaction aborted'));
  });
}

export async function recoverIndexedDb(){
  if(!hasIndexedDb())return {recovered:false,reason:'unavailable'};
  try{
    const db=await openDb();
    db?.close();
    return {recovered:false,reason:'healthy'};
  }catch{
    await new Promise((resolve)=>{
      const request=indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess=request.onerror=request.onblocked=()=>resolve();
    });
    const db=await openDb();
    db?.close();
    return {recovered:true,reason:'schema-reset'};
  }
}

export async function enqueueOfflineOperation(session,{operation,payload,idempotencyKey}){
  if(!ALLOWLISTED_OUTBOX_OPERATIONS.has(operation))throw new Error('OFFLINE_OUTBOX_OPERATION_NOT_ALLOWED');
  if(!idempotencyKey||String(idempotencyKey).trim().length<8)throw new Error('OFFLINE_IDEMPOTENCY_KEY_REQUIRED');
  const identity=sessionIdentity(session);
  if(!identity)throw new Error('OFFLINE_SESSION_REQUIRED');
  const db=await openDb();
  if(!db)throw new Error('OFFLINE_INDEXEDDB_UNAVAILABLE');
  const sessionKey=`${identity.tenantId}:${identity.userId}`;
  const id=`${sessionKey}:${clean(operation)}:${clean(idempotencyKey)}`;
  const tx=db.transaction(OUTBOX_STORE,'readwrite');
  tx.objectStore(OUTBOX_STORE).put({id,sessionKey,tenantId:identity.tenantId,userId:identity.userId,operation,payload,idempotencyKey:String(idempotencyKey),status:'pending',createdAt:new Date().toISOString()});
  await txDone(tx);
  db.close();
  return {id,sessionKey,status:'pending'};
}

async function clearIndexedDbSession(session){
  const identity=sessionIdentity(session);
  if(!identity||!hasIndexedDb())return;
  const db=await openDb().catch(()=>null);
  if(!db)return;
  const sessionKey=`${identity.tenantId}:${identity.userId}`;
  const tx=db.transaction([OUTBOX_STORE,META_STORE],'readwrite');
  const store=tx.objectStore(OUTBOX_STORE);
  const request=store.index('sessionKey').openCursor(IDBKeyRange.only(sessionKey));
  request.onsuccess=()=>{const cursor=request.result;if(cursor){cursor.delete();cursor.continue();}};
  tx.objectStore(META_STORE).delete(`freshness:${sessionKey}`);
  await txDone(tx);
  db.close();
}

async function clearSessionCaches(session){
  if(typeof caches==='undefined')return;
  const identity=sessionIdentity(session);
  if(!identity)return;
  const keys=await caches.keys();
  const marker=`-${identity.tenantId}-${identity.userId}`;
  await Promise.all(keys.filter((key)=>key.startsWith(CACHE_PREFIX)&&key.includes(marker)).map((key)=>caches.delete(key)));
}

function postWorkerMessage(message){
  if(!hasWindow()||!navigator.serviceWorker)return;
  navigator.serviceWorker.controller?.postMessage(message);
  navigator.serviceWorker.ready.then((registration)=>registration.active?.postMessage(message)).catch(()=>undefined);
}

export async function setPwaSessionContext(session){
  const identity=sessionIdentity(session);
  postWorkerMessage({type:'CG_SESSION_CONTEXT',version:'v563',tenantId:identity?.tenantId||null,userId:identity?.userId||null});
  if(hasWindow()){
    document.documentElement.dataset.offlineFreshness=navigator.onLine?'fresh':'stale';
    window.dispatchEvent(new CustomEvent('cg:offline-freshness',{detail:{fresh:navigator.onLine,tenantId:identity?.tenantId||null}}));
  }
}

export async function purgeSessionArtifacts(session,{reason='session-end'}={}){
  const identity=sessionIdentity(session);
  await Promise.all([clearSessionCaches(session),clearIndexedDbSession(session)]);
  postWorkerMessage({type:'CG_CLEAR_SESSION',version:'v563',tenantId:identity?.tenantId||null,userId:identity?.userId||null,reason});
  if(hasWindow()){
    sessionStorage.removeItem('cg_post_login_route');
    sessionStorage.removeItem('cg_sidebar_scroll_top');
    window.dispatchEvent(new CustomEvent('cg:pwa-session-purged',{detail:{reason}}));
  }
}

export function installOfflineFreshnessObserver(){
  if(!hasWindow())return ()=>{};
  const apply=()=>{
    const fresh=navigator.onLine;
    document.documentElement.dataset.offlineFreshness=fresh?'fresh':'stale';
    window.dispatchEvent(new CustomEvent('cg:offline-freshness',{detail:{fresh}}));
  };
  window.addEventListener('online',apply);
  window.addEventListener('offline',apply);
  apply();
  return ()=>{window.removeEventListener('online',apply);window.removeEventListener('offline',apply);};
}

export function recoverServiceWorkerCaches(){
  postWorkerMessage({type:'CG_RECOVER_CACHE',version:'v563'});
  return recoverIndexedDb();
}
