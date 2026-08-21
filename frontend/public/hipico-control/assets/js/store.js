const DB_NAME = "hipico-control";
const DB_VERSION = 1;
const WORKSPACE_ID = "primary";
const LEGACY_WORKSPACE_KEY = "hipico-control-workspace-v1";
const LEGACY_SESSION_KEY = "hipico-control-cloud-session";
const LEGACY_MODE_KEY = "hipico-control-mode";
const SNAPSHOT_LIMIT = 30;
let databasePromise = null;
let pendingWorkspace = null;
let pendingWriteOptions = null;
let pendingWriteWaiters = [];
let drainPromise = null;
let pendingWrites = 0;
function requestResult(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("IndexedDB no respondió."));
    });
}
function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error || new Error("La transacción fue cancelada."));
        transaction.onerror = () => reject(transaction.error || new Error("La transacción falló."));
    });
}
export function openDatabase() {
    if (databasePromise)
        return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains("workspaces")) {
                database.createObjectStore("workspaces", { keyPath: "id" });
            }
            if (!database.objectStoreNames.contains("settings")) {
                database.createObjectStore("settings", { keyPath: "key" });
            }
            if (!database.objectStoreNames.contains("outbox")) {
                const store = database.createObjectStore("outbox", { keyPath: "id" });
                store.createIndex("createdAt", "createdAt", { unique: false });
            }
            if (!database.objectStoreNames.contains("snapshots")) {
                const store = database.createObjectStore("snapshots", { keyPath: "id" });
                store.createIndex("createdAt", "createdAt", { unique: false });
            }
        };
        request.onsuccess = () => {
            const database = request.result;
            database.onversionchange = () => {
                database.close();
                databasePromise = null;
            };
            resolve(database);
        };
        request.onerror = () => {
            databasePromise = null;
            reject(request.error || new Error("No se pudo abrir IndexedDB."));
        };
        request.onblocked = () => {
            databasePromise = null;
            reject(new Error("Cierra otras pestañas de Control Hípico para actualizar la base local."));
        };
    });
    return databasePromise;
}
async function getRecord(storeName, key) {
    const database = await openDatabase();
    const transaction = database.transaction(storeName, "readonly");
    const done = transactionDone(transaction);
    const value = await requestResult(transaction.objectStore(storeName).get(key));
    await done;
    return value;
}
async function putRecord(storeName, value) {
    const database = await openDatabase();
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value);
    await transactionDone(transaction);
    return value;
}
async function deleteRecord(storeName, key) {
    const database = await openDatabase();
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(key);
    await transactionDone(transaction);
}
async function getAllRecords(storeName) {
    const database = await openDatabase();
    const transaction = database.transaction(storeName, "readonly");
    const done = transactionDone(transaction);
    const store = transaction.objectStore(storeName);
    let values;
    if (typeof store.getAll === "function")
        values = await requestResult(store.getAll());
    else
        values = await new Promise((resolve, reject) => { const rows = []; const request = store.openCursor(); request.onerror = () => reject(request.error || new Error("IndexedDB no pudo recorrer registros.")); request.onsuccess = () => { const cursor = request.result; if (!cursor)
            return resolve(rows); rows.push(cursor.value); cursor.continue(); }; });
    await done;
    return values || [];
}
function readLegacyJson(key) {
    var _a;
    try {
        const raw = (_a = globalThis.localStorage) === null || _a === void 0 ? void 0 : _a.getItem(key);
        return raw ? JSON.parse(raw) : null;
    }
    catch (_b) {
        return null;
    }
}
function readLegacyText(key) {
    var _a;
    try {
        return ((_a = globalThis.localStorage) === null || _a === void 0 ? void 0 : _a.getItem(key)) || null;
    }
    catch (_b) {
        return null;
    }
}
function clearLegacyStorage() {
    var _a, _b, _c;
    try {
        (_a = globalThis.localStorage) === null || _a === void 0 ? void 0 : _a.removeItem(LEGACY_WORKSPACE_KEY);
        (_b = globalThis.localStorage) === null || _b === void 0 ? void 0 : _b.removeItem(LEGACY_SESSION_KEY);
        (_c = globalThis.localStorage) === null || _c === void 0 ? void 0 : _c.removeItem(LEGACY_MODE_KEY);
    }
    catch (_d) {
        // La migración ya quedó en IndexedDB; un fallo al limpiar no bloquea la app.
    }
}
export async function initializeStorage(fallbackFactory) {
    await openDatabase();
    let workspaceRecord = await getRecord("workspaces", WORKSPACE_ID);
    const legacyWorkspace = readLegacyJson(LEGACY_WORKSPACE_KEY);
    const legacyMode = readLegacyText(LEGACY_MODE_KEY);
    const legacySession = readLegacyJson(LEGACY_SESSION_KEY);
    if (!workspaceRecord) {
        const workspace = legacyWorkspace || fallbackFactory();
        await putRecord("workspaces", {
            id: WORKSPACE_ID,
            workspace: structuredClone(workspace),
            updatedAt: new Date().toISOString()
        });
        workspaceRecord = { id: WORKSPACE_ID, workspace };
    }
    if (!(await getRecord("settings", "mode")) && legacyMode) {
        await putRecord("settings", { key: "mode", value: legacyMode });
    }
    if (!(await getRecord("settings", "cloudSession")) && legacySession) {
        await putRecord("settings", { key: "cloudSession", value: legacySession });
    }
    clearLegacyStorage();
    return structuredClone(workspaceRecord.workspace);
}
export async function loadLocalWorkspace(fallbackFactory) {
    const record = await getRecord("workspaces", WORKSPACE_ID);
    if (record === null || record === void 0 ? void 0 : record.workspace)
        return structuredClone(record.workspace);
    const workspace = fallbackFactory();
    await saveLocalWorkspace(workspace, { snapshot: false });
    return structuredClone(workspace);
}
function mergeWriteOptions(current, next) {
    if (!current)
        return { snapshot: Boolean(next.snapshot), reason: next.reason || "auto" };
    return {
        snapshot: Boolean(current.snapshot || next.snapshot),
        reason: next.snapshot ? (next.reason || current.reason) : current.reason
    };
}
async function drainWorkspaceWrites() {
    while (pendingWorkspace) {
        const workspace = pendingWorkspace;
        const options = pendingWriteOptions || {};
        const waiters = pendingWriteWaiters;
        pendingWorkspace = null;
        pendingWriteOptions = null;
        pendingWriteWaiters = [];
        try {
            const saved = await saveLocalWorkspace(workspace, options);
            waiters.forEach(({ resolve }) => resolve(saved));
        }
        catch (error) {
            waiters.forEach(({ reject }) => reject(error));
        }
    }
    drainPromise = null;
    if (pendingWorkspace)
        drainPromise = Promise.resolve().then(drainWorkspaceWrites);
}
export function queueWorkspaceSave(workspace, options = {}) {
    pendingWorkspace = structuredClone(workspace);
    pendingWriteOptions = mergeWriteOptions(pendingWriteOptions, options);
    pendingWrites += 1;
    const result = new Promise((resolve, reject) => {
        pendingWriteWaiters.push({ resolve, reject });
    }).finally(() => {
        pendingWrites = Math.max(0, pendingWrites - 1);
    });
    if (!drainPromise)
        drainPromise = Promise.resolve().then(drainWorkspaceWrites);
    return result;
}
export async function flushWorkspaceWrites() {
    if (drainPromise)
        await drainPromise;
}
export function hasPendingWrites() {
    return pendingWrites > 0 || Boolean(pendingWorkspace || drainPromise);
}
export async function saveLocalWorkspace(workspace, { snapshot = false, reason = "manual" } = {}) {
    const savedAt = new Date().toISOString();
    const value = structuredClone(workspace);
    value.updatedAt || (value.updatedAt = savedAt);
    const database = await openDatabase();
    const stores = snapshot ? ["workspaces", "snapshots"] : ["workspaces"];
    const transaction = database.transaction(stores, "readwrite");
    transaction.objectStore("workspaces").put({ id: WORKSPACE_ID, workspace: value, updatedAt: savedAt });
    if (snapshot) {
        transaction.objectStore("snapshots").put({
            id: `snapshot-${crypto.randomUUID()}`,
            reason,
            version: Number(value.version || 0),
            createdAt: savedAt,
            workspace: value
        });
    }
    await transactionDone(transaction);
    if (snapshot)
        await trimSnapshots(SNAPSHOT_LIMIT);
    return value;
}
export async function createSnapshot(workspace, reason = "manual") {
    await flushWorkspaceWrites();
    return saveLocalWorkspace(workspace, { snapshot: true, reason });
}
export async function listSnapshots() {
    const snapshots = await getAllRecords("snapshots");
    return snapshots.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
export async function restoreSnapshot(snapshotId) {
    await flushWorkspaceWrites();
    const snapshot = await getRecord("snapshots", snapshotId);
    if (!(snapshot === null || snapshot === void 0 ? void 0 : snapshot.workspace))
        throw new Error("No se encontró la copia seleccionada.");
    const current = await getRecord("workspaces", WORKSPACE_ID);
    if (current === null || current === void 0 ? void 0 : current.workspace) {
        await saveLocalWorkspace(current.workspace, { snapshot: true, reason: "antes-de-restaurar" });
    }
    await saveLocalWorkspace(snapshot.workspace, { snapshot: false });
    return structuredClone(snapshot.workspace);
}
async function trimSnapshots(limit) {
    const snapshots = await listSnapshots();
    await Promise.all(snapshots.slice(limit).map((snapshot) => deleteRecord("snapshots", snapshot.id)));
}
export async function clearLocalWorkspace({ preserveSnapshots = true } = {}) {
    await flushWorkspaceWrites();
    await deleteRecord("workspaces", WORKSPACE_ID);
    const database = await openDatabase();
    const stores = preserveSnapshots ? ["outbox"] : ["outbox", "snapshots"];
    for (const storeName of stores) {
        const transaction = database.transaction(storeName, "readwrite");
        transaction.objectStore(storeName).clear();
        await transactionDone(transaction);
    }
}
export async function getSetting(key, fallback = null) {
    const record = await getRecord("settings", key);
    return record ? structuredClone(record.value) : fallback;
}
export async function setSetting(key, value) {
    if (value === undefined || value === null)
        return deleteRecord("settings", key);
    return putRecord("settings", { key, value: structuredClone(value) });
}
export const getAppMode = () => getSetting("mode", null);
export const setAppMode = (mode) => setSetting("mode", mode);
export const loadCloudSession = () => getSetting("cloudSession", null);
export const saveCloudSession = (session) => setSetting("cloudSession", session);
export async function enqueueOutbox(event) {
    const value = Object.assign(Object.assign({}, structuredClone(event)), { id: event.id || `outbox-${crypto.randomUUID()}`, createdAt: event.createdAt || new Date().toISOString() });
    await putRecord("outbox", value);
    return value;
}
export async function listOutbox() {
    const rows = await getAllRecords("outbox");
    return rows.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}
export async function removeOutbox(id) {
    await deleteRecord("outbox", id);
}
export async function outboxCount() {
    return (await getAllRecords("outbox")).length;
}
export async function requestPersistentStorage() {
    var _a;
    if (!((_a = navigator.storage) === null || _a === void 0 ? void 0 : _a.persist))
        return false;
    return navigator.storage.persist();
}
export async function storageDiagnostics() {
    var _a, _b, _c, _d;
    const [estimate, persisted, outbox, snapshots] = await Promise.all([
        (_b = (_a = navigator.storage) === null || _a === void 0 ? void 0 : _a.estimate) === null || _b === void 0 ? void 0 : _b.call(_a),
        (_d = (_c = navigator.storage) === null || _c === void 0 ? void 0 : _c.persisted) === null || _d === void 0 ? void 0 : _d.call(_c),
        outboxCount(),
        listSnapshots()
    ]);
    return {
        engine: "IndexedDB",
        persisted: Boolean(persisted),
        usage: Number((estimate === null || estimate === void 0 ? void 0 : estimate.usage) || 0),
        quota: Number((estimate === null || estimate === void 0 ? void 0 : estimate.quota) || 0),
        pendingWrites,
        outbox,
        snapshots: snapshots.length
    };
}
export function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadFile(filename, content, type = "application/json") {
    downloadBlob(filename, new Blob([content], { type }));
}
