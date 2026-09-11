// Stable public facade. The versioned implementation lives in store-v2.js so callers
// keep the same module contract while IndexedDB migrations evolve independently.
import * as storageV2 from "./store-v2.js";
import { enforceAdvancedLoadGroupScope } from "./advanced-group-scope.js";
export * from "./store-v2.js";

function notifyGuard(result) {
  if (!result?.notice || typeof globalThis.dispatchEvent !== "function" || typeof globalThis.CustomEvent !== "function") return;
  globalThis.dispatchEvent(new CustomEvent("hipico:notice", {
    detail: { message: result.notice, type: result.blocked ? "warning" : "info" }
  }));
}

function hardenWorkspaceWrites(workspace) {
  const result = enforceAdvancedLoadGroupScope(workspace);
  notifyGuard(result);
  return workspace;
}

// Explicit exports win over export* so every application write passes through the
// group-scope boundary before store-v2 clones it. The repair mutates the same
// in-memory object synchronously; render/cloud sync therefore observe safe state.
export function queueWorkspaceSave(workspace, options = {}) {
  hardenWorkspaceWrites(workspace);
  return storageV2.queueWorkspaceSave(workspace, options);
}

export async function saveLocalWorkspace(workspace, options = {}) {
  hardenWorkspaceWrites(workspace);
  return storageV2.saveLocalWorkspace(workspace, options);
}

// Cloud audit enqueueing yields one microtask so persist() can run the synchronous
// workspace guard first and any corrected entityId/payload is what reaches outbox.
export async function enqueueOutbox(event) {
  await Promise.resolve();
  return storageV2.enqueueOutbox(event);
}

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
