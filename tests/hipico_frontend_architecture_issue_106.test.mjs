import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createWhatsAppParser,
  generateClosureText,
  matchChatOffers,
  normalizeChatPlay,
  parseWhatsAppChat,
  participantMatchesSender,
  senderCode
} from '../frontend/public/hipico-control/assets/js/whatsapp.js';
import { parseWhatsAppChat as parseFromService } from '../frontend/public/hipico-control/assets/js/whatsapp/parser.js';

const representativeChat = [
  '[1:15 p. m., 29/08/2026] CC: JUEGO 1/2 DEL 8 15mil Parx',
  '[1:16 p. m., 29/08/2026] Bladi: CONSIGO 1/2 DEL 8 15mil Parx'
].join('\n');

test('#106 keeps the legacy whatsapp facade connected to the extracted parser service', () => {
  const fromFacade = parseWhatsAppChat(representativeChat);
  const fromService = parseFromService(representativeChat);
  assert.deepEqual(fromFacade, fromService);
  assert.equal(fromFacade.stats.messages, 2);
  assert.equal(fromFacade.stats.offers, 2);
  assert.equal(fromFacade.stats.matches, 1);
  assert.equal(fromFacade.matches[0].amount, 15_000);
  assert.equal(fromFacade.matches[0].track, 'Parx Racing');
});

test('#106 parser adapter injects defaults without browser globals', () => {
  const parser = createWhatsAppParser({ racetrackCatalog: ['Will Rogers Downs'] });
  const result = parser.parse([
    '[9:01 a. m., 29/08/2026] Casa A: JUEGO PP DEL 4 20mil Will Rogers Downs',
    '[9:02 a. m., 29/08/2026] Casa B: CONSIGO PP DEL 4 20mil Will Rogers Downs'
  ].join('\n'));
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].track, 'Will Rogers Downs');
  assert.equal(result.matches[0].amount, 20_000);
});

test('#106 keeps matching and sender public contracts stable', () => {
  assert.equal(normalizeChatPlay('2 y 3'), '2/3');
  assert.equal(participantMatchesSender({ code: 'cc', name: 'Casa Central' }, 'CC'), true);
  assert.equal(participantMatchesSender({ phone: '+58 412 555 1234' }, 'Otro', '584125551234'), true);
  assert.match(senderCode('Casa Central'), /^casacentral$/);
  assert.match(generateClosureText('GRUPO QA', 'americanas'), /GRUPO QA/);
  assert.equal(typeof matchChatOffers, 'function');
});

test('#106 parser remains pure/testable and facade remains intentionally small', async () => {
  const { readFile } = await import('node:fs/promises');
  const parserSource = await readFile(new URL('../frontend/public/hipico-control/assets/js/whatsapp/parser.js', import.meta.url), 'utf8');
  const facadeSource = await readFile(new URL('../frontend/public/hipico-control/assets/js/whatsapp.js', import.meta.url), 'utf8');
  assert.doesNotMatch(parserSource, /\bdocument\b|\bwindow\b|\blocalStorage\b|\bindexedDB\b/);
  assert.match(facadeSource, /from '\.\/whatsapp\/parser\.js'/);
  assert.ok(facadeSource.split(/\r?\n/).length < 80, 'la fachada no debe volver a concentrar el parser');
});
