/**
 * Operational screenshot-derived read models. Not a representation of third-party
 * DOM/API behavior; source of truth is our own scoped local workspace.
 */
import { projectDailyMovements, projectRaceHistory } from './reference-report-projections.js';

export function caracasToday(clock = new Date()) {
  const date = clock instanceof Date ? clock : new Date(clock);
  if (!Number.isFinite(date.valueOf())) throw new Error('Reloj del dispositivo inválido.');
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
}

function toMinor(value) {
  const rounded = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(rounded)) throw new Error('Monto fuera de precisión permitida.');
  return rounded;
}
function centsToAmount(value) { return value / 100; }

export function projectRaceResults(race) {
  const byParticipant = new Map();
  let settledBets = 0;
  let totalMinor = 0;
  for (const bet of race.bets) {
    if (bet.status !== 'settled') continue;
    settledBets++;
    const legs = [
      { party: bet.player, result: bet.playerResult },
      ...(bet.receiver ? [{ party: bet.receiver, result: bet.receiverResult }] : [])
    ];
    for (const { party, result } of legs) {
      if (result === null || result === undefined) continue;
      const minor = toMinor(result);
      const old = byParticipant.get(party.id) || { id: party.id, code: party.code, amountMinor: 0 };
      old.amountMinor += minor;
      byParticipant.set(party.id, old);
      totalMinor += minor;
    }
  }
  return {
    settledBets,
    participantResults: [...byParticipant.values()]
      .map(({ id, code, amountMinor }) => ({ id, code, amount: centsToAmount(amountMinor) }))
      .sort((a, b) => a.code.localeCompare(b.code, 'es')),
    participantTotal: centsToAmount(totalMinor),
    // The participant net is not necessarily the club's actual profit.
    participantTotalKind: 'participant-settled-net'
  };
}

function movementLegs(movement) {
  const amount = Math.abs(movement.amount);
  if (movement.type !== 'transfer') {
    return [{
      id: movement.id, side: 'single', participant: movement.participant,
      counterparty: null, amount: movement.direction === 'out' ? -amount : amount,
      currency: movement.currency, time: movement.time, date: movement.date,
      status: movement.status, type: movement.type
    }];
  }
  // A transfer is ONE ledger operation but TWO visually distinct parties.
  if (!movement.counterparty) throw new Error('Transferencia sin receptor del mismo grupo.');
  return [
    {
      id: movement.id, side: 'sender', participant: movement.participant,
      counterparty: movement.counterparty, amount: -amount,
      currency: movement.currency, time: movement.time, date: movement.date,
      status: movement.status, type: movement.type
    },
    {
      id: movement.id, side: 'receiver', participant: movement.counterparty,
      counterparty: movement.participant, amount,
      currency: movement.currency, time: movement.time, date: movement.date,
      status: movement.status, type: movement.type
    }
  ];
}

export function projectOperationsDesk(workspace, filters) {
  const moves = projectDailyMovements(workspace, filters);
  const races = projectRaceHistory(workspace, filters);
  if (moves.groupId !== races.groupId || moves.date !== races.date) {
    throw new Error('El historial y las carreras tienen ámbitos distintos.');
  }
  const entries = moves.movements.flatMap(movementLegs);
  return {
    ...races,
    movements: moves.movements,
    entryRows: entries,
    movementCount: moves.movements.length,
    entryCount: entries.length,
    postedCount: moves.postedCount,
    cancelledCount: moves.cancelledCount,
    totals: moves.totals,
    // Both components may be missing references; no synthesized subtotals.
    invalidReferences: moves.invalidReferences + races.invalidReferences,
    races: races.races.map((race) => ({ ...race, ...projectRaceResults(race) }))
  };
}

export function raceCopyText(workspace, { groupId, date, raceId, participantId = null }) {
  const model = projectRaceHistory(workspace, { groupId, date });
  if (model.invalidReferences) throw new Error('Hay participantes sin conciliar en el grupo. No se puede copiar.');
  const race = model.races.find((item) => item.id === raceId);
  if (!race) throw new Error('Carrera inexistente para el grupo y fecha seleccionados.');
  const visible = race.bets.filter((bet) =>
    !participantId || bet.player.id === participantId || bet.receiver?.id === participantId
  );
  if (participantId && !visible.length) throw new Error('No hay jugadas autorizadas para copiar.');
  const rows = [
    model.group.companyName,
    date + ' · ' + race.racetrack + ' · ' + race.number + 'ª carrera',
    'Pizarra: ' + (race.board || 'Sin pizarra'),
    'JUGADAS'
  ];
  for (const bet of visible) {
    const amount = bet.amount.toFixed(2);
    const player = !participantId || bet.player.id === participantId ? bet.player.code : '';
    const receiver = bet.receiver && (!participantId || bet.receiver.id === participantId)
      ? bet.receiver.code : '';
    rows.push(
      [bet.play, bet.horse, amount, model.group.currency, player, receiver].filter(Boolean).join(' ') +
      ' · ' + (bet.status === 'cancelled' ? 'ANULADA' :
        bet.status === 'pending' ? 'PENDIENTE' : 'LIQUIDADA')
    );
  }
  const results = projectRaceResults({ ...race, bets: visible });
  rows.push('RESULTADOS CONFIRMADOS');
  for (const result of results.participantResults) {
    if (!participantId || participantId === result.id) {
      rows.push(result.code + ': ' + result.amount.toFixed(2) + ' ' + model.group.currency);
    }
  }
  if (!results.participantResults.length) rows.push('Sin liquidaciones confirmadas.');
  rows.push('Consulta interna · No es confirmación de pago');
  return rows.join('\n');
}
