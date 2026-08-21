import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyLocal,
  computeBackoffMs,
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
  assert.ok(/^2026-08-(09|10)T/.test(parsed.timestamp)); // ISO day depends on the machine timezone used to parse WhatsApp local time
});

test('known operational examples classify', () => {
  assert.equal(classifyLocal('Juega 20 al caballo 3').intent, 'offer_player');
  assert.equal(classifyLocal('Consigue 15 al 5').intent, 'offer_receiver');
  assert.equal(classifyLocal('Sf').intent, 'offer_confirmation');
  assert.equal(classifyLocal('CERRADO CERRADO NO MAS JUGADAS').intent, 'race_close');
  assert.deepEqual(classifyLocal('LLEGADA 9NA 4-9-5-3 DM').entities.board, ['4','9','5','3']);
});
