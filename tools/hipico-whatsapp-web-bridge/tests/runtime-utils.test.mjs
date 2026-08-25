import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyLocal,
  computeBackoffMs,
  parseOperationalOffer,
  parseRetryAfterMs,
  parseWhatsAppPre,
  sourceTitleMatches,
  splitGroupMatches
} from '../src/runtime-utils.mjs';

test('group aliases include COWN/CROWN safely', () => {
  const matches = splitGroupMatches('CLUB HIPICO TRIPLE COWN|CLUB HIPICO TRIPLE CROWN');
  assert.equal(sourceTitleMatches('🇺🇸 CLUB HIPICO TRIPLE COWN 🇺🇸', matches), true);
  assert.equal(sourceTitleMatches('Otro grupo', matches), false);
});

test('backoff is exponential and capped', () => {
  assert.equal(computeBackoffMs(1, { baseMs: 5000, maxMs: 900000 }), 5000);
  assert.equal(computeBackoffMs(2, { baseMs: 5000, maxMs: 900000 }), 10000);
  assert.equal(computeBackoffMs(20, { baseMs: 5000, maxMs: 900000 }), 900000);
});

test('Retry-After seconds is respected', () => {
  const headers = new Headers({ 'retry-after': '120' });
  assert.equal(parseRetryAfterMs(headers, 0), 120000);
});

test('WhatsApp Spanish preamble parses sender/date', () => {
  const parsed = parseWhatsAppPre('[8:11 p. m., 9/8/2026] +56 9 7588 7453:');
  assert.equal(parsed.parsed, true);
  assert.equal(parsed.senderLabel, '+56 9 7588 7453');
  assert.equal(new Date(parsed.timestamp).getUTCFullYear(), 2026);
  assert.ok(/^2026-08-(09|10)T/.test(parsed.timestamp));
});

test('known operational examples classify', () => {
  assert.equal(classifyLocal('Juega 20 al caballo 3').intent, 'offer_player');
  assert.equal(classifyLocal('Consigue 15 al 5').intent, 'offer_receiver');
  assert.equal(classifyLocal('Sf').intent, 'offer_confirmation');
  assert.equal(classifyLocal('CERRADO CERRADO NO MAS JUGADAS').intent, 'race_close');
  assert.deepEqual(classifyLocal('LLEGADA 9NA 4-9-5-3 DM').entities.board, ['4','9','5','3']);
});

test('August 24 Triple Crown offers preserve play, horse and Venezuelan amount format', () => {
  assert.deepEqual(parseOperationalOffer('Juego 2p del 1 50k'), {
    role:'player', play:'2P', horse:'1', amount:50000, raw:'Juego 2p del 1 50k'
  });
  assert.deepEqual(parseOperationalOffer('Juego 1y2 1 con 100k'), {
    role:'player', play:'1/2', horse:'1', amount:100000, raw:'Juego 1y2 1 con 100k'
  });
  assert.deepEqual(parseOperationalOffer('Juego 10a8 el 1 40k'), {
    role:'player', play:'10A8', horse:'1', amount:40000, raw:'Juego 10a8 el 1 40k'
  });
});

test('August 24 plan row extracts participant, counterparty and grouped amount', () => {
  const offer = parseOperationalOffer('Juega Gaceta 3/3 (3) con 60.000,00 da Roca');
  assert.equal(offer?.role, 'player');
  assert.equal(offer?.participant, 'Gaceta');
  assert.equal(offer?.counterparty, 'Roca');
  assert.equal(offer?.play, '3/3');
  assert.equal(offer?.horse, '3');
  assert.equal(offer?.amount, 60000);
});

test('empty Pizarra in a TERCIOS header does not steal plan classification', () => {
  const plan = classifyLocal('Presque Isle, 8va Carrera\nPizarra: .....\n\nTERCIOS\nJuega Gaceta 3/3 (3) con 60.000,00 da Roca');
  assert.equal(plan.intent, 'plan_snapshot');
  assert.deepEqual(plan.entities.board, []);
  assert.equal(plan.entities.offers?.[0]?.amount, 60000);
});

test('settlement with populated board wins over generic result and keeps rows', () => {
  const settlement = classifyLocal('Presque Isle, 8va Carrera\nPizarra: 2.4.10...\n\nTERCIOS\n3/3 (3) con 60.000,00\nJuega Gaceta Bs. -60.000,00\nConsigue Roca Bs. +57.000,00');
  assert.equal(settlement.intent, 'settlement_snapshot');
  assert.deepEqual(settlement.entities.board, ['2','4','10']);
  assert.deepEqual(settlement.entities.settlementRows, [
    { role:'player', participant:'Gaceta', amount:-60000 },
    { role:'receiver', participant:'Roca', amount:57000 }
  ]);
});

test('balance table is parsed as historical reconciliation evidence', () => {
  const snapshot = classifyLocal('Club Hipico Triple Cowns\nTERCIO\tDISPONIBLE\nAREVALO\t-243.030,00\nDAKOTA\t496.600,00\nROCA\t808.990,00');
  assert.equal(snapshot.intent, 'balance_snapshot');
  assert.deepEqual(snapshot.entities.balances, [
    { participant:'AREVALO', available:-243030 },
    { participant:'DAKOTA', available:496600 },
    { participant:'ROCA', available:808990 }
  ]);
});

test('day close and casual chat remain distinct', () => {
  assert.equal(classifyLocal('BUENAS NOCHES DAMAS Y CABALLEROS ESTO ES TODO POR EL DÍA DE HOY').intent, 'day_close');
  assert.equal(classifyLocal('La gente se fue a dormir 😴').intent, 'conversation');
  assert.equal(classifyLocal('Se fue').intent, 'offer_confirmation');
});
