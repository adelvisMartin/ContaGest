const CACHE_PREFIX = 'contagest-ve-v563-session-'; // existing local/offline test namespace
const SW_CACHE_PREFIX = 'contagest-ve-v563-3-session-'; // current worker namespace
const DB_PREFIX = 'contagest-offline-v563-';
const AUTH_SESSION_KEY = 'contagest_auth_session';
const LEGACY_STATE_PREFIX = 'contagest_ve_enterprise_v7_state';

export const OUTBOX_ALLOWLIST = Object.freeze({
  'analytics.event': Object.freeze({ method: 'POST', path: '/analytics/events' }),
  'gym.workout.set': Object.freeze({ method:'POST', path:'/verticals/gym/workout-sessions/:sessionId/sets' })
});

function hashScopePart(value) {
  const input = String(value || 'anonymous');
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function sessionScope(session) {
  const tenantId = session?.tenantId || session?.tenant?.id || 'anonymous';
  const userId = session?.user?.id || session?.userId || 'anonymous';
  return `${hashScopePart(tenantId)}-${hashScopePart(userId)}`;
}

const GYM_SET_UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GYM_SET_FIELDS=new Set([
  'sessionId','routineExerciseId','setNumber','status','loadKg','reps',
  'rir','rpe','restSeconds','notes','performedExerciseId','substitutionReason'
]);

function offlineError(code,message){
  const error=new Error(message);error.code=code;return error;
}

function validateWorkoutSetPayload(payload){
  if(!payload||typeof payload!=='object'||Array.isArray(payload))
    throw offlineError('OFFLINE_WORKOUT_PAYLOAD_INVALID','La serie debe ser un objeto.');
  if(Object.keys(payload).some((key)=>!GYM_SET_FIELDS.has(key))||
    !GYM_SET_UUID.test(String(payload.sessionId||''))||
    !GYM_SET_UUID.test(String(payload.routineExerciseId||''))||
    !Number.isSafeInteger(payload.setNumber)||payload.setNumber<1||payload.setNumber>100||
    !['completed','skipped'].includes(payload.status))
    throw offlineError('OFFLINE_WORKOUT_PAYLOAD_INVALID','Identificadores o campos de serie inválidos.');
  if(payload.status==='completed'&&
    (!Number.isSafeInteger(payload.reps)||payload.reps<0||payload.reps>500))
    throw offlineError('OFFLINE_WORKOUT_PAYLOAD_INVALID','La serie requiere repeticiones válidas.');
  let encoded;
  try{encoded=JSON.stringify(payload);}catch{encoded=null;}
  if(!encoded||encoded.length>8192)
    throw offlineError('OFFLINE_WORKOUT_PAYLOAD_INVALID','El evento excede el límite offline.');
  return JSON.parse(encoded);
}

export function resolveOfflinePath(operation,payload){
  const authority=Object.hasOwn(OUTBOX_ALLOWLIST,operation)?OUTBOX_ALLOWLIST[operation]:null;
  if(!authority)throw offlineError('OFFLINE_OPERATION_NOT_ALLOWED','Operación offline no autorizada.');
  if(operation==='gym.workout.set'){
    const data=validateWorkoutSetPayload(payload);
    return authority.path.replace(':sessionId',encodeURIComponent(data.sessionId));
  }
  return authority.path;
}

function assertCurrentOfflineSession(session){
  if(!session?.tenantId||!(session?.user?.id||session?.userId))
    throw offlineError('OFFLINE_SESSION_CHANGED','La cola requiere sesión tenant/usuario.');
  if(typeof localStorage!=='undefined'){
    const current=parseStoredSession();
    if(!current||sessionScope(current)!==sessionScope(session))
      throw offlineError('OFFLINE_SESSION_CHANGED','La sesión cambió; no es seguro sincronizar.');
  }
}

function sessionCacheName(session) {
  return `${CACHE_PREFIX}${sessionScope(session)}`;
}

function dbName(session) {
  return `${DB_PREFIX}${sessionScope(session)}`;
}

function postToServiceWorker(message) {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
  const target = navigator.serviceWorker.controller;
  if (target) {
    target.postMessage(message);
    return;
  }
  navigator.serviceWorker.ready.then((registration) => {
    // A pending ready() from login A must not restore A's scope after
    // logout or after tenant B becomes the current session.
    if (message.type === 'SET_SESSION_SCOPE' &&
        sessionScope(parseStoredSession()) !== message.scopeToken) return;
    const worker = registration.active || registration.waiting || registration.installing;
    worker?.postMessage(message);
  }).catch(() => undefined);
}

export function setServiceWorkerSession(session) {
  const tenantId = session?.tenantId || session?.tenant?.id || null;
  const userId = session?.user?.id || session?.userId || null;
  if (!tenantId) return;
  postToServiceWorker({
    type: 'SET_SESSION_SCOPE',
    scopeToken: sessionScope(session),
    tenantIdHash: hashScopePart(tenantId),
    userIdHash: hashScopePart(userId)
  });
}

function deleteDatabase(name) {
  if (typeof indexedDB === 'undefined') return Promise.resolve();
  return new Promise((resolve, reject) => {
    // IndexedDB may keep the old database alive while another tab holds a
    // connection. Never turn blocked/error into a successful privacy purge.
    let request;
    try { request = indexedDB.deleteDatabase(name); }
    catch (error) { reject(error); return; }
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('OFFLINE_DB_DELETE_FAILED'));
    request.onblocked = () => {
      const error = new Error('OFFLINE_DB_DELETE_BLOCKED');
      error.code = 'OFFLINE_DB_DELETE_BLOCKED';
      reject(error);
    };
  });
}

async function purgeIndexedDb(session) {
  if (typeof indexedDB === 'undefined') return;
  const targeted = new Set([dbName(session)]);
  if (typeof indexedDB.databases === 'function') {
    const databases = await indexedDB.databases().catch(() => []);
    for (const database of databases || []) {
      const name = String(database?.name || '');
      // Database names are exactly scoped; prefix neighbors may belong to
      // a different user and must never be deleted by this session.
      if (name === dbName(session)) targeted.add(name);
    }
  }
  await Promise.all([...targeted].map(deleteDatabase));
}

function parseStoredSession() {
  if (typeof localStorage === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || 'null'); }
  catch { return null; }
}

function purgeWebStorage(session) {
  if (typeof localStorage !== 'undefined') {
    const scope = sessionScope(session);
    const current = parseStoredSession();
    if (current && sessionScope(current) === scope) localStorage.removeItem(AUTH_SESSION_KEY);
    localStorage.removeItem(LEGACY_STATE_PREFIX);
    localStorage.removeItem(`${LEGACY_STATE_PREFIX}:${scope}`);

    const keys = [];
    for (let index = 0; index < localStorage.length; index += 1) keys.push(localStorage.key(index));
    for (const key of keys.filter(Boolean)) {
      if (key.includes(scope) && key !== `${LEGACY_STATE_PREFIX}:${scope}`) localStorage.removeItem(key);
    }
  }
  if (typeof sessionStorage !== 'undefined') {
    // Do not erase Control Hípico's independent same-origin login or state.
    const sensitivePrefixes = ['cg_', 'contagest_'];
    const keys = [];
    for (let index = 0; index < sessionStorage.length; index += 1) keys.push(sessionStorage.key(index));
    for (const key of keys.filter(Boolean)) {
      if (sensitivePrefixes.some((prefix) => key.startsWith(prefix))) sessionStorage.removeItem(key);
    }
  }
}

export async function purgeOfflineSession(session) {
  const scopeToken = sessionScope(session);
  const errors = [];
  try { purgeWebStorage(session); }
  catch (error) { errors.push(error); }
  try { postToServiceWorker({ type: 'CLEAR_SESSION_DATA', scopeToken }); }
  catch (error) { errors.push(error); }

  // Both stores must be attempted even if one fails. A blocked database may
  // finish deletion later, but cannot be reported as already purged.
  const results = await Promise.allSettled([
    (async () => {
      if (typeof caches === 'undefined') return;
      const names = await caches.keys();
      const owned = new Set([sessionCacheName(session), `${SW_CACHE_PREFIX}${scopeToken}`]);
      await Promise.all(names.filter((name) => owned.has(name)).map((name) => caches.delete(name)));
    })(),
    purgeIndexedDb(session)
  ]);
  for (const result of results) {
    if (result.status === 'rejected') errors.push(result.reason);
  }
  if (errors.length > 0) {
    const error = new Error('No se pudo borrar toda la información offline. Cierra otras pestañas y vuelve a intentarlo.');
    error.code = 'OFFLINE_SESSION_PURGE_FAILED';
    throw error;
  }
}

function openOutbox(session) {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB no está disponible.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName(session), 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('outbox')) {
        const store = database.createObjectStore('outbox', { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir el outbox offline.'));
  });
}

function transactionPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Falló la transacción IndexedDB.'));
    transaction.onabort = () => reject(transaction.error || new Error('La transacción IndexedDB fue cancelada.'));
  });
}

export async function enqueueOfflineOperation({ session, operation, payload, idempotencyKey }) {
  const authority = Object.hasOwn(OUTBOX_ALLOWLIST, operation) ? OUTBOX_ALLOWLIST[operation] : null;
  if (!authority) {
    const error = new Error(`Operación offline no autorizada: ${operation}`);
    error.code = 'OFFLINE_OPERATION_NOT_ALLOWED';
    throw error;
  }
  if (!session?.tenantId || !session?.user?.id) throw new Error('Se requiere sesión tenant/user para usar el outbox offline.');
  assertCurrentOfflineSession(session);
  const safePayload=operation==='gym.workout.set'?validateWorkoutSetPayload(payload):payload ?? {};
  const key = String(idempotencyKey || '').trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(key)) throw new Error('idempotencyKey inválida para operaciones offline reintentables.');
  const database = await openOutbox(session);
  try {
    const transaction = database.transaction('outbox', 'readwrite');
    const store = transaction.objectStore('outbox');
    const id = `${sessionScope(session)}:${operation}:${key}`;
    const record = {
      id,
      scopeToken: sessionScope(session),
      operation,
      idempotencyKey: key,
      payload: safePayload,
      createdAt: new Date().toISOString(),
      attempts: 0,
      status: 'pending',
      nextAttemptAt: null,
      authority
    };
    // An existing idempotency key is a safe retry only for the exact same
    // pending event. Use one readwrite transaction so competing tabs cannot
    // overwrite or independently enqueue the same identity.
    let storedRecord = record;
    let conflict = false;
    const lookup = store.get(id);
    lookup.onsuccess = () => {
      const existing = lookup.result;
      if (!existing) {
        store.add(record);
        return;
      }
      // A non-JSON or throwing payload cannot be declared an identical
      // replay: never let an exception inside an IDB event handler masquerade
      // as a successful enqueue.
      let samePayload = false;
      try {
        const original = JSON.stringify(existing.payload);
        samePayload = original !== undefined && original === JSON.stringify(record.payload);
      } catch { /* unrepresentable replay: conflict */ }
      if (existing.scopeToken !== record.scopeToken ||
          existing.operation !== record.operation ||
          existing.idempotencyKey !== record.idempotencyKey ||
          !samePayload) {
        conflict = true;
        return;
      }
      storedRecord = existing;
    };
    await transactionPromise(transaction);
    if (conflict) {
      const error = new Error('La clave de idempotencia pertenece a una operación diferente.');
      error.code = 'OFFLINE_IDEMPOTENCY_CONFLICT';
      throw error;
    }
    return storedRecord;
  } finally {
    database.close();
  }
}

export function assertOfflineDeliveryAcknowledged(response) {
  // Successful Promise resolution is not proof of server acceptance.
  const acknowledged = response && typeof response === 'object' &&
    response.ok !== false && response.delivered !== false &&
    (response.ok === true || response.delivered === true ||
      (Number.isInteger(response.status) && response.status >= 200 && response.status < 300));
  if (!acknowledged) {
    const error = new Error('OFFLINE_DELIVERY_NOT_ACKNOWLEDGED');
    error.code = 'OFFLINE_DELIVERY_NOT_ACKNOWLEDGED';
    throw error;
  }
  return true;
}

async function readOutbox(session) {
  const database = await openOutbox(session);
  try {
    const transaction = database.transaction('outbox', 'readonly');
    const request = transaction.objectStore('outbox').getAll();
    const records = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error('No se pudo leer el outbox.'));
    });
    await transactionPromise(transaction);
    return records.filter((record) => record.scopeToken === sessionScope(session));
  } finally {
    database.close();
  }
}

async function deleteOutboxRecord(session, id) {
  const database = await openOutbox(session);
  try {
    const transaction = database.transaction('outbox', 'readwrite');
    transaction.objectStore('outbox').delete(id);
    await transactionPromise(transaction);
  } finally {
    database.close();
  }
}

function retryDelayMs(attempts){
  return Math.min(300000,1000*2**Math.min(8,Math.max(0,attempts-1)));
}

async function updateGymOutboxFailure(session,id,error){
  if(typeof indexedDB==='undefined')return;
  const database=await openOutbox(session);
  try{
    const transaction=database.transaction('outbox','readwrite');
    const store=transaction.objectStore('outbox');
    const lookup=store.get(id);
    lookup.onsuccess=()=>{
      const record=lookup.result;
      if(!record||record.scopeToken!==sessionScope(session)||record.operation!=='gym.workout.set')return;
      const attempts=Number(record.attempts||0)+1;
      const status=error?.status===409?'conflict':
        [400,401,403,404,422].includes(error?.status)?'failed':'pending';
      store.put({...record,attempts,status,
        errorCode:typeof error?.status==='number'?'HTTP_'+error.status:'NETWORK_RETRY',
        nextAttemptAt:status==='pending'?new Date(Date.now()+retryDelayMs(attempts)).toISOString():null
      });
    };
    await transactionPromise(transaction);
  }finally{database.close();}
}

export async function listOfflineWorkoutQueue(session){
  assertCurrentOfflineSession(session);
  const records=await readOutbox(session);
  return records.filter((record)=>record.operation==='gym.workout.set').map((record)=>({
    id:record.id,createdAt:record.createdAt,status:record.status||'pending',
    attempts:record.attempts||0,errorCode:record.errorCode||null,
    sessionId:record.payload?.sessionId,routineExerciseId:record.payload?.routineExerciseId,
    setNumber:record.payload?.setNumber
  }));
}

export async function flushOfflineOutbox(session, sender, options = {}) {
  if (typeof sender !== 'function') throw new TypeError('sender debe ser una función.');
  assertCurrentOfflineSession(session);
  const allowed=Array.isArray(options.operations)?new Set(options.operations):null;
  const force=options.force===true;
  const records = await readOutbox(session);
  const results = [];
  for (const record of records.sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))||String(a.id).localeCompare(String(b.id)))) {
    if(allowed&&!allowed.has(record.operation))continue;
    if(record.status==='conflict'||record.status==='failed'){
      results.push({id:record.id,delivered:false,status:record.status,error:record.errorCode||'OFFLINE_REQUIRES_REVIEW'});
      break;
    }
    if(!force&&record.nextAttemptAt&&new Date(record.nextAttemptAt).getTime()>Date.now())break;
    // Resolve offline transport from this source-controlled allowlist, never mutable IndexedDB metadata.
    const authority = Object.hasOwn(OUTBOX_ALLOWLIST, record.operation)
      ? OUTBOX_ALLOWLIST[record.operation] : null;
    if (!authority) continue;
    try {
      assertCurrentOfflineSession(session);
      const path=resolveOfflinePath(record.operation,record.payload);
      const response=await sender({
        operation:record.operation,method:authority.method,path,
        payload:record.payload,idempotencyKey:record.idempotencyKey
      });
      assertOfflineDeliveryAcknowledged(response);
      assertCurrentOfflineSession(session);
      await deleteOutboxRecord(session,record.id);
      results.push({id:record.id,delivered:true,status:'synced',response});
    }catch(error){
      if(record.operation==='gym.workout.set'&&error?.code!=='OFFLINE_SESSION_CHANGED'){
        try{await updateGymOutboxFailure(session,record.id,error);}
        catch{
          results.push({id:record.id,delivered:false,status:'failed',error:'OFFLINE_OUTBOX_STATE_WRITE_FAILED'});
          break;
        }
      }
      results.push({id:record.id,delivered:false,
        status:error?.status===409?'conflict':'pending',
        error:String(error?.message||error)});
      break;
    }
  }
  return results;
}

export async function recoverOfflineRuntime() {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return { recovered: false, reason: 'service-worker-unavailable' };
  const registration = await navigator.serviceWorker.ready;
  const worker = registration.active || registration.waiting;
  if (!worker) return { recovered: false, reason: 'worker-unavailable' };
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => resolve({ recovered: false, reason: 'worker-timeout' }), 5000);
    channel.port1.onmessage = (event) => {
      clearTimeout(timeout);
      resolve(event.data || { recovered: true });
    };
    worker.postMessage({ type: 'RECOVER_CACHE' }, [channel.port2]);
  });
}
