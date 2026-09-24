// Stable public facade. The versioned implementation lives in store-v2.js so callers
// keep the same module contract while IndexedDB migrations evolve independently.
import * as storageV2 from "./store-v2.js";
import { enforceAdvancedLoadGroupScope } from "./advanced-group-scope.js";
import { assertWorkspaceInputSafety } from "./workspace-input-safety.js";
export * from "./store-v2.js";

function notifyGuard(result) {
  if (!result?.notice || typeof globalThis.dispatchEvent !== "function" || typeof globalThis.CustomEvent !== "function") return;
  globalThis.dispatchEvent(new CustomEvent("hipico:notice", {
    detail: { message: result.notice, type: result.blocked ? "warning" : "info" }
  }));
}

function validateWorkspace(workspace) {
  if (workspace) assertWorkspaceInputSafety(workspace);
  return workspace;
}

function recoverPersistedWorkspace(workspace) {
  if (workspace) storageV2.repairWorkspaceGroupScope(workspace, null);
  return validateWorkspace(workspace);
}

function hardenWorkspaceWrites(workspace) {
  validateWorkspace(workspace);
  const result = enforceAdvancedLoadGroupScope(workspace);
  validateWorkspace(workspace);
  notifyGuard(result);
  return workspace;
}

// Explicit read exports win over export* so persisted/imported/cloud-restored data
// is rejected before the application can render unsafe structural values.
export async function initializeStorage(fallbackFactory) {
  return recoverPersistedWorkspace(await storageV2.initializeStorage(fallbackFactory));
}

export async function loadLocalWorkspace(fallbackFactory) {
  return recoverPersistedWorkspace(await storageV2.loadLocalWorkspace(fallbackFactory));
}

export async function restoreSnapshot(snapshotId) {
  return recoverPersistedWorkspace(await storageV2.restoreSnapshot(snapshotId));
}

// Explicit exports win over export* so all application writes pass through the
// group-scope boundary before store-v2 clones them. The repair mutates the same
// in-memory object synchronously; render/cloud sync therefore observe the safe state.
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

// Explicit export preserves the historic API while adding the identity boundary
// needed to prevent one cloud account from inheriting another account's local
// pending mutations on a shared device.
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
