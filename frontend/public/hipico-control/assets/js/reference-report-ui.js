import { money, number } from './format.js';
import { escapeHtml } from './ui.js';
import {
  assertReportDate, projectParticipantAccount, projectDailyMovements, projectRaceHistory
} from './reference-report-projections.js';

const typeNames = Object.freeze({
  personal: 'Estado personal',
  'daily-movements': 'Movimientos del día',
  'race-history': 'Carreras y resultados'
});
const movementTypes = Object.freeze({
  transfer: 'Transferencia', pool: 'Pozo', pozo: 'Pozo',
  adjustment: 'Ajuste', deposit: 'Depósito', withdrawal: 'Retiro'
});
const statusName = Object.freeze({ pending: 'Pendiente', settled: 'Liquidada', cancelled: 'Anulada', posted: 'Registrado' });
const signedMoney = (value, currency) => money(value, currency, true);
const label = (value) => escapeHtml(String(value ?? ''));
const quoteMoney = (value, currency) => label(signedMoney(value, currency));
const count = (n) => label(number(n).replace(/,00$/, ''));

function modelFor(workspace, { type, date, participantId, groupId }) {
  if (!typeNames[type]) throw new Error('Tipo de consulta no admitido.');
  assertReportDate(date);
  if (type === 'personal') return projectParticipantAccount(workspace, { date, participantId, groupId });
  if (type === 'daily-movements') return projectDailyMovements(workspace, { date, groupId });
  return projectRaceHistory(workspace, { date, groupId });
}

function warning(model) {
  if (!model.invalidReferences) return '';
  return `<div class="notice" role="alert">Atención: ${count(model.invalidReferences)} registro(s) con referencias fuera del grupo. No se presentan ni se incluyen en los totales del informe; revisa su origen antes de cerrar.</div>`;
}

function controls(workspace, model, type, participantId) {
  const members = (workspace.participants || []).filter((item) =>
    String(item.groupId || (workspace.config.groups || [])[0]?.id) === model.groupId
  );
  const options = members.map((p) =>
    `<option value="${label(p.id)}" ${p.id === participantId ? 'selected' : ''}>${label(p.code || p.name)} — ${label(p.name || p.code)}</option>`
  ).join('');
  return `<form id="reference-report-filter-form" class="card reference-report__filters">
    <div class="card__body form-grid">
      <div class="field"><label for="reference-report-date">Fecha de consulta</label>
        <input class="input" id="reference-report-date" name="date" type="date" value="${label(model.date)}" required></div>
      ${type === 'personal' ? `<div class="field"><label for="reference-report-participant">Participante</label>
        <select class="select" id="reference-report-participant" name="participantId" required>${options}</select></div>` : ''}
      <button class="button button--primary" type="submit">Ver informe</button>
    </div>
  </form>`;
}

function raceRows(race, currency, personalId = null) {
  if (!race.bets.length) return '<p class="muted">Sin jugadas visibles para este filtro.</p>';
  return `<div class="table-wrap"><table class="summary-table">
    <thead><tr><th>Rol</th><th>Jugada</th><th>Caballo</th><th>Monto</th><th>Resultado</th></tr></thead>
    <tbody>${race.bets.flatMap((b) => {
      const legs = [
        { role: 'Juega', party: b.player, result: b.playerResult },
        ...(b.receiver ? [{ role: 'Consigue', party: b.receiver, result: b.receiverResult }] : [])
      ].filter((leg) => !personalId || leg.party.id === personalId);
      return legs.map((leg) => `<tr>
        <td><strong>${label(leg.role)}</strong> · ${label(leg.party.code)}</td>
        <td>${label(b.play)}</td><td>${label(b.horse)}</td>
        <td>${quoteMoney(b.amount, currency)}</td>
        <td class="${leg.result == null ? '' : leg.result < 0 ? 'amount-negative' : 'amount-positive'}">
          ${b.status === 'cancelled' ? 'Anulada' : leg.result == null ? 'Pendiente' : quoteMoney(leg.result, currency)}
        </td>
      </tr>`);
    }).join('')}</tbody></table></div>`;
}

function raceCard(race, currency, personalId) {
  return `<section class="card reference-report__race">
    <div class="card__head"><div><h3>${label(race.racetrack)} · Carrera ${count(race.number)}</h3>
      <small>Pizarra: ${label(race.board || 'No registrada')} · ${count(race.settled)} liquidada(s), ${count(race.pending)} pendiente(s), ${count(race.cancelled)} anulada(s)</small></div>
      <span class="badge">${count(race.bets.length)} jugadas</span></div>
    <div class="card__body">${raceRows(race, currency, personalId)}</div></section>`;
}

function renderAccount(model) {
  const currency=model.group.currency;
  return `<section class="card reference-report__balance">
    <div class="card__head"><div><h3>${label(model.participant.code)} — ${label(model.participant.name)}</h3><small>Consulta privada de movimientos existentes</small></div></div>
    <div class="card__body reference-report__kpis">
      <div><small>Saldo al iniciar el día</small><strong>${quoteMoney(model.opening, currency)}</strong></div>
      <div><small>Resultado del día</small><strong class="${model.dayResult < 0 ? 'amount-negative' : 'amount-positive'}">${quoteMoney(model.dayResult, currency)}</strong></div>
      <div><small>Disponible con aval</small><strong>${quoteMoney(model.available, currency)}</strong></div>
    </div></section>
    <section class="card"><div class="card__head"><h3>Resumen semanal</h3>
      <span class="badge">${quoteMoney(model.weekResult, currency)}</span></div>
      <div class="card__body"><div class="responsive-records">${model.weekly.map(r =>
        `<article><strong>${label(r.date)}</strong><span class="${r.amount < 0 ? 'amount-negative' : 'amount-positive'}">${quoteMoney(r.amount, currency)}</span></article>`
      ).join('')}</div></div></section>
    <section><h3 class="reference-report__section">Apuestas por carrera · ${count(model.races.length)}</h3>
      ${model.races.map(r=>raceCard(r,currency,model.participant.id)).join('') ||
       '<p class="muted">No existen jugadas de este participante para esta fecha.</p>'}
    </section>
    <section class="card"><div class="card__head"><h3>Movimientos personales · ${count(model.movements.length)}</h3></div>
      <div class="card__body"><div class="responsive-records">${model.movements.map(m=>
        `<article><strong>${label(movementTypes[m.type] || m.type)} · ${label(m.counterparty?.code || m.participant.code)}</strong>
          <span>${label(statusName[m.status] || m.status)} · ${label(m.currency)} ${label(number(m.amount))}</span>
          <small>Impacto en saldo: ${quoteMoney(m.delta, currency)}</small></article>`
      ).join('') || '<p class="muted">Sin movimientos personales.</p>'}</div></div></section>`;
}

function renderMovements(model) {
  return `<div class="grid grid--kpi">${model.totals.map(t => `<article class="card kpi"><small>${label(movementTypes[t.type] || t.type)} · ${label(t.currency)}</small>
    <strong>${label(number(t.amount))}</strong><span>${count(t.count)} operación(es)</span></article>`).join('') ||
    '<article class="card kpi"><small>Sin movimientos registrados para esta fecha</small></article>'}</div>
    <section class="card section-gap"><div class="card__head"><h3>Historial de transacciones</h3>
      <small>${count(model.postedCount)} registradas · ${count(model.cancelledCount)} anuladas</small></div>
      <div class="card__body"><div class="responsive-records">${model.movements.map(m =>
        `<article class="${m.status === 'cancelled' ? 'reference-report__cancelled' : ''}">
          <strong>${label(movementTypes[m.type] || m.type)} · ${label(m.participant.code)}
            ${m.counterparty ? ' → ' + label(m.counterparty.code) : ''}</strong>
          <span>${label(m.currency)} ${label(number(m.amount))}</span>
          <small>${label(m.time.replace('T', ' ').slice(0, 19))} · ${label(statusName[m.status] || m.status)}</small>
        </article>`
      ).join('') || '<p class="muted">Sin transacciones para esta fecha.</p>'}</div></div></section>
    <p class="muted">Las transferencias entre participantes se cuentan una vez y no representan un depósito externo. Monedas distintas no se suman.</p>`;
}

function renderRaces(model) {
  return `<div class="grid grid--two"><article class="card kpi"><small>Carreras registradas</small>
      <strong>${count(model.raceCount)}</strong></article><article class="card kpi"><small>Jugadas visibles</small>
      <strong>${count(model.betCount)}</strong></article></div>
    <div class="reference-report__races section-gap">${model.races.map(r=>raceCard(r,model.group.currency)).join('') ||
     '<section class="card"><div class="card__body">No hay carreras registradas para la fecha indicada.</div></section>'}</div>`;
}

export function renderReferenceReport(workspace, filter) {
  const model=modelFor(workspace, filter);
  const type=filter.type;
  return `<section class="reference-report" aria-label="${label(typeNames[type])}">
    <div class="page-head"><div><h2>${label(typeNames[type])}</h2>
      <p>${label(model.group.companyName)} · ${label(model.date)} · Datos internos de la jornada, sin acceso a sistemas ajenos.</p></div>
      <div class="page-actions"><button class="button" data-action="copy-reference-report" type="button">Copiar resumen</button>
      <button class="button" data-action="export-reference-report-pdf" type="button">PDF</button></div>
    </div>
    ${controls(workspace,model,type,filter.participantId)}
    ${warning(model)}
    <div class="reference-report__content section-gap">
      ${type === 'personal' ? renderAccount(model) : type === 'daily-movements' ? renderMovements(model) : renderRaces(model)}
    </div></section>`;
}

export function referenceReportLines(workspace, filter) {
  const model=modelFor(workspace,filter);
  const lines=[model.group.companyName, typeNames[filter.type]+' · '+model.date, ''];
  const curr=model.group.currency;
  if(filter.type==='personal'){
    lines.push('Participante: '+model.participant.code+' / '+model.participant.name,
      'Saldo inicial del día: '+signedMoney(model.opening,curr),
      'Resultado del día: '+signedMoney(model.dayResult,curr),
      'Disponible: '+signedMoney(model.available,curr),'Resumen semanal:');
    for(const row of model.weekly)lines.push(row.date+' · '+signedMoney(row.amount,curr));
  } else if(filter.type==='daily-movements'){
    for(const m of model.movements)lines.push(m.date+' '+m.time+' '+(movementTypes[m.type]||m.type)+
      ' '+m.participant.code+(m.counterparty?' → '+m.counterparty.code:'')+' '+
      m.currency+' '+number(m.amount)+' · '+(statusName[m.status]||m.status));
  }
  const races=filter.type==='personal'?model.races:filter.type==='race-history'?model.races:[];
  for(const r of races){
    lines.push('',r.racetrack+' · '+r.number+'ª carrera · Pizarra: '+(r.board||'No registrada'));
    for(const b of r.bets)lines.push(b.play+' '+b.horse+' '+number(b.amount)+' · '+
      b.player.code+' '+(b.status==='cancelled'?'Anulada':b.playerResult===null?'Pendiente':signedMoney(b.playerResult,curr))+
      (b.receiver?' / '+b.receiver.code+' '+(b.status==='cancelled'?'Anulada':b.receiverResult===null?'Pendiente':signedMoney(b.receiverResult,curr)):''));
  }
  if(model.invalidReferences)lines.push('ADVERTENCIA: '+model.invalidReferences+' referencias no conciliadas.');
  return lines;
}
