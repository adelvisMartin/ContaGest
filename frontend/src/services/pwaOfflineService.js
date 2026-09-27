const CACHE_PREFIX = 'contagest-ve-v563-session-';
const DB_PREFIX = 'contagest-offline-v563-';
const AUTH_SESSION_KEY = 'contagest_auth_session';
const LEGACY_STATE_PREFIX = 'contagest_ve_enterprise_v7_state';

export const OUTBOX_ALLOWLIST = Object.freeze({
  'analytics.event': Object.freeze({ method: 'POST', path: '/analytics/events' })
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

function sessionCacheName(session) {
  return `${CACHE_PREFIX}${sessionScope(session)}`;
}

function dbName(session) {
  return `${DB_PREFIX}${sessionScope(session)}`;
}

function postToServiceWorker(message) {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
  const target = navigator.serviceWorker.controller;
  if (target) target.postMessage(message);
  navigator.serviceWorker.ready.then((registration) => {
    const worker = registration.active || registration.waiting || registration.installing;
    if (worker && worker !== target) worker.postMessage(message);
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
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

async function purgeIndexedDb(session) {
  if (typeof indexedDB === 'undefined') return;
  const targeted = new Set([dbName(session)]);
  if (typeof indexedDB.databases === 'function') {
    const databases = await indexedDB.databases().catch(() => []);
    for (const database of databases || []) {
      const name = String(database?.name || '');
      if (name === dbName(session) || name.startsWith(`${DB_PREFIX}${sessionScope(session)}`)) targeted.add(name);
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
    const sensitivePrefixes = ['cg_', 'contagest_', 'hipico_'];
    const keys = [];
    for (let index = 0; index < sessionStorage.length; index += 1) keys.push(sessionStorage.key(index));
    for (const key of keys.filter(Boolean)) {
      if (sensitivePrefixes.some((prefix) => key.startsWith(prefix))) sessionStorage.removeItem(key);
    }
  }
}

export async function purgeOfflineSession(session) {
  const scopeToken = sessionScope(session);
  purgeWebStorage(session);
  postToServiceWorker({ type: 'CLEAR_SESSION_DATA', scopeToken });
  if (typeof caches !== 'undefined') {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name === sessionCacheName(session) || name.startsWith(`${CACHE_PREFIX}${scopeToken}`))
      .map((name) => caches.delete(name)));
  }
  await purgeIndexedDb(session);
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
  const authority = OUTBOX_ALLOWLIST[operation];
  if (!authority) {
    const error = new Error(`Operación offline no autorizada: ${operation}`);
    error.code = 'OFFLINE_OPERATION_NOT_ALLOWED';
    throw error;
  }
  if (!session?.tenantId || !session?.user?.id) throw new Error('Se requiere sesión tenant/user para usar el outbox offline.');
  const key = String(idempotencyKey || '').trim();
  if (key.length < 8) throw new Error('idempotencyKey es obligatorio para operaciones offline reintentables.');
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
      payload: payload ?? {},
      createdAt: new Date().toISOString(),
      attempts: 0,
      authority
    };
    store.put(record);
    await transactionPromise(transaction);
    return record;
  } finally {
    database.close();
  }
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

export async function flushOfflineOutbox(session, sender) {
  if (typeof sender !== 'function') throw new TypeError('sender debe ser una función.');
  const records = await readOutbox(session);
  const results = [];
  for (const record of records.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) {
    if (!OUTBOX_ALLOWLIST[record.operation]) continue;
    try {
      const response = await sender({
        operation: record.operation,
        method: record.authority.method,
        path: record.authority.path,
        payload: record.payload,
        idempotencyKey: record.idempotencyKey
      });
      await deleteOutboxRecord(session, record.id);
      results.push({ id: record.id, delivered: true, response });
    } catch (error) {
      results.push({ id: record.id, delivered: false, error: String(error?.message || error) });
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
