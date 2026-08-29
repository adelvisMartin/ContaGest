export const HIPICO_VIEWS = Object.freeze([
  { id: 'dashboard', label: 'Resumen' },
  { id: 'race', label: 'Carrera activa' },
  { id: 'whatsapp', label: 'Chat WhatsApp' },
  { id: 'advanced', label: 'Adelantadas' },
  { id: 'participants', label: 'Participantes' },
  { id: 'history', label: 'Historial' },
  { id: 'reports', label: 'Cierres y saldos' },
  { id: 'polla', label: 'POLLA' },
  { id: 'settings', label: 'Configuración' }
]);

export const HIPICO_VIEWPORTS = Object.freeze([
  { id: 'mobile-360', width: 360, height: 800, touch: true },
  { id: 'mobile-390', width: 390, height: 844, touch: true },
  { id: 'mobile-430', width: 430, height: 932, touch: true },
  { id: 'tablet-768', width: 768, height: 1024, touch: true },
  { id: 'desktop-1366', width: 1366, height: 900, touch: false },
  { id: 'desktop-1920', width: 1920, height: 1080, touch: false },
  { id: 'mobile-landscape', width: 844, height: 390, touch: true }
]);

export const HIPICO_STATE_CASES = Object.freeze([
  { id: 'normal', appliesTo: 'all', evidence: 'fixture' },
  { id: 'empty', appliesTo: 'all', evidence: 'fixture' },
  { id: 'offline', appliesTo: 'all', evidence: 'browser-network' },
  { id: 'loading', appliesTo: 'shell', evidence: 'boot-splash' },
  { id: 'error', appliesTo: 'shell', evidence: 'runtime-error-capture' },
  { id: 'permission', appliesTo: 'auth', evidence: 'auth-denial' },
  { id: 'recovery', appliesTo: 'recovery', evidence: 'recovery.html' }
]);

const TODAY = '2026-08-29';
const NOW = `${TODAY}T16:00:00.000Z`;

function normalFixture() {
  return {
    config: {
      theme: 'light',
      activeGroupId: 'group-1',
      activeWhatsappGroupId: 'group-1',
      activeRaceByGroup: { 'group-1': 'race-1', 'group-2': 'race-2' },
      captureGroupIds: ['group-1', 'group-2'],
      groups: [
        {
          id: 'group-1',
          name: 'Triple Crown Jornada Principal de Prueba',
          companyName: 'CLUB HÍPICO TRIPLE CROWN · OPERACIÓN PRINCIPAL',
          color: '#7ea596',
          currency: 'Bs.',
          exchangeRate: 160,
          commission: 0.05,
          clientLabel: 'Participantes'
        },
        {
          id: 'group-2',
          name: 'LAB Operadores Simultáneos',
          companyName: 'LAB DE PRUEBAS HÍPICAS MULTIUSUARIO',
          color: '#7f86c7',
          currency: 'USD',
          exchangeRate: 1,
          commission: 0.05,
          clientLabel: 'Participantes'
        }
      ]
    },
    participants: [
      { id: 'p-1', groupId: 'group-1', code: 'cc', name: 'Cliente Con Nombre Deliberadamente Largo Para QA Responsive', active: true, avalBs: 999999999.99, avalUsd: 999999.99, previousWeekBalance: -12345.67 },
      { id: 'p-2', groupId: 'group-1', code: 'bladi', name: 'Bladi QA', active: true, avalBs: 250000, avalUsd: 1000, previousWeekBalance: 17500 },
      { id: 'p-3', groupId: 'group-2', code: 'lab1', name: 'Operador LAB Uno', active: true, avalBs: 0, avalUsd: 5000, previousWeekBalance: 0 }
    ],
    days: [
      { id: 'day-1', groupId: 'group-1', date: TODAY, status: 'open', closedAt: null, closure: null },
      { id: 'day-2', groupId: 'group-2', date: TODAY, status: 'open', closedAt: null, closure: null }
    ],
    races: [
      {
        id: 'race-1', groupId: 'group-1', dayId: 'day-1', date: TODAY, racetrack: 'Hipódromo con nombre extremadamente largo para forzar composición', number: 12,
        status: 'open', exchangeRate: 160, board: ['8', '12', '3', '11', '4', '7'], boardPositions: [1, 2, 3, 4, 5, 6],
        bets: [
          { id: 'bet-1', groupId: 'group-1', playerId: 'p-1', receiverId: 'p-2', play: '1/2', horse: '8', amount: 99999999.99, status: 'pending', source: 'live', messageStatus: 'pending', createdAt: NOW, updatedAt: NOW },
          { id: 'bet-2', groupId: 'group-1', playerId: 'p-2', receiverId: 'p-1', play: 'PP', horse: '12', amount: 15000, status: 'settled', source: 'live', messageStatus: 'copied', settlement: { commissionAmount: 750, net: 14250 }, createdAt: NOW, updatedAt: NOW }
        ]
      },
      {
        id: 'race-2', groupId: 'group-2', dayId: 'day-2', date: TODAY, racetrack: 'LAB Track', number: 3,
        status: 'locked', exchangeRate: 1, board: ['1', '2', '3', '', '', ''], boardPositions: [1, 2, 3, 4, 5, 6], bets: []
      }
    ],
    advancedBets: [
      { id: 'adv-1', groupId: 'group-1', date: TODAY, racetrack: 'Saratoga', raceNumber: 9, playerCode: 'cc', receiverCode: 'bladi', play: '2/3', horse: '5', amount: 45000, createdAt: NOW }
    ],
    movements: [
      { id: 'mov-1', groupId: 'group-1', participantId: 'p-1', amount: -999999.99, currency: 'Bs.', type: 'adjustment', note: 'QA negativo grande', createdAt: NOW },
      { id: 'mov-2', groupId: 'group-1', participantId: 'p-2', amount: 1250000.25, currency: 'Bs.', type: 'payment', note: 'QA positivo grande', createdAt: NOW }
    ],
    exchangeRates: [
      { id: 'rate-1', groupId: 'group-1', date: TODAY, rate: 160 },
      { id: 'rate-2', groupId: 'group-2', date: TODAY, rate: 1 }
    ],
    weekClosures: [],
    pollas: [
      { id: 'polla-1', groupId: 'group-1', date: TODAY, status: 'open', name: 'POLLA QA Jornada Completa', entries: [] }
    ],
    audit: [
      { id: 'audit-1', groupId: 'group-1', action: 'qa_fixture_loaded', entityType: 'workspace', entityId: 'qa', message: 'Fixture determinista #105', createdAt: NOW }
    ],
    syncQueue: [],
    syncMeta: { lastSyncedVersion: 8, lastSyncedAt: '2026-08-29T15:58:00.000Z', conflictSnapshots: 0 }
  };
}

function emptyFixture() {
  return {
    config: {
      theme: 'light',
      activeGroupId: 'group-1',
      activeWhatsappGroupId: 'group-1',
      activeRaceByGroup: { 'group-1': null },
      captureGroupIds: ['group-1'],
      groups: [{ id: 'group-1', name: 'Grupo QA vacío', companyName: 'GRUPO QA VACÍO', color: '#7ea596', currency: 'Bs.', exchangeRate: 160, commission: 0.05 }]
    },
    participants: [],
    days: [{ id: 'day-empty', groupId: 'group-1', date: TODAY, status: 'open', closure: null }],
    races: [],
    advancedBets: [],
    movements: [],
    exchangeRates: [{ id: 'rate-empty', groupId: 'group-1', date: TODAY, rate: 160 }],
    weekClosures: [],
    pollas: [],
    audit: [],
    syncQueue: [],
    syncMeta: { lastSyncedVersion: 0, lastSyncedAt: null, conflictSnapshots: 0 }
  };
}

export function buildHipicoQaFixture(state = 'normal') {
  if (state === 'empty') return structuredClone(emptyFixture());
  return structuredClone(normalFixture());
}

export function matrixRows() {
  return HIPICO_VIEWPORTS.flatMap((viewport) => HIPICO_VIEWS.map((view) => ({
    id: `${view.id}:${viewport.id}:normal`,
    view: view.id,
    viewport: viewport.id,
    state: 'normal'
  })));
}
