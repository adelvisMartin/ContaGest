function firstGroupId(workspace) {
  return String(workspace?.config?.groups?.[0]?.id || workspace?.config?.whatsappGroups?.[0]?.id || 'group-1');
}

function rowGroupId(workspace, row) {
  return String(row?.groupId || firstGroupId(workspace));
}

function sameRaceKey(left, right) {
  return Boolean(left && right
    && String(left.date || '') === String(right.date || '')
    && String(left.racetrack || '') === String(right.racetrack || '')
    && Number(left.number ?? left.raceNumber) === Number(right.number ?? right.raceNumber));
}

function matchesAdvancedBet(bet, advanced) {
  return String(bet?.play || '') === String(advanced?.play || '')
    && String(bet?.horse || '') === String(advanced?.horse || '')
    && Number(bet?.amount || 0) === Number(advanced?.amount || 0)
    && String(bet?.playerId || '') === String(advanced?.playerId || '')
    && String(bet?.receiverId || '') === String(advanced?.receiverId || '')
    && String(bet?.createdAt || '') === String(advanced?.createdAt || '');
}

function findLatestAdvancedLoadEvent(workspace) {
  const audit = Array.isArray(workspace?.audit) ? workspace.audit : [];
  return audit.find((event) => event?.action === 'advanced_loaded') || null;
}

function ensureDay(workspace, groupId, date, createId, now) {
  workspace.days ||= [];
  let day = workspace.days.find((row) => rowGroupId(workspace, row) === groupId
    && String(row.date || '') === String(date || '')
    && row.status === 'open');
  if (day) {
    day.groupId ||= groupId;
    return day;
  }
  day = { id: createId('day'), groupId, date, status: 'open', closure: null, createdAt: now() };
  workspace.days.push(day);
  return day;
}

function newScopedRace(workspace, groupId, sourceRace, createId, now) {
  const group = (workspace?.config?.groups || []).find((item) => String(item?.id || '') === groupId) || {};
  const day = ensureDay(workspace, groupId, sourceRace.date, createId, now);
  const stamp = now();
  return {
    id: createId('race'),
    groupId,
    dayId: day.id,
    date: sourceRace.date,
    racetrack: sourceRace.racetrack,
    number: Number(sourceRace.number),
    exchangeRate: Number(group.exchangeRate || sourceRace.exchangeRate || 1),
    commission: Number.isFinite(Number(group.commission)) ? Number(group.commission) : Number(sourceRace.commission || 0.05),
    status: 'open',
    retired: [],
    board: ['', '', '', '', '', ''],
    boardPositions: [1, 2, 3, 4, 5, 6],
    bets: [],
    settledAt: null,
    closedAt: null,
    createdAt: stamp,
    updatedAt: stamp
  };
}

function removeLoadedBet(race, advanced) {
  if (!race?.bets?.length) return null;
  let removed = null;
  race.bets = race.bets.filter((bet) => {
    if (!removed && matchesAdvancedBet(bet, advanced)) {
      removed = bet;
      return false;
    }
    return true;
  });
  return removed;
}

function revertAdvanced(row) {
  row.status = 'staged';
  delete row.loadedRaceId;
}

function blockClosedTarget(workspace, event, sourceRace, affected, target) {
  for (const row of affected) {
    removeLoadedBet(sourceRace, row);
    if (target && target !== sourceRace) removeLoadedBet(target, row);
    revertAdvanced(row);
  }
  event.action = 'advanced_load_blocked';
  event.entityType = 'advanced';
  event.entityId = target?.id || sourceRace?.id || event.entityId;
  event.message = `No se cargaron adelantadas: la carrera equivalente del grupo está ${String(target?.status || 'cerrada')}.`;
  event.payload = { ...(event.payload || {}), reason: 'TARGET_RACE_NOT_OPEN', groupId: event.groupId, raceId: target?.id || null };
  return {
    changed: true,
    blocked: true,
    notice: 'No se cargaron las adelantadas: la carrera equivalente del grupo no está abierta.'
  };
}

/**
 * Repairs the legacy app.js advanced-load mutation before it is cloned/persisted.
 * The legacy handler searches by date/track/race without groupId. This boundary
 * makes that write fail-closed across groups while keeping the public UI contract.
 */
export function enforceAdvancedLoadGroupScope(workspace, options = {}) {
  if (!workspace || typeof workspace !== 'object') return { changed: false, blocked: false, notice: '' };
  const event = findLatestAdvancedLoadEvent(workspace);
  if (!event) return { changed: false, blocked: false, notice: '' };

  const createId = options.createId || ((prefix) => `${prefix}-${crypto.randomUUID()}`);
  const now = options.now || (() => new Date().toISOString());
  const intendedGroupId = String(event.groupId || workspace?.config?.activeGroupId || workspace?.config?.activeWhatsappGroupId || firstGroupId(workspace));
  const races = Array.isArray(workspace.races) ? workspace.races : [];
  const sourceRace = races.find((race) => String(race?.id || '') === String(event.entityId || ''));
  if (!sourceRace) return { changed: false, blocked: false, notice: '' };

  const affected = (workspace.advancedBets || []).filter((row) => row?.status === 'loaded' && String(row.loadedRaceId || '') === String(sourceRace.id));
  if (!affected.length) return { changed: false, blocked: false, notice: '' };

  const intended = affected.filter((row) => rowGroupId(workspace, row) === intendedGroupId);
  const accidental = affected.filter((row) => rowGroupId(workspace, row) !== intendedGroupId);

  // Rows from another group were selected only because the legacy handler did
  // not scope its filter. They remain staged and must never be executed implicitly.
  for (const row of accidental) {
    removeLoadedBet(sourceRace, row);
    revertAdvanced(row);
  }

  if (!intended.length) {
    event.action = 'advanced_load_blocked';
    event.entityType = 'advanced';
    event.message = 'No se cargaron adelantadas del grupo activo.';
    event.payload = { ...(event.payload || {}), reason: 'NO_GROUP_SCOPED_ROWS', groupId: intendedGroupId };
    return { changed: accidental.length > 0, blocked: true, notice: 'No había adelantadas pendientes para el grupo activo.' };
  }

  let target = races.find((race) => rowGroupId(workspace, race) === intendedGroupId && sameRaceKey(race, sourceRace));
  if (target && target.status !== 'open') return blockClosedTarget(workspace, event, sourceRace, affected, target);

  if (!target) {
    target = newScopedRace(workspace, intendedGroupId, sourceRace, createId, now);
    races.push(target);
  }
  target.groupId ||= intendedGroupId;
  target.bets ||= [];

  if (target !== sourceRace) {
    for (const row of intended) {
      const moved = removeLoadedBet(sourceRace, row);
      if (moved && !target.bets.some((bet) => matchesAdvancedBet(bet, row))) {
        target.bets.push({ ...moved, groupId: intendedGroupId });
      }
    }
  } else {
    for (const row of intended) {
      const bet = target.bets.find((candidate) => matchesAdvancedBet(candidate, row));
      if (bet) bet.groupId = intendedGroupId;
    }
  }

  for (const row of intended) {
    row.groupId ||= intendedGroupId;
    row.loadedRaceId = target.id;
  }
  event.entityId = target.id;
  event.payload = {
    ...(event.payload || {}),
    groupId: intendedGroupId,
    loadedCount: intended.length,
    rejectedCrossGroupCount: accidental.length
  };

  workspace.config ||= {};
  workspace.config.activeRaceByGroup ||= {};
  workspace.config.activeRaceByGroup[intendedGroupId] = target.id;
  const active = String(workspace.config.activeGroupId || workspace.config.activeWhatsappGroupId || intendedGroupId);
  if (active === intendedGroupId) workspace.activeRaceId = target.id;

  return {
    changed: true,
    blocked: false,
    notice: accidental.length ? `${accidental.length} adelantada(s) de otro grupo fueron excluidas de esta carga.` : ''
  };
}

export const __test__ = { firstGroupId, rowGroupId, sameRaceKey, matchesAdvancedBet, findLatestAdvancedLoadEvent, ensureDay };
