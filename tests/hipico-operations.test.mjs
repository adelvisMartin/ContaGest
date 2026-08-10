import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseWhatsAppChat } from '../frontend/public/hipico-control/assets/js/whatsapp.js';
import { analyzeOperationalFeed } from '../frontend/public/hipico-control/assets/js/operations.js';

const fixture = await readFile(new URL('./fixtures/hipico/2026-08-09-del-mar-r9.txt', import.meta.url), 'utf8');

test('Del Mar R9: closure, duplicate plan, result, settlement, balances and day close', () => {
  const analysis = parseWhatsAppChat(fixture, { racetrackCatalog: ['Del Mar'] });
  const ops = analyzeOperationalFeed(analysis);
  assert.equal(ops.raceState, 'JORNADA CERRADA');
  assert.deepEqual(ops.lastBoard, ['4','9','5','3']);
  assert.equal(ops.stats.duplicatePlans, 1);
  assert.equal(ops.lastSettlementSnapshot.length, 3);
  assert.equal(ops.lastBalanceSnapshot.length, 4);
  assert.equal(ops.lastSettlementSnapshot[0].receiver.amount, 19000);
  assert.equal(ops.lastBalanceSnapshot.find((row) => row.participant === 'PACO').available, 251550);
});

test('same exported chat can be replayed deterministically', () => {
  const first = analyzeOperationalFeed(parseWhatsAppChat(fixture, { racetrackCatalog: ['Del Mar'] }));
  const second = analyzeOperationalFeed(parseWhatsAppChat(fixture, { racetrackCatalog: ['Del Mar'] }));
  assert.deepEqual(second.stats, first.stats);
  assert.deepEqual(second.lastSettlementSnapshot, first.lastSettlementSnapshot);
  assert.deepEqual(second.lastBalanceSnapshot, first.lastBalanceSnapshot);
});
