import { roundMoney } from './engine.js';

function firstGroupId(workspace) {
  return String(workspace?.config?.groups?.[0]?.id || workspace?.config?.whatsappGroups?.[0]?.id || 'group-1');
}

export function activeGroupId(workspace) {
  return String(workspace?.config?.activeGroupId || workspace?.config?.activeWhatsappGroupId || firstGroupId(workspace));
}

export function groupProfile(workspace, groupId = activeGroupId(workspace)) {
  return (workspace?.config?.groups || workspace?.config?.whatsappGroups || []).find((group) => group.id === groupId) || {
    id: groupId,
    companyName: workspace?.config?.clubName || 'CONTROL HÍPICO',
    currency: workspace?.config?.currency || 'Bs.',
    exchangeRate: Number(workspace?.config?.exchangeRate || 1)
  };
}

export function scopeItems(workspace, items, groupId = activeGroupId(workspace)) {
  const fallback = firstGroupId(workspace);
  return (items || []).filter((item) => String(item?.groupId || fallback) === String(groupId));
}

export function activeDay(workspace, groupId = activeGroupId(workspace)) {
  const days = scopeItems(workspace, workspace?.days, groupId);
  return [...days].reverse().find((day) => day.status === 'open') || days.at(-1) || null;
}

export function activeRace(workspace, groupId = activeGroupId(workspace)) {
  const races = scopeItems(workspace, workspace?.races, groupId);
  const configured = workspace?.config?.activeRaceByGroup?.[groupId] || (groupId === activeGroupId(workspace) ? workspace?.activeRaceId : null);
  return races.find((race) => race.id === configured) || races.at(-1) || null;
}

export function rateAt(workspace, date, groupId = activeGroupId(workspace)) {
  const profile = groupProfile(workspace, groupId);
  const rates = scopeItems(workspace, workspace?.exchangeRates, groupId)
    .filter((row) => String(row.date || '') <= String(date || '9999-12-31'))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return Number(rates.at(-1)?.rate || profile.exchangeRate || workspace?.config?.exchangeRate || 1);
}

function toBaseCurrency(workspace, movement, groupId) {
  const amount = Math.abs(Number(movement?.amount || 0));
  const currency = String(movement?.currency || 'VES').toUpperCase();
  return currency === 'USD' ? amount * rateAt(workspace, movement?.date, groupId) : amount;
}

export function participantRaceDelta(race, participantId) {
  let total = 0;
  for (const bet of race?.bets || []) {
    if (bet.status !== 'settled' || !bet.settlement) continue;
    if (bet.playerId === participantId) total += Number(bet.settlement.playerAmount || 0);
    if (bet.receiverId === participantId) total += Number(bet.settlement.receiverAmount || 0);
  }
  return roundMoney(total);
}

export function participantMovementDelta(workspace, movement, participantId, groupId = activeGroupId(workspace)) {
  if (!movement || movement.status === 'cancelled') return 0;
  const amount = toBaseCurrency(workspace, movement, groupId);
  if (movement.type === 'transfer') {
    if (movement.participantId === participantId) return -amount;
    if (movement.counterpartyId === participantId) return amount;
    return 0;
  }
  if (movement.participantId !== participantId) return 0;
  return Number(movement.amount || 0) < 0 ? -amount : amount;
}

export function participantBalanceAt(workspace, participantId, until = '9999-12-31') {
  const participant = (workspace?.participants || []).find((row) => row.id === participantId);
  if (!participant) return 0;
  const groupId = String(participant.groupId || firstGroupId(workspace));
  let total = Number(participant.openingBalance || 0);
  for (const race of scopeItems(workspace, workspace?.races, groupId)) {
    if (String(race.date || '') > until) continue;
    total += participantRaceDelta(race, participantId);
  }
  for (const movement of scopeItems(workspace, workspace?.movements, groupId)) {
    if (String(movement.date || '') > until) continue;
    total += participantMovementDelta(workspace, movement, participantId, groupId);
  }
  return roundMoney(total);
}

export function participantAval(workspace, participant, date) {
  if (!participant) return 0;
  const groupId = String(participant.groupId || firstGroupId(workspace));
  return roundMoney(Number(participant.avalBs || 0) + Number(participant.avalUsd || 0) * rateAt(workspace, date, groupId));
}

function availableFromBalance(workspace, participant, date, balance) {
  if (!participant) return 0;
  return roundMoney(Number(balance || 0) + participantAval(workspace, participant, date));
}

export function participantAvailableAt(workspace, participant, date = new Date().toISOString().slice(0, 10)) {
  if (!participant) return 0;
  const balance = participantBalanceAt(workspace, participant.id, date);
  return availableFromBalance(workspace, participant, date, balance);
}

export function balanceRows(workspace, groupId = activeGroupId(workspace), date = new Date().toISOString().slice(0, 10)) {
  return scopeItems(workspace, workspace?.participants, groupId)
    .filter((participant) => participant.active !== false)
    .map((participant) => {
      const balance = participantBalanceAt(workspace, participant.id, date);
      return {
        participant,
        balance,
        available: availableFromBalance(workspace, participant, date, balance)
      };
    });
}

function isoMonday(date) {
  const cursor = new Date(`${date}T12:00:00`);
  const weekday = cursor.getDay() || 7;
  cursor.setDate(cursor.getDate() - weekday + 1);
  return cursor.toISOString().slice(0, 10);
}

function dateRange(from, to) {
  const rows = [];
  const cursor = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (cursor <= end && rows.length < 14) {
    rows.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return rows;
}

export function participantDayDelta(workspace, participantId, date) {
  const participant = (workspace?.participants || []).find((row) => row.id === participantId);
  if (!participant) return 0;
  const groupId = String(participant.groupId || firstGroupId(workspace));
  let total = 0;
  for (const race of scopeItems(workspace, workspace?.races, groupId)) {
    if (race.date === date) total += participantRaceDelta(race, participantId);
  }
  for (const movement of scopeItems(workspace, workspace?.movements, groupId)) {
    if (movement.date === date) total += participantMovementDelta(workspace, movement, participantId, groupId);
  }
  return roundMoney(total);
}

export function participantStatement(workspace, participantId, date = new Date().toISOString().slice(0, 10)) {
  const participant = (workspace?.participants || []).find((row) => row.id === participantId);
  if (!participant) throw new Error('No existe el participante seleccionado.');
  const groupId = String(participant.groupId || firstGroupId(workspace));
  const from = isoMonday(date);
  const dailyRows = dateRange(from, date).map((day) => ({ date: day, amount: participantDayDelta(workspace, participantId, day) }));
  const dayRaces = scopeItems(workspace, workspace?.races, groupId).filter((race) => race.date === date);
  const byTrack = new Map();
  for (const race of dayRaces) {
    const amount = participantRaceDelta(race, participantId);
    if (!amount) continue;
    const key = String(race.racetrack || 'Hipódromo');
    if (!byTrack.has(key)) byTrack.set(key, { racetrack: key, races: [], total: 0 });
    const row = byTrack.get(key);
    row.races.push({ number: race.number, amount });
    row.total = roundMoney(row.total + amount);
  }
  const pozo = scopeItems(workspace, workspace?.movements, groupId)
    .filter((movement) => String(movement.date || '') <= date && ['pozo', 'pool'].includes(String(movement.type || '').toLowerCase()))
    .reduce((sum, movement) => sum + participantMovementDelta(workspace, movement, participantId, groupId), 0);
  const weekTotal = roundMoney(dailyRows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const dayTotal = Number(dailyRows.find((row) => row.date === date)?.amount || 0);
  const aval = participantAval(workspace, participant, date);
  const balance = participantBalanceAt(workspace, participantId, date);
  return {
    groupId,
    participant,
    date,
    dailyRows,
    tracks: [...byTrack.values()],
    aval,
    pozo: roundMoney(pozo),
    weekTotal,
    available: roundMoney(balance + aval),
    dayTotal
  };
}

export function dailyStats(workspace, day = activeDay(workspace), groupId = activeGroupId(workspace)) {
  if (!day) return { races: 0, bets: 0, volume: 0, settled: 0, pending: 0, cancelled: 0, commission: 0, controlDifference: 0, openRaces: [] };
  const races = scopeItems(workspace, workspace?.races, groupId).filter((race) => race.dayId === day.id || (!race.dayId && race.date === day.date));
  const bets = races.flatMap((race) => race.bets || []);
  const valid = bets.filter((bet) => bet.status !== 'cancelled');
  const settled = valid.filter((bet) => bet.status === 'settled' && bet.settlement);
  const pending = valid.filter((bet) => bet.status === 'pending');
  return {
    races: races.length,
    bets: valid.length,
    volume: roundMoney(valid.reduce((sum, bet) => sum + Number(bet.amount || 0), 0)),
    settled: settled.length,
    pending: pending.length,
    cancelled: bets.filter((bet) => bet.status === 'cancelled').length,
    commission: roundMoney(settled.reduce((sum, bet) => sum + Number(bet.settlement?.commissionAmount || 0), 0)),
    controlDifference: roundMoney(settled.reduce((sum, bet) => sum + Number(bet.settlement?.playerAmount || 0) + Number(bet.settlement?.receiverAmount || 0) + Number(bet.settlement?.commissionAmount || 0), 0)),
    openRaces: races.filter((race) => race.status !== 'closed'),
    racesList: races
  };
}

export const __test__ = { firstGroupId, isoMonday, dateRange, toBaseCurrency, availableFromBalance };
