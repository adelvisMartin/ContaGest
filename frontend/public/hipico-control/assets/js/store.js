// Stable public facade. The versioned implementation lives in store-v2.js so callers
// keep the same module contract while IndexedDB migrations evolve independently.
import * as storageV2 from "./store-v2.js";
export * from "./store-v2.js";

// Explicit export wins over export* and preserves the historic API while adding the
// identity boundary needed to prevent one cloud account from inheriting another
// account's local pending mutations on a shared device.
export async function saveCloudSession(session) {
  if (!session) {
    await storageV2.clearPrivateSessionState();
    return null;
  }
  const binding = session?.user?.id ? await storageV2.bindCloudIdentity(session.user.id) : { changed: false };
  await storageV2.saveCloudSession(session);
  if (binding.changed && typeof globalThis.location?.reload === "function") {
    // The previous owner's primary workspace was archived before this point. Reload
    // immediately so application memory cannot merge it into the new identity.
    queueMicrotask(() => globalThis.location.reload());
  }
  return session;
}
