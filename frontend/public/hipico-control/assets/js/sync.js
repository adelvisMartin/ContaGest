import { assertWorkspaceInputSafety } from "./workspace-input-safety.js";

export const SYNC_CONFLICT_POLICY = Object.freeze({
    participants: "latest-record-by-id",
    days: "latest-record-by-id",
    races: "latest-record-by-id-with-nested-bets",
    advancedBets: "latest-record-by-id",
    movements: "append-merge-by-id",
    exchangeRates: "latest-record-by-id",
    weekClosures: "latest-record-by-id",
    pollas: "latest-record-by-id",
    audit: "append-merge-by-id",
    chatImports: "append-union-preserve-scoped-idempotency",
    syncQueue: "idempotent-merge-by-id",
    moneyAuthority: "server-ledger-only",
    staleAuthority: "never-live"
});

function recordTime(value) {
    const time = Date.parse(value?.updatedAt || value?.createdAt || value?.closedAt || value?.date || 0);
    return Number.isFinite(time) ? time : 0;
}
function scopedRecordKey(row) {
    const id = String(row?.id || "").trim();
    if (!id) return "";
    const groupId = String(row?.groupId || "").trim();
    return groupId ? `${groupId}\u0000${id}` : id;
}
function mergeById(localRows = [], remoteRows = [], nestedMerge = null) {
    const result = new Map();
    for (const row of [...remoteRows, ...localRows]) {
        const key = scopedRecordKey(row);
        if (!key) continue;
        const existing = result.get(key);
        if (!existing) { result.set(key, structuredClone(row)); continue; }
        const preferred = recordTime(row) >= recordTime(existing) ? row : existing;
        const secondary = preferred === row ? existing : row;
        const merged = { ...structuredClone(secondary), ...structuredClone(preferred) };
        result.set(key, nestedMerge ? nestedMerge(merged, existing, row) : merged);
    }
    return [...result.values()];
}
function configGroups(config = {}) {
    const groups = Array.isArray(config.groups) && config.groups.length
        ? config.groups
        : (Array.isArray(config.whatsappGroups) ? config.whatsappGroups : []);
    return groups.filter((group) => String(group?.id || "").trim());
}
function mergeGroupDefinitions(olderConfig = {}, newestConfig = {}) {
    const byId = new Map();
    for (const group of configGroups(olderConfig)) byId.set(String(group.id), structuredClone(group));
    for (const group of configGroups(newestConfig)) {
        const id = String(group.id);
        byId.set(id, { ...(byId.get(id) || {}), ...structuredClone(group) });
    }
    const newestOrder = configGroups(newestConfig).map((group) => String(group.id));
    const olderOnly = configGroups(olderConfig)
        .map((group) => String(group.id))
        .filter((id) => !newestOrder.includes(id));
    return [...newestOrder, ...olderOnly].map((id) => byId.get(id)).filter(Boolean);
}
function mergeWorkspaceConfig(olderConfig = {}, newestConfig = {}) {
    const config = { ...structuredClone(olderConfig), ...structuredClone(newestConfig) };
    const groups = mergeGroupDefinitions(olderConfig, newestConfig);
    if (groups.length) {
        config.groups = groups;
        config.whatsappGroups = groups;
    }
    config.activeRaceByGroup = {
        ...(olderConfig.activeRaceByGroup || {}),
        ...(newestConfig.activeRaceByGroup || {})
    };
    const groupIds = new Set(groups.map((group) => String(group.id)));
    if (config.activeGroupId && !groupIds.has(String(config.activeGroupId))) {
        config.activeGroupId = groups[0]?.id || null;
    }
    if (config.activeWhatsappGroupId && !groupIds.has(String(config.activeWhatsappGroupId))) {
        config.activeWhatsappGroupId = config.activeGroupId || groups[0]?.id || null;
    }
    if (Array.isArray(config.captureGroupIds)) {
        config.captureGroupIds = config.captureGroupIds.filter((id) => groupIds.has(String(id)));
    }
    if (!config.captureGroupIds?.length && config.activeGroupId) config.captureGroupIds = [config.activeGroupId];
    return config;
}

function rawChatImports(value) {
    if (!Array.isArray(value)) return [];
    return structuredClone(value).map((entry) => String(entry || "").trim()).filter(Boolean);
}
export function mergeChatImports(localRows = [], remoteRows = []) {
    return [...new Set([...rawChatImports(remoteRows), ...rawChatImports(localRows)])];
}
function mergeRace(base, first, second) {
    return {
        ...base,
        bets: mergeById(first?.bets, second?.bets),
        board: (recordTime(first) >= recordTime(second) ? first?.board : second?.board) || base.board || [],
        boardPositions: (recordTime(first) >= recordTime(second) ? first?.boardPositions : second?.boardPositions) || base.boardPositions || [],
        retired: [...new Set([...(first?.retired || []), ...(second?.retired || [])])]
    };
}
export function syncFreshness(syncMeta = {}, { staleAfterMs = 5 * 60 * 1000, now = Date.now() } = {}) {
    const stamp = Date.parse(String(syncMeta?.lastSyncedAt || ""));
    const ageMs = Number.isFinite(stamp) ? Math.max(0, now - stamp) : Number.POSITIVE_INFINITY;
    return { lastSyncedAt: syncMeta?.lastSyncedAt || null, ageMs, stale: !Number.isFinite(stamp) || ageMs > staleAfterMs };
}
export function markWorkspaceSynced(workspace, { version, at = new Date().toISOString() } = {}) {
    const copy = structuredClone(workspace);
    copy.syncMeta ||= {};
    copy.syncMeta.lastSyncedAt = at;
    if (version != null) copy.syncMeta.lastSyncedVersion = Number(version || 0);
    copy.syncMeta.stale = false;
    copy.syncMeta.syncState = "synced";
    return copy;
}
export function markWorkspaceStale(workspace, reason = "offline") {
    const copy = structuredClone(workspace);
    copy.syncMeta ||= {};
    copy.syncMeta.stale = true;
    copy.syncMeta.syncState = "stale";
    copy.syncMeta.staleReason = String(reason || "offline");
    return copy;
}
export function mergeWorkspaces(localWorkspace, remoteWorkspace) {
    if (!remoteWorkspace) {
        assertWorkspaceInputSafety(localWorkspace);
        return markWorkspaceStale(localWorkspace, "remote-unavailable");
    }
    if (!localWorkspace) {
        assertWorkspaceInputSafety(remoteWorkspace);
        return markWorkspaceSynced(remoteWorkspace, { version: remoteWorkspace.version });
    }
    assertWorkspaceInputSafety(localWorkspace);
    assertWorkspaceInputSafety(remoteWorkspace);
    const localNewer = recordTime(localWorkspace) >= recordTime(remoteWorkspace);
    const newest = localNewer ? localWorkspace : remoteWorkspace;
    const older = localNewer ? remoteWorkspace : localWorkspace;
    const merged = {
        ...structuredClone(older),
        ...structuredClone(newest),
        config: mergeWorkspaceConfig(older.config || {}, newest.config || {}),
        participants: mergeById(localWorkspace.participants, remoteWorkspace.participants),
        days: mergeById(localWorkspace.days, remoteWorkspace.days),
        races: mergeById(localWorkspace.races, remoteWorkspace.races, mergeRace),
        advancedBets: mergeById(localWorkspace.advancedBets, remoteWorkspace.advancedBets),
        movements: mergeById(localWorkspace.movements, remoteWorkspace.movements),
        exchangeRates: mergeById(localWorkspace.exchangeRates, remoteWorkspace.exchangeRates),
        weekClosures: mergeById(localWorkspace.weekClosures, remoteWorkspace.weekClosures),
        pollas: mergeById(localWorkspace.pollas, remoteWorkspace.pollas),
        audit: mergeById(localWorkspace.audit, remoteWorkspace.audit).sort((a, b) => recordTime(b) - recordTime(a)).slice(0, 1500),
        chatImports: mergeChatImports(localWorkspace.chatImports, remoteWorkspace.chatImports),
        syncQueue: mergeById(localWorkspace.syncQueue, remoteWorkspace.syncQueue),
        syncMeta: { ...(older.syncMeta || {}), ...(newest.syncMeta || {}), stale: true, syncState: "merge-pending-confirmation" },
        version: Math.max(Number(localWorkspace.version || 0), Number(remoteWorkspace.version || 0)) + 1,
        updatedAt: new Date().toISOString()
    };
    const raceIds = new Set(merged.races.map((race) => race.id));
    if (!raceIds.has(merged.activeRaceId)) merged.activeRaceId = newest.activeRaceId || merged.races.at(-1)?.id || null;
    assertWorkspaceInputSafety(merged);
    return merged;
}
export function shouldMergeCloud(localWorkspace, cloudRow) {
    if (!cloudRow?.state) return false;
    const lastSyncedVersion = Number(localWorkspace?.syncMeta?.lastSyncedVersion || 0);
    const remoteVersion = Number(cloudRow.version || cloudRow.state.version || 0);
    return remoteVersion > lastSyncedVersion;
}

export const __test__ = { scopedRecordKey, configGroups, mergeGroupDefinitions, mergeWorkspaceConfig };
