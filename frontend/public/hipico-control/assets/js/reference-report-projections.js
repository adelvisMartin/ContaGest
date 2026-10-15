/**
 * Local, read-only reporting projections over Hípico's existing workspace.
 * Reference UI inspiration is not a source of ledger truth or a data importer.
 * No external URLs, token handling, network calls or state mutations.
 */
import {
  activeGroupId, groupProfile, scopeItems, participantStatement,
  participantBalanceAt, participantMovementDelta, participantRaceDelta
} from './operational-ledger.js';

export function assertReportDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Fecha inválida: utiliza AAAA-MM-DD.');
  }
  const check = new Date(date + 'T12:00:00Z');
  if (!Number.isFinite(check.getTime()) || check.toISOString().slice(0, 10) !== date) {
    throw new Error('La fecha seleccionada no existe.');
  }
  return date;
}

function previousDay(date) {
  const cursor = new Date(date + 'T12:00:00Z');
  cursor.setUTCDate(cursor.getUTCDate() - 1);
  return cursor.toISOString().slice(0, 10);
}

function moneyMinor(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || !Number.isSafeInteger(Math.round(amount * 100))) {
    throw new Error('Monto no representable de forma segura en el informe.');
  }
  return Math.round(amount * 100);
}
const asAmount = (minor) => minor / 100;
const sumAmounts = (values) => asAmount(values.reduce((sum, value) => sum + moneyMinor(value), 0));
const groupMember = (workspace, participant, groupId) =>
  String(participant?.groupId || workspace?.config?.groups?.[0]?.id || 'group-1') === groupId;

function context(workspace, requestedGroupId, date) {
  assertReportDate(date);
  if (!workspace || !Array.isArray(workspace.participants) || !Array.isArray(workspace.races) || !Array.isArray(workspace.movements)) {
    throw new Error('No hay un espacio de trabajo válido para consultar.');
  }
  const groupId = String(requestedGroupId || activeGroupId(workspace));
  const groups = workspace?.config?.groups || workspace?.config?.whatsappGroups || [];
  const group = groups.find((item) => item.id === groupId);
  if (!group) throw new Error('Grupo no autorizado o inexistente.');
  return {
    groupId, date, group: {
      id: groupId, name: String(group.name || ''),
      companyName: String(group.companyName || group.name || ''),
      currency: String(group.currency || workspace.config.currency || 'Bs.')
    }
  };
}

function scopedParticipants(workspace, groupId) {
  return scopeItems(workspace, workspace.participants, groupId);
}

function racesOn(workspace, groupId, date) {
  return scopeItems(workspace, workspace.races, groupId)
    .filter((race) => race.date === date)
    .sort((a, b) => String(a.racetrack).localeCompare(String(b.racetrack), 'es') ||
      Number(a.number || 0) - Number(b.number || 0));
}

function participantDetails(member) {
  return { id: String(member.id), code: String(member.code || ''), name: String(member.name || '') };
}

function displayRace(race, memberMap) {
  let invalidReferences = 0;
  const bets = [];
  for (const bet of race.bets || []) {
    const player = memberMap.get(bet.playerId);
    const receiver = bet.receiverId ? memberMap.get(bet.receiverId) : null;
    if (!player || (bet.receiverId && !receiver)) {
      invalidReferences += 1;
      continue;
    }
    const settled = bet.status === 'settled' && Boolean(bet.settlement);
    const status = bet.status === 'cancelled' ? 'cancelled' : settled ? 'settled' : 'pending';
    bets.push({
      id: String(bet.id || ''), play: String(bet.play || ''),
      horse: String(bet.horse || '').replace(/\*/g, 'x'),
      amount: asAmount(moneyMinor(bet.amount || 0)), status,
      player: participantDetails(player),
      receiver: receiver ? participantDetails(receiver) : null,
      playerResult: settled ? asAmount(moneyMinor(bet.settlement.playerAmount || 0)) : null,
      receiverResult: settled && receiver ? asAmount(moneyMinor(bet.settlement.receiverAmount || 0)) : null
    });
  }
  return {
    id: String(race.id || ''), racetrack: String(race.racetrack || 'Hipódromo'),
    number: Number(race.number || 0), date: String(race.date), status: String(race.status || ''),
    board: (Array.isArray(race.board) ? race.board : []).map(String).filter(Boolean).join('.'),
    bets, invalidReferences,
    settled: bets.filter((bet) => bet.status === 'settled').length,
    pending: bets.filter((bet) => bet.status === 'pending').length,
    cancelled: bets.filter((bet) => bet.status === 'cancelled').length
  };
}

export function projectRaceHistory(workspace, { groupId, date } = {}) {
  const cx = context(workspace, groupId, date);
  const members = scopedParticipants(workspace, cx.groupId);
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const races = racesOn(workspace, cx.groupId, cx.date).map((race) => displayRace(race, memberMap));
  return {
    ...cx, races,
    raceCount: races.length,
    betCount: races.reduce((sum, r) => sum + r.bets.length, 0),
    invalidReferences: races.reduce((sum, r) => sum + r.invalidReferences, 0)
  };
}

function movementEntry(workspace, movement, memberMap, groupId) {
  const sender = memberMap.get(movement.participantId);
  const receiver = movement.counterpartyId ? memberMap.get(movement.counterpartyId) : null;
  if (!sender || (movement.type === 'transfer' && !receiver)) return null;
  const cancelled = movement.status === 'cancelled';
  return {
    id: String(movement.id || ''), date: String(movement.date || ''),
    time: String(movement.createdAt || ''),
    type: String(movement.type || 'adjustment'), currency: String(movement.currency || 'VES'),
    amount: asAmount(moneyMinor(Math.abs(Number(movement.amount || 0)))),
    direction: Number(movement.amount || 0) < 0 ? 'out' : 'in',
    status: cancelled ? 'cancelled' : 'posted',
    participant: participantDetails(sender),
    counterparty: receiver ? participantDetails(receiver) : null,
    // Sum of affected participant deltas is zero for a transfer.
    deltaTotal: cancelled ? 0 : sumAmounts([
      participantMovementDelta(workspace, movement, sender.id, groupId),
      ...(receiver ? [participantMovementDelta(workspace, movement, receiver.id, groupId)] : [])
    ])
  };
}

export function projectDailyMovements(workspace, { groupId, date } = {}) {
  const cx = context(workspace, groupId, date);
  const members = scopedParticipants(workspace, cx.groupId);
  const map = new Map(members.map((m) => [m.id, m]));
  let invalidReferences = 0;
  const movements = [];
  for (const movement of scopeItems(workspace, workspace.movements, cx.groupId)) {
    if (movement.date !== cx.date) continue;
    const item = movementEntry(workspace, movement, map, cx.groupId);
    if (!item) { invalidReferences += 1; continue; }
    movements.push(item);
  }
  movements.sort((a, b) => b.time.localeCompare(a.time) || a.id.localeCompare(b.id));
  const rollups = new Map();
  for (const item of movements.filter((m) => m.status === 'posted')) {
    // Never combine USD and VES; transfers count once, not once per participant.
    const key = item.type + ':' + item.currency;
    const previous = rollups.get(key) || { type: item.type, currency: item.currency, count: 0, amountMinor: 0 };
    previous.count++;
    previous.amountMinor += moneyMinor(item.amount);
    rollups.set(key, previous);
  }
  return {
    ...cx, movements, invalidReferences,
    totals: [...rollups.values()].map((row) => ({
      type: row.type, currency: row.currency,
      count: row.count, amount: asAmount(row.amountMinor)
    })),
    postedCount: movements.filter((m) => m.status === 'posted').length,
    cancelledCount: movements.filter((m) => m.status === 'cancelled').length
  };
}

export function projectParticipantAccount(workspace, { groupId, date, participantId } = {}) {
  const cx = context(workspace, groupId, date);
  const members = scopedParticipants(workspace, cx.groupId);
  const participant = members.find((item) => item.id === participantId && groupMember(workspace, item, cx.groupId));
  if (!participant) throw new Error('Participante no encontrado en el grupo seleccionado.');
  const history = projectRaceHistory(workspace, cx);
  const daily = projectDailyMovements(workspace, cx);
  // The canonical balance would otherwise count a foreign-group reference
  // that was intentionally excluded from report rows. Refuse that mismatch.
  if (history.invalidReferences || daily.invalidReferences) {
    throw new Error('El informe personal tiene referencias no conciliadas; revisa los datos del grupo.');
  }
  const statement = participantStatement(workspace, participant.id, cx.date);
  const races = history.races.map((race) => ({
    ...race,
    bets: race.bets.filter((bet) => bet.player.id === participant.id || bet.receiver?.id === participant.id),
    net: participantRaceDelta(
      racesOn(workspace, cx.groupId, cx.date).find((source) => source.id === race.id), participant.id
    )
  })).filter((race) => race.bets.length);
  const movements = daily.movements
    .filter((m) => m.participant.id === participant.id || m.counterparty?.id === participant.id)
    .map((m) => ({
      ...m,
      delta: m.status === 'cancelled' ? 0 : participantMovementDelta(
        workspace,
        scopeItems(workspace, workspace.movements, cx.groupId).find((src) => src.id === m.id),
        participant.id, cx.groupId
      )
    }));
  return {
    ...cx, participant: participantDetails(participant),
    opening: participantBalanceAt(workspace, participant.id, previousDay(cx.date)),
    available: statement.available,
    dayResult: statement.dayTotal, weekResult: statement.weekTotal, aval: statement.aval,
    weekly: statement.dailyRows.map((r) => ({ date: r.date, amount: r.amount })),
    races, movements,
    invalidReferences: history.invalidReferences + daily.invalidReferences
  };
}
