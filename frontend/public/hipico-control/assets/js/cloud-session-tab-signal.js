// Cross-tab invalidation for cloud identities only. Neither BroadcastChannel nor
// the storage-event fallback receives user IDs, JWTs, refresh tokens or group data.
// A signal revokes the receiver's in-memory authority; durable cleanup is owned
// by supabase.js and store-v2.js.
const CHANNEL_NAME = 'hipico-cloud-session-invalidation-v1';
const STORAGE_KEY = 'hipico-cloud-session-invalidation-event-v1';
const listeners = new Set();
let channel = null;
let initialized = false;

function notifyLocalListeners() {
  for (const listener of listeners) {
    try { listener(); } catch { /* One subscriber must not block revocation. */ }
  }
}

function initializeTransport() {
  if (initialized) return;
  initialized = true;
  if (typeof window === 'undefined') return;
  if (typeof globalThis.BroadcastChannel === 'function') {
    try {
      channel = new globalThis.BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => {
        if (event?.data?.type === 'invalidate') notifyLocalListeners();
      };
    } catch { channel = null; }
  }
  if (!channel) {
    window.addEventListener('storage', (event) => {
      if (event?.key === STORAGE_KEY && event.newValue) notifyLocalListeners();
    });
  }
}

export function subscribeCloudSessionInvalidation(listener) {
  if (typeof listener !== 'function') throw new TypeError('Cloud session subscriber must be a function');
  listeners.add(listener);
  initializeTransport();
  return () => listeners.delete(listener);
}

export function signalOtherTabsCloudSessionInvalidation() {
  initializeTransport();
  if (channel) {
    try {
      channel.postMessage({ type: 'invalidate' });
      return true;
    } catch { /* Fall back to a non-sensitive storage event. */ }
  }
  if (typeof window === 'undefined') return false;
  try {
    const storage = window.localStorage;
    if (!storage) return false;
    const nonce = typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID() : String(Math.random());
    storage.setItem(STORAGE_KEY, `${Date.now()}:${nonce}`);
    return true;
  } catch {
    return false;
  }
}
