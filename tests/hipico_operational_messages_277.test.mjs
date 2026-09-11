import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateArrivalWhatsappText,
  generateBalancesWhatsappText,
  generateBetReceiptText,
  generateDailySummaryText,
  generateParticipantStatementText,
  shortDate
} from '../frontend/public/hipico-control/assets/js/format.js';
import { parseWhatsAppChat } from '../frontend/public/hipico-control/assets/js/whatsapp.js';

const workspace = {
  config: {
    activeGroupId: 'group-1',
    groups: [{
      id: 'group-1',
      name: 'Control Hípico',
      companyName: 'CONTROL HÍPICO',
      currency: 'Bs.',
      footerMessage: 'TILDE SU JUGADA Y SE REVISARÁ'
    }]
  },
  participants: [
    { id: 'p-arevalo', groupId: 'group-1', code: 'arevalo', name: 'Arevalo', active: true },
    { id: 'p-bladi', groupId: 'group-1', code: 'bladi', name: 'Bladi', active: true },
    { id: 'p-zero', groupId: 'group-1', code: 'mamu', name: 'Mamu', active: true }
  ]
};

const bet = {
  id: 'bet-8',
  playerId: 'p-arevalo',
  receiverId: 'p-bladi',
  play: '1/2',
  horse: '8',
  amount: 10000,
  status: 'pending',
  createdAt: '2026-09-10T17:00:51-04:00'
};

const race = {
  id: 'race-10',
  groupId: 'group-1',
  date: '2026-09-10',
  racetrack: 'Colonial Downs',
  number: 10,
  retired: [],
  board: ['6', '8', '5', '2', '', ''],
  bets: [
    { ...bet, id: 'bet-1' },
    { ...bet, id: 'bet-2' },
    { ...bet, id: 'bet-3' },
    { ...bet, id: 'bet-4' },
    { ...bet, id: 'bet-5' },
    { ...bet, id: 'bet-6' },
    { ...bet, id: 'bet-7' },
    bet
  ]
};

test('receipt follows real WhatsApp format without redundant status or time', () => {
  const text = generateBetReceiptText(workspace, race, bet);
  assert.match(text, /CONTROL HÍPICO/);
  assert.match(text, /Colonial Downs, 10ma Carrera/);
  assert.match(text, /Pizarra: 6\.8\.5\.2\.\./);
  assert.match(text, /Juega Arevalo 1\/2 \(8\) con 10\.000,00 da Bladi/);
  assert.match(text, /Jugada #8 de 8/);
  assert.match(text, /Registrada: 10\/9\/2026/);
  assert.doesNotMatch(text, /APUESTA REGISTRADA|PENDIENTE DE PIZARRA/);
  assert.doesNotMatch(text, /5:00|17:00|p\.\s*m\./i);
});

test('receipt remains renderable when a legacy bet has no valid createdAt timestamp', () => {
  const legacyBet={...bet,id:'bet-legacy',createdAt:'fecha-corrupta'};
  const legacyRace={...race,bets:[...race.bets,legacyBet]};
  assert.doesNotThrow(()=>generateBetReceiptText(workspace,legacyRace,legacyBet));
  const text=generateBetReceiptText(workspace,legacyRace,legacyBet);
  assert.match(text,/Registrada: sin fecha/);
  assert.match(text,/Jugada #9 de 9/);
});

test('visible operational dates fail soft instead of throwing or inventing today',()=>{
  assert.equal(shortDate('fecha-corrupta'),'Sin fecha');
  assert.equal(shortDate(''),'Sin fecha');
  const corruptRace={...race,date:'fecha-corrupta'};
  assert.doesNotThrow(()=>generateBetReceiptText(workspace,corruptRace,bet));
  assert.match(generateBetReceiptText(workspace,corruptRace,bet),/fecha no disponible/);

  const statement=generateParticipantStatementText(workspace,{
    groupId:'group-1',participant:workspace.participants[0],date:'fecha-corrupta',dailyRows:[],tracks:[],weekTotal:0,dayTotal:0
  });
  assert.match(statement,/saldo del día fecha no disponible/);

  const summary=generateDailySummaryText(workspace,{groupId:'group-1',date:'fecha-corrupta',status:'open'},
    {races:0,bets:0,volume:0,settled:0,pending:0,cancelled:0,commission:0,controlDifference:0});
  assert.match(summary,/CIERRE DIARIO · Sin fecha/);
});

test('arrival message is generated from the current official board', () => {
  const text = generateArrivalWhatsappText(workspace, race);
  assert.match(text, /Colonial Downs, 10ma Carrera/);
  assert.match(text, /🏁 Llegada: 6\.8\.5\.2\.\./);
  assert.throws(() => generateArrivalWhatsappText(workspace, { ...race, board: [] }), /pizarra/i);
});

test('pozo list keeps active participants including zero available balance', () => {
  const text = generateBalancesWhatsappText(workspace, [
    { participant: workspace.participants[0], balance: 169000 },
    { participant: workspace.participants[1], balance: -7500 },
    { participant: workspace.participants[2], balance: 0 }
  ]);
  assert.match(text, /TERCIO\s+\/\s+DISPONIBLE/);
  assert.match(text, /AREVALO\s+169\.000,00/);
  assert.match(text, /BLADI\s+-7\.500,00/);
  assert.match(text, /MAMU\s+0,00/);
});

test('private participant statement preserves weekly and per-track breakdown', () => {
  const text = generateParticipantStatementText(workspace, {
    groupId: 'group-1',
    participant: workspace.participants[0],
    date: '2026-09-06',
    dailyRows: [
      { date: '03/09/26', amount: 75500 },
      { date: '04/09/26', amount: 29375 },
      { date: '05/09/26', amount: -7750 },
      { date: '06/09/26', amount: -52000 }
    ],
    aval: 0,
    pozo: 0,
    weekTotal: 45125,
    available: 45125,
    dayTotal: -52000,
    tracks: [
      { racetrack: 'Del Mar', races: [{ number: 8, amount: -30000 }], total: -30000 },
      { racetrack: 'Emerald Downs', races: [{ number: 7, amount: 38000 }], total: 38000 },
      { racetrack: 'La Rinconada', races: [{ number: 14, amount: -60000 }], total: -60000 }
    ]
  });
  assert.match(text, /Cuentas AREVALO/);
  assert.match(text, /SEMANA: Bs\. \+45\.125,00/);
  assert.match(text, /Del Mar[\s\S]*8ta \\ Bs\. -30\.000,00/);
  assert.match(text, /Total del día\nBs\. -52\.000,00/);
  assert.match(text, /Por favor confirmar a la brevedad posible\./);
});

test('parser detects explicit race opening and normalizes common track aliases', () => {
  const analysis = parseWhatsAppChat('[5:01 p. m., 10/09/2026] Admin: Se aperturó Churchill Down, 1ra Carrera');
  assert.equal(analysis.raceOpenings.length, 1);
  assert.equal(analysis.raceOpenings[0].raceContext.track, 'Churchill Downs');
  assert.equal(analysis.raceOpenings[0].raceContext.raceNumber, 1);
  assert.equal(analysis.raceOpenings[0].raceContext.actionable, true);
  assert.equal(analysis.stats.openings, 1);
});

test('ambiguous opening signal is detected but never marked actionable', () => {
  const analysis = parseWhatsAppChat('[5:01 p. m., 10/09/2026] Admin: Se aperturó la carrera');
  assert.equal(analysis.raceOpenings.length, 1);
  assert.equal(analysis.raceOpenings[0].raceContext.actionable, false);
  assert.equal(analysis.raceOpenings[0].raceContext.track, '');
  assert.equal(analysis.raceOpenings[0].raceContext.raceNumber, null);
});
