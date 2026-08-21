function recordTime(value) {
    const time = Date.parse((value === null || value === void 0 ? void 0 : value.updatedAt) || (value === null || value === void 0 ? void 0 : value.createdAt) || (value === null || value === void 0 ? void 0 : value.closedAt) || (value === null || value === void 0 ? void 0 : value.date) || 0);
    return Number.isFinite(time) ? time : 0;
}
function mergeById(localRows = [], remoteRows = [], nestedMerge = null) {
    const result = new Map();
    for (const row of [...remoteRows, ...localRows]) {
        if (!(row === null || row === void 0 ? void 0 : row.id))
            continue;
        const existing = result.get(row.id);
        if (!existing) {
            result.set(row.id, structuredClone(row));
            continue;
        }
        const preferred = recordTime(row) >= recordTime(existing) ? row : existing;
        const secondary = preferred === row ? existing : row;
        const merged = Object.assign(Object.assign({}, structuredClone(secondary)), structuredClone(preferred));
        result.set(row.id, nestedMerge ? nestedMerge(merged, existing, row) : merged);
    }
    return [...result.values()];
}
function mergeRace(base, first, second) {
    return Object.assign(Object.assign({}, base), { bets: mergeById(first === null || first === void 0 ? void 0 : first.bets, second === null || second === void 0 ? void 0 : second.bets), board: (recordTime(first) >= recordTime(second) ? first === null || first === void 0 ? void 0 : first.board : second === null || second === void 0 ? void 0 : second.board) || base.board || [], boardPositions: (recordTime(first) >= recordTime(second) ? first === null || first === void 0 ? void 0 : first.boardPositions : second === null || second === void 0 ? void 0 : second.boardPositions) || base.boardPositions || [], retired: [...new Set([...((first === null || first === void 0 ? void 0 : first.retired) || []), ...((second === null || second === void 0 ? void 0 : second.retired) || [])])] });
}
export function mergeWorkspaces(localWorkspace, remoteWorkspace) {
    var _a;
    if (!remoteWorkspace)
        return structuredClone(localWorkspace);
    if (!localWorkspace)
        return structuredClone(remoteWorkspace);
    const localNewer = recordTime(localWorkspace) >= recordTime(remoteWorkspace);
    const newest = localNewer ? localWorkspace : remoteWorkspace;
    const older = localNewer ? remoteWorkspace : localWorkspace;
    const merged = Object.assign(Object.assign(Object.assign({}, structuredClone(older)), structuredClone(newest)), { config: Object.assign(Object.assign({}, (older.config || {})), (newest.config || {})), participants: mergeById(localWorkspace.participants, remoteWorkspace.participants), days: mergeById(localWorkspace.days, remoteWorkspace.days), races: mergeById(localWorkspace.races, remoteWorkspace.races, mergeRace), advancedBets: mergeById(localWorkspace.advancedBets, remoteWorkspace.advancedBets), movements: mergeById(localWorkspace.movements, remoteWorkspace.movements), exchangeRates: mergeById(localWorkspace.exchangeRates, remoteWorkspace.exchangeRates), weekClosures: mergeById(localWorkspace.weekClosures, remoteWorkspace.weekClosures), pollas: mergeById(localWorkspace.pollas, remoteWorkspace.pollas), audit: mergeById(localWorkspace.audit, remoteWorkspace.audit)
            .sort((a, b) => recordTime(b) - recordTime(a))
            .slice(0, 1500), syncQueue: mergeById(localWorkspace.syncQueue, remoteWorkspace.syncQueue), version: Math.max(Number(localWorkspace.version || 0), Number(remoteWorkspace.version || 0)) + 1, updatedAt: new Date().toISOString() });
    const raceIds = new Set(merged.races.map((race) => race.id));
    if (!raceIds.has(merged.activeRaceId))
        merged.activeRaceId = newest.activeRaceId || ((_a = merged.races.at(-1)) === null || _a === void 0 ? void 0 : _a.id) || null;
    return merged;
}
export function shouldMergeCloud(localWorkspace, cloudRow) {
    var _a;
    if (!(cloudRow === null || cloudRow === void 0 ? void 0 : cloudRow.state))
        return false;
    const lastSyncedVersion = Number(((_a = localWorkspace === null || localWorkspace === void 0 ? void 0 : localWorkspace.syncMeta) === null || _a === void 0 ? void 0 : _a.lastSyncedVersion) || 0);
    const remoteVersion = Number(cloudRow.version || cloudRow.state.version || 0);
    return remoteVersion > lastSyncedVersion;
}
