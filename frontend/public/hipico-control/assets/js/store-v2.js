import { SAFE_INTERNAL_ID } from "./workspace-input-safety.js";

const DB_NAME = "hipico-control";
export const DB_VERSION = 2;
export const LOCAL_SCHEMA_VERSION = 2;
const WORKSPACE_ID = "primary";
const LEGACY_WORKSPACE_KEY = "hipico-control-workspace-v1";
const LEGACY_SESSION_KEY = "hipico-control-cloud-session";
const LEGACY_MODE_KEY = "hipico-control-mode";
const SNAPSHOT_LIMIT = 30;
const QUOTA_PRESSURE_RATIO = 0.9;
const OUTBOX_VOLATILE_FIELDS = new Set(["id", "idempotencyKey", "createdAt", "updatedAt", "attempts", "status", "lastError", "nextAttemptAt"]);
let databasePromise = null;
let pendingWorkspace = null;
let pendingWriteOptions = null;
let pendingWriteWaiters = [];
let drainPromise = null;
let pendingWrites = 0;
let lastWorkspaceSnapshot = null;

const nowIso = () => new Date().toISOString();
function requestResult(request) { return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error || new Error("IndexedDB no respondió.")); }); }
function transactionDone(transaction) { return new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error || new Error("La transacción fue cancelada.")); transaction.onerror = () => reject(transaction.error || new Error("La transacción falló.")); }); }
function isQuotaError(error) { return error?.name === "QuotaExceededError" || error?.code === 22 || /quota/i.test(String(error?.message || "")); }
function ensureOutboxIndexes(store) {
  if (!store.indexNames.contains("createdAt")) store.createIndex("createdAt", "createdAt", { unique: false });
  if (!store.indexNames.contains("idempotencyKey")) store.createIndex("idempotencyKey", "idempotencyKey", { unique: true });
}

function firstGroupId(workspace) {
  return String(workspace?.config?.groups?.[0]?.id || workspace?.config?.whatsappGroups?.[0]?.id || "group-1");
}
function currentGroupId(workspace, event = null) {
  return String(event?.groupId || workspace?.config?.activeGroupId || workspace?.config?.activeWhatsappGroupId || firstGroupId(workspace));
}
function validCommission(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : null;
}
function validExchangeRate(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
function groupById(workspace, groupId) {
  return (workspace?.config?.groups || workspace?.config?.whatsappGroups || []).find((group) => String(group?.id || "") === String(groupId || "")) || null;
}
function syncLegacyFinancialConfig(workspace, previous = null) {
  if (!workspace || typeof workspace !== "object") return workspace;
  workspace.config ||= {};
  const groupId = currentGroupId(workspace);
  const group = groupById(workspace, groupId);
  if (!group) return workspace;
  const previousGroup = groupById(previous, groupId);
  const fallbackCommission = validCommission(previousGroup?.commission) ?? validCommission(workspace.config.commission) ?? 0.05;
  const fallbackRate = validExchangeRate(previousGroup?.exchangeRate) ?? validExchangeRate(workspace.config.exchangeRate) ?? 1;
  group.commission = validCommission(group.commission) ?? fallbackCommission;
  group.exchangeRate = validExchangeRate(group.exchangeRate) ?? fallbackRate;
  workspace.config.commission = group.commission;
  workspace.config.exchangeRate = group.exchangeRate;
  if (group.currency) workspace.config.currency = group.currency;
  if (group.footerMessage != null) workspace.config.footerMessage = String(group.footerMessage);

  for (const race of workspace.races || []) {
    const raceGroup = groupById(workspace, race.groupId || firstGroupId(workspace));
    const raceCommission = validCommission(race.commission);
    race.commission = raceCommission ?? validCommission(raceGroup?.commission) ?? 0.05;
    race.exchangeRate = validExchangeRate(race.exchangeRate) ?? validExchangeRate(raceGroup?.exchangeRate) ?? 1;
  }
  return workspace;
}
function daySortValue(day) {
  const timestamp = Date.parse(`${String(day?.date || "1970-01-01")}T12:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
function preferNewestOpenDay(workspace) {
  const days = Array.isArray(workspace?.days) ? workspace.days : [];
  const fallback = firstGroupId(workspace);
  const groups = [...new Set(days.map((day) => String(day?.groupId || fallback)))];
  for (const groupId of groups) {
    const indices = [];
    const rows = [];
    days.forEach((day, index) => {
      if (String(day?.groupId || fallback) === groupId) { indices.push(index); rows.push(day); }
    });
    const sorted = [...rows].sort((left, right) => {
      const leftOpen = left?.status === "open";
      const rightOpen = right?.status === "open";
      if (leftOpen !== rightOpen) return leftOpen ? -1 : 1;
      const difference = daySortValue(left) - daySortValue(right);
      return leftOpen ? -difference : difference;
    });
    indices.forEach((index, offset) => { days[index] = sorted[offset]; });
  }
  return workspace;
}
function matchingLoadedBet(bet, advanced) {
  return String(bet?.play || "") === String(advanced?.play || "")
    && String(bet?.horse || "") === String(advanced?.horse || "")
    && Number(bet?.amount || 0) === Number(advanced?.amount || 0)
    && String(bet?.playerId || "") === String(advanced?.playerId || "")
    && String(bet?.receiverId || "") === String(advanced?.receiverId || "")
    && String(bet?.createdAt || "") === String(advanced?.createdAt || "");
}
function ensureDayForGroup(workspace, groupId, date) {
  const existing = (workspace.days || []).find((day) => String(day.groupId || "") === groupId && String(day.date || "") === String(date || ""));
  if (existing) return existing;
  const day = { id: `day-${crypto.randomUUID()}`, groupId, date, status: "open", closure: null };
  workspace.days ||= [];
  workspace.days.push(day);
  return day;
}
function repairAdvancedLoad(workspace, event) {
  const groupId = currentGroupId(workspace, event);
  const wrongRace = (workspace.races || []).find((race) => String(race.id) === String(event.entityId));
  if (!wrongRace || String(wrongRace.groupId || firstGroupId(workspace)) === groupId) {
    if (wrongRace) {
      wrongRace.groupId ||= groupId;
      for (const bet of wrongRace.bets || []) bet.groupId ||= groupId;
    }
    return;
  }

  const advanced = (workspace.advancedBets || []).filter((bet) => String(bet.groupId || firstGroupId(workspace)) === groupId && bet.status === "loaded" && String(bet.loadedRaceId || "") === String(wrongRace.id));
  if (!advanced.length) return;

  const day = ensureDayForGroup(workspace, groupId, wrongRace.date);
  let target = (workspace.races || []).find((race) => String(race.groupId || firstGroupId(workspace)) === groupId
    && String(race.date || "") === String(wrongRace.date || "")
    && String(race.racetrack || "") === String(wrongRace.racetrack || "")
    && Number(race.number) === Number(wrongRace.number));
  if (!target) {
    target = {
      ...structuredClone(wrongRace),
      id: `race-${crypto.randomUUID()}`,
      groupId,
      dayId: day.id,
      bets: [],
      board: Array.from({ length: 6 }, (_, index) => String(wrongRace.board?.[index] || "")),
      boardPositions: Array.from({ length: 6 }, (_, index) => Number(wrongRace.boardPositions?.[index] || index + 1))
    };
    workspace.races.push(target);
  }
  target.bets ||= [];

  const moved = [];
  wrongRace.bets = (wrongRace.bets || []).filter((bet) => {
    const match = advanced.find((row) => matchingLoadedBet(bet, row));
    if (!match) return true;
    moved.push({ ...bet, groupId });
    return false;
  });
  for (const bet of moved) {
    if (!target.bets.some((existing) => matchingLoadedBet(existing, bet))) target.bets.push(bet);
  }
  for (const row of advanced) row.loadedRaceId = target.id;
  event.entityId = target.id;
  workspace.config ||= {};
  workspace.config.activeRaceByGroup ||= {};
  workspace.config.activeRaceByGroup[groupId] = target.id;
  if (String(workspace.config.activeGroupId || workspace.config.activeWhatsappGroupId || "") === groupId) workspace.activeRaceId = target.id;
}
function repairDayClose(workspace, event) {
  const groupId = currentGroupId(workspace, event);
  const fallback = firstGroupId(workspace);
  const openCandidates = (workspace.days || []).filter((day) => !day.groupId && day.status === "open");
  for (const day of openCandidates) day.groupId = groupId;
  for (const day of workspace.days || []) day.groupId ||= fallback;
}
function repairWeekClose(workspace, previous, event) {
  const groupId = currentGroupId(workspace, event);
  const previousById = new Map((previous?.participants || []).map((participant) => [String(participant.id), participant]));
  for (const participant of workspace.participants || []) {
    const participantGroup = String(participant.groupId || firstGroupId(workspace));
    if (participantGroup === groupId) continue;
    const before = previousById.get(String(participant.id));
    if (before) participant.previousWeekBalance = Number(before.previousWeekBalance ?? before.openingBalance ?? 0);
  }
}
function tagUnscoped(workspace) {
  const fallback = firstGroupId(workspace);
  for (const key of ["participants", "days", "races", "advancedBets", "movements", "exchangeRates", "weekClosures", "pollas", "audit", "syncQueue"]) {
    for (const item of workspace?.[key] || []) item.groupId ||= fallback;
  }
  for (const race of workspace?.races || []) for (const bet of race.bets || []) bet.groupId ||= race.groupId || fallback;
}

function referencedGroupIds(workspace) {
  const references = new Set();
  const add = (value) => {
    const groupId = String(value || "").trim();
    if (groupId) references.add(groupId);
  };
  const config = workspace?.config || {};
  add(config.activeGroupId);
  add(config.activeWhatsappGroupId);
  for (const groupId of config.captureGroupIds || []) add(groupId);
  for (const groupId of Object.keys(config.activeRaceByGroup || {})) add(groupId);
  for (const key of ["participants", "days", "races", "advancedBets", "movements", "exchangeRates", "weekClosures", "pollas", "audit", "syncQueue"]) {
    for (const item of workspace?.[key] || []) add(item?.groupId);
  }
  for (const race of workspace?.races || []) {
    for (const bet of race?.bets || []) add(bet?.groupId);
  }
  return references;
}

function recoveredGroupDefinition(workspace, groupId, index, legacyById) {
  const legacy = legacyById.get(groupId);
  if (legacy) return structuredClone(legacy);

  const config = workspace?.config || {};
  const active = String(config.activeGroupId || config.activeWhatsappGroupId || "") === groupId
    || (config.captureGroupIds || []).some((candidate) => String(candidate) === groupId);
  const colors = ["#526f86", "#8d7545", "#35705a", "#721522"];
  return {
    id: groupId,
    name: `Grupo recuperado ${index + 1}`,
    companyName: String(config.clubName || "CONTROL HÍPICO"),
    color: colors[index % colors.length],
    currency: ["Bs.", "USD"].includes(config.currency) ? config.currency : "Bs.",
    exchangeRate: validExchangeRate(config.exchangeRate) ?? 160,
    commission: validCommission(config.commission) ?? 0.05,
    showConversion: true,
    autoRate: false,
    footerMessage: String(config.footerMessage || ""),
    clientLabel: "Participantes",
    active
  };
}

function recoverOrphanGroupDefinitions(workspace) {
  if (!workspace || typeof workspace !== "object") return 0;
  workspace.config ||= {};
  const config = workspace.config;
  const canonical = Array.isArray(config.groups) && config.groups.length
    ? config.groups
    : (Array.isArray(config.whatsappGroups) ? config.whatsappGroups : []);
  const groups = [...canonical];
  const legacyById = new Map((config.whatsappGroups || [])
    .filter((group) => SAFE_INTERNAL_ID.test(String(group?.id || "")))
    .map((group) => [String(group.id), group]));
  const known = new Set(groups.map((group) => String(group?.id || "")).filter(Boolean));
  let recovered = 0;

  for (const groupId of referencedGroupIds(workspace)) {
    if (known.has(groupId) || !SAFE_INTERNAL_ID.test(groupId)) continue;
    groups.push(recoveredGroupDefinition(workspace, groupId, groups.length, legacyById));
    known.add(groupId);
    recovered += 1;
  }

  if (recovered || !Array.isArray(config.groups) || !config.groups.length) {
    config.groups = groups;
    config.whatsappGroups = groups;
  }
  return recovered;
}

/**
 * Repairs known legacy multigroup writes before the same in-memory workspace is cloned
 * and persisted. Historical audit events are never replayed as repair commands when no
 * previous snapshot exists; migration-only loads only tag legacy records deterministically.
 */
export function repairWorkspaceGroupScope(workspace, previous = lastWorkspaceSnapshot) {
  if (!workspace || typeof workspace !== "object") return workspace;
  const previousAuditIds = new Set((previous?.audit || []).map((event) => String(event.id)));
  const newEvents = previous
    ? (workspace.audit || []).filter((event) => !previousAuditIds.has(String(event.id))).slice().reverse()
    : [];
  for (const event of newEvents) {
    if (event.action === "advanced_loaded") repairAdvancedLoad(workspace, event);
    else if (event.action === "day_closed") repairDayClose(workspace, event);
    else if (event.action === "week_closed") repairWeekClose(workspace, previous, event);
  }
  tagUnscoped(workspace);
  if (!previous) recoverOrphanGroupDefinitions(workspace);
  preferNewestOpenDay(workspace);
  syncLegacyFinancialConfig(workspace, previous);
  return workspace;
}

export function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const database = request.result; const tx = request.transaction;
      if (!database.objectStoreNames.contains("workspaces")) database.createObjectStore("workspaces", { keyPath: "id" });
      if (!database.objectStoreNames.contains("settings")) database.createObjectStore("settings", { keyPath: "key" });
      if (!database.objectStoreNames.contains("outbox")) ensureOutboxIndexes(database.createObjectStore("outbox", { keyPath: "id" }));
      else if (event.oldVersion < 2) ensureOutboxIndexes(tx.objectStore("outbox"));
      if (!database.objectStoreNames.contains("snapshots")) { const store = database.createObjectStore("snapshots", { keyPath: "id" }); store.createIndex("createdAt", "createdAt", { unique: false }); }
      if (!database.objectStoreNames.contains("syncMeta")) database.createObjectStore("syncMeta", { keyPath: "key" });
    };
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); databasePromise = null; }; resolve(db); };
    request.onerror = () => { databasePromise = null; reject(request.error || new Error("No se pudo abrir IndexedDB.")); };
    request.onblocked = () => { databasePromise = null; reject(new Error("Cierra otras pestañas de Control Hípico para actualizar la base local.")); };
  });
  return databasePromise;
}
async function getRecord(storeName, key) { const db = await openDatabase(); const tx = db.transaction(storeName, "readonly"); const done = transactionDone(tx); const value = await requestResult(tx.objectStore(storeName).get(key)); await done; return value; }
async function putRecord(storeName, value) { const db = await openDatabase(); const tx = db.transaction(storeName, "readwrite"); tx.objectStore(storeName).put(value); await transactionDone(tx); return value; }
async function deleteRecord(storeName, key) { const db = await openDatabase(); const tx = db.transaction(storeName, "readwrite"); tx.objectStore(storeName).delete(key); await transactionDone(tx); }
async function clearStore(storeName) { const db = await openDatabase(); const tx = db.transaction(storeName, "readwrite"); tx.objectStore(storeName).clear(); await transactionDone(tx); }
async function getAllRecords(storeName) {
  const db = await openDatabase(); const tx = db.transaction(storeName, "readonly"); const done = transactionDone(tx); const store = tx.objectStore(storeName);
  const values = typeof store.getAll === "function" ? await requestResult(store.getAll()) : await new Promise((resolve, reject) => { const rows = []; const request = store.openCursor(); request.onerror = () => reject(request.error); request.onsuccess = () => { const cursor = request.result; if (!cursor) return resolve(rows); rows.push(cursor.value); cursor.continue(); }; });
  await done; return values || [];
}
function readLegacyJson(key) { try { const raw = globalThis.localStorage?.getItem(key); return raw ? JSON.parse(raw) : null; } catch { return null; } }
function readLegacyText(key) { try { return globalThis.localStorage?.getItem(key) || null; } catch { return null; } }
function clearLegacyStorage() { try { for (const key of [LEGACY_WORKSPACE_KEY, LEGACY_SESSION_KEY, LEGACY_MODE_KEY]) globalThis.localStorage?.removeItem(key); } catch {} }

export async function initializeStorage(fallbackFactory) {
  await openDatabase();
  await putRecord("syncMeta", { key: "schema", version: LOCAL_SCHEMA_VERSION, migratedAt: nowIso() });
  let record = await getRecord("workspaces", WORKSPACE_ID);
  const legacyWorkspace = readLegacyJson(LEGACY_WORKSPACE_KEY), legacyMode = readLegacyText(LEGACY_MODE_KEY), legacySession = readLegacyJson(LEGACY_SESSION_KEY);
  if (!record) { const workspace = legacyWorkspace || fallbackFactory(); repairWorkspaceGroupScope(workspace, null); record = { id: WORKSPACE_ID, workspace: structuredClone(workspace), updatedAt: nowIso(), schemaVersion: LOCAL_SCHEMA_VERSION }; await putRecord("workspaces", record); }
  if (!(await getRecord("settings", "mode")) && legacyMode) await putRecord("settings", { key: "mode", value: legacyMode });
  if (!(await getRecord("settings", "cloudSession")) && legacySession) await putRecord("settings", { key: "cloudSession", value: legacySession });
  clearLegacyStorage(); lastWorkspaceSnapshot = structuredClone(record.workspace); return structuredClone(record.workspace);
}
export async function loadLocalWorkspace(fallbackFactory) { const record = await getRecord("workspaces", WORKSPACE_ID); if (record?.workspace) { lastWorkspaceSnapshot = structuredClone(record.workspace); return structuredClone(record.workspace); } const workspace = fallbackFactory(); await saveLocalWorkspace(workspace, { snapshot: false }); return structuredClone(workspace); }
function mergeWriteOptions(current, next) { if (!current) return { snapshot: Boolean(next.snapshot), reason: next.reason || "auto" }; return { snapshot: Boolean(current.snapshot || next.snapshot), reason: next.snapshot ? (next.reason || current.reason) : current.reason }; }
async function drainWorkspaceWrites() { while (pendingWorkspace) { const workspace = pendingWorkspace, options = pendingWriteOptions || {}, waiters = pendingWriteWaiters; pendingWorkspace = null; pendingWriteOptions = null; pendingWriteWaiters = []; try { const saved = await saveLocalWorkspace(workspace, options); waiters.forEach(({ resolve }) => resolve(saved)); } catch (error) { waiters.forEach(({ reject }) => reject(error)); } } drainPromise = null; if (pendingWorkspace) drainPromise = Promise.resolve().then(drainWorkspaceWrites); }
export function queueWorkspaceSave(workspace, options = {}) { repairWorkspaceGroupScope(workspace, lastWorkspaceSnapshot); pendingWorkspace = structuredClone(workspace); pendingWriteOptions = mergeWriteOptions(pendingWriteOptions, options); pendingWrites += 1; const result = new Promise((resolve, reject) => pendingWriteWaiters.push({ resolve, reject })).finally(() => { pendingWrites = Math.max(0, pendingWrites - 1); }); if (!drainPromise) drainPromise = Promise.resolve().then(drainWorkspaceWrites); return result; }
export async function flushWorkspaceWrites() { if (drainPromise) await drainPromise; }
export function hasPendingWrites() { return pendingWrites > 0 || Boolean(pendingWorkspace || drainPromise); }
async function persistWorkspaceOnce(workspace, { snapshot = false, reason = "manual" } = {}) { repairWorkspaceGroupScope(workspace, lastWorkspaceSnapshot); const savedAt = nowIso(); const value = structuredClone(workspace); value.updatedAt ||= savedAt; const db = await openDatabase(); const tx = db.transaction(snapshot ? ["workspaces", "snapshots"] : ["workspaces"], "readwrite"); tx.objectStore("workspaces").put({ id: WORKSPACE_ID, workspace: value, updatedAt: savedAt, schemaVersion: LOCAL_SCHEMA_VERSION }); if (snapshot) tx.objectStore("snapshots").put({ id: `snapshot-${crypto.randomUUID()}`, reason, version: Number(value.version || 0), schemaVersion: LOCAL_SCHEMA_VERSION, createdAt: savedAt, workspace: value }); await transactionDone(tx); lastWorkspaceSnapshot = structuredClone(value); return value; }
async function trimSnapshots(limit) { for (const snapshot of (await listSnapshots()).slice(limit)) await deleteRecord("snapshots", snapshot.id); }
export async function saveLocalWorkspace(workspace, options = {}) { try { const value = await persistWorkspaceOnce(workspace, options); if (options.snapshot) await trimSnapshots(SNAPSHOT_LIMIT); return value; } catch (error) { if (!isQuotaError(error)) throw error; await trimSnapshots(5).catch(() => {}); try { return await persistWorkspaceOnce(workspace, { ...options, snapshot: false }); } catch (retryError) { const wrapped = new Error("El almacenamiento local está lleno. Libera espacio antes de continuar."); wrapped.code = "HIPICO_STORAGE_QUOTA_EXCEEDED"; wrapped.cause = retryError; throw wrapped; } } }
export async function createSnapshot(workspace, reason = "manual") { await flushWorkspaceWrites(); return saveLocalWorkspace(workspace, { snapshot: true, reason }); }
export async function listSnapshots() { return (await getAllRecords("snapshots")).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); }
export async function restoreSnapshot(snapshotId) { await flushWorkspaceWrites(); const snapshot = await getRecord("snapshots", snapshotId); if (!snapshot?.workspace) throw new Error("No se encontró la copia seleccionada."); if (Number(snapshot.schemaVersion || 1) > LOCAL_SCHEMA_VERSION) { const error = new Error("La copia pertenece a una versión local más nueva."); error.code = "HIPICO_LOCAL_SCHEMA_INCOMPATIBLE"; throw error; } const current = await getRecord("workspaces", WORKSPACE_ID); if (current?.workspace) await saveLocalWorkspace(current.workspace, { snapshot: true, reason: "antes-de-restaurar" }); await saveLocalWorkspace(snapshot.workspace, { snapshot: false }); return structuredClone(snapshot.workspace); }
export async function clearLocalWorkspace({ preserveSnapshots = true } = {}) { await flushWorkspaceWrites(); await deleteRecord("workspaces", WORKSPACE_ID); await clearStore("outbox"); if (!preserveSnapshots) await clearStore("snapshots"); lastWorkspaceSnapshot = null; }
export async function getSetting(key, fallback = null) { const record = await getRecord("settings", key); return record ? structuredClone(record.value) : fallback; }
export async function setSetting(key, value) { if (value === undefined || value === null) return deleteRecord("settings", key); return putRecord("settings", { key, value: structuredClone(value) }); }
export const getAppMode = () => getSetting("mode", null);
export const setAppMode = (mode) => setSetting("mode", mode);

export async function bindCloudIdentity(userId) {
  const next = String(userId || "").trim(); if (!next) return { changed: false, ownerId: null };
  const previous = String(await getSetting("cloudOwnerId", "") || "");
  if (previous && previous !== next) {
    await flushWorkspaceWrites(); const current = await getRecord("workspaces", WORKSPACE_ID);
    if (current?.workspace) { await putRecord("workspaces", { ...current, id: `archived:${previous}:${Date.now()}`, archivedAt: nowIso(), ownerId: previous }); await deleteRecord("workspaces", WORKSPACE_ID); }
    await clearStore("outbox"); await clearStore("snapshots"); lastWorkspaceSnapshot = null;
    await putRecord("syncMeta", { key: "identitySwitch", previousOwnerId: previous, nextOwnerId: next, switchedAt: nowIso() });
  }
  await setSetting("cloudOwnerId", next); return { changed: Boolean(previous && previous !== next), ownerId: next };
}
export async function loadCloudSession() { const session = await getSetting("cloudSession", null); if (session?.user?.id) await bindCloudIdentity(session.user.id); return session; }
export async function saveCloudSession(session) { if (session?.user?.id) await bindCloudIdentity(session.user.id); return setSetting("cloudSession", session); }
export async function clearPrivateSessionState() { await flushWorkspaceWrites(); await setSetting("cloudSession", null); await clearStore("outbox"); await putRecord("syncMeta", { key: "sessionCleared", clearedAt: nowIso() }); }
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => [key, canonicalize(value[key])]));
}
function outboxIdempotencyKey(event) { return String(event?.idempotencyKey || event?.id || event?.sourceMessageId || event?.externalMessageId || "").trim(); }
function outboxIntent(event) {
  const source = event && typeof event === "object" ? event : {};
  return canonicalize(Object.fromEntries(Object.entries(source).filter(([key]) => !OUTBOX_VOLATILE_FIELDS.has(key))));
}
function sameOutboxIntent(existing, candidate) {
  return JSON.stringify(outboxIntent(existing)) === JSON.stringify(outboxIntent(candidate));
}
function assertSameOutboxIntent(existing, candidate) {
  if (sameOutboxIntent(existing, candidate)) return existing;
  const error = new Error("La clave de idempotencia offline ya fue usada por otra operación.");
  error.code = "HIPICO_OUTBOX_IDEMPOTENCY_MISMATCH";
  throw error;
}
export async function enqueueOutbox(event) {
  const idempotencyKey = outboxIdempotencyKey(event); if (!idempotencyKey) { const error = new Error("La operación offline necesita una clave estable de idempotencia."); error.code = "HIPICO_OUTBOX_IDEMPOTENCY_KEY_REQUIRED"; throw error; }
  const value = { ...structuredClone(event), id: event.id || `outbox-${crypto.randomUUID()}`, idempotencyKey, createdAt: event.createdAt || nowIso(), attempts: Number(event.attempts || 0) };
  const db = await openDatabase(); const lookup = db.transaction("outbox", "readonly"); const existing = await requestResult(lookup.objectStore("outbox").index("idempotencyKey").get(idempotencyKey)); await transactionDone(lookup); if (existing) return assertSameOutboxIntent(existing, value);
  try { await putRecord("outbox", value); return value; } catch (error) { if (error?.name === "ConstraintError") { const retry = db.transaction("outbox", "readonly"); const duplicate = await requestResult(retry.objectStore("outbox").index("idempotencyKey").get(idempotencyKey)); await transactionDone(retry); if (duplicate) return assertSameOutboxIntent(duplicate, value); } throw error; }
}
export async function listOutbox() { return (await getAllRecords("outbox")).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))); }
export async function removeOutbox(id) { await deleteRecord("outbox", id); }
export async function outboxCount() { return (await getAllRecords("outbox")).length; }
export async function requestPersistentStorage() { return navigator.storage?.persist ? navigator.storage.persist() : false; }
export async function storageDiagnostics() { const [estimate, persisted, outbox, snapshots, schema] = await Promise.all([navigator.storage?.estimate?.(), navigator.storage?.persisted?.(), outboxCount(), listSnapshots(), getRecord("syncMeta", "schema")]); const usage = Number(estimate?.usage || 0), quota = Number(estimate?.quota || 0); return { engine: "IndexedDB", schemaVersion: Number(schema?.version || LOCAL_SCHEMA_VERSION), persisted: Boolean(persisted), usage, quota, quotaPressure: Boolean(quota && usage / quota >= QUOTA_PRESSURE_RATIO), pendingWrites, outbox, snapshots: snapshots.length }; }
export async function getWorkspaceSyncStatus({ staleAfterMs = 5 * 60 * 1000, now = Date.now() } = {}) { const record = await getRecord("workspaces", WORKSPACE_ID); const lastSyncedAt = record?.workspace?.syncMeta?.lastSyncedAt || null; const stamp = Date.parse(String(lastSyncedAt || "")); return { lastSyncedAt, stale: !Number.isFinite(stamp) || now - stamp > staleAfterMs, offline: globalThis.navigator?.onLine === false, schemaVersion: LOCAL_SCHEMA_VERSION }; }
export function downloadBlob(filename, blob) { const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; link.rel = "noopener"; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export function downloadFile(filename, content, type = "application/json") { downloadBlob(filename, new Blob([content], { type })); }
export const __test__ = { isQuotaError, outboxIdempotencyKey, outboxIntent, sameOutboxIntent, ensureOutboxIndexes, matchingLoadedBet, firstGroupId, syncLegacyFinancialConfig, preferNewestOpenDay, referencedGroupIds, recoverOrphanGroupDefinitions };