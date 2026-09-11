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
function mergeById(localRows = [], remoteRows = [], nestedMerge = null) {
    const result = new Map();
    for (const row of [...remoteRows, ...localRows]) {
        if (!row?.id) continue;
        const existing = result.get(row.id);
        if (!existing) { result.set(row.id, structuredClone(row)); continue; }
        const preferred = recordTime(row) >= recordTime(existing) ? row : existing;
        const secondary = preferred === row ? existing : row;
        const merged = { ...structuredClone(secondary), ...structuredClone(preferred) };
        result.set(row.id, nestedMerge ? nestedMerge(merged, existing, row) : merged);
    }
    return [...result.values()];
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
    if (!remoteWorkspace) return markWorkspaceStale(localWorkspace, "remote-unavailable");
    if (!localWorkspace) return markWorkspaceSynced(remoteWorkspace, { version: remoteWorkspace.version });
    const localNewer = recordTime(localWorkspace) >= recordTime(remoteWorkspace);
    const newest = localNewer ? localWorkspace : remoteWorkspace;
    const older = localNewer ? remoteWorkspace : localWorkspace;
    const merged = {
        ...structuredClone(older),
        ...structuredClone(newest),
        config: { ...(older.config || {}), ...(newest.config || {}) },
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
    return merged;
}
export function shouldMergeCloud(localWorkspace, cloudRow) {
    if (!cloudRow?.state) return false;
    const lastSyncedVersion = Number(localWorkspace?.syncMeta?.lastSyncedVersion || 0);
    const remoteVersion = Number(cloudRow.version || cloudRow.state.version || 0);
    return remoteVersion > lastSyncedVersion;
}
