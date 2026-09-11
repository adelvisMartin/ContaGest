import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWhatsAppChat } from '../frontend/public/hipico-control/assets/js/whatsapp.js';

const catalog = ['Churchill Downs', 'Gulfstream Park', 'Colonial Downs'];
const parse = (lines) => parseWhatsAppChat(lines.join('\n'), { racetrackCatalog: catalog });

test('explicit different track without race number never inherits active race number', () => {
  const analysis = parse([
    '[4:59 p. m., 10/09/2026] Operador: Se aperturó Churchill Downs, 1ra Carrera',
    '[5:00 p. m., 10/09/2026] Jugador A: Juego 1n del 5 con 100k Gulfstream'
  ]);
  assert.equal(analysis.offers.length, 1);
  const offer = analysis.offers[0];
  assert.equal(offer.track, 'Gulfstream Park');
  assert.equal(offer.raceNumber, null);
  assert.equal(offer.requiresApproval, true);
  assert.match(offer.reviewReasons.join(' '), /contradice la carrera activa/i);
  assert.match(offer.warnings.join(' '), /número de carrera no confirmado/i);
});

test('same explicit track may inherit the active race number', () => {
  const analysis = parse([
    '[4:59 p. m., 10/09/2026] Operador: Se aperturó Churchill Downs, 1ra Carrera',
    '[5:00 p. m., 10/09/2026] Jugador A: Juego 1n del 5 con 100k Churchill Downs'
  ]);
  assert.equal(analysis.offers.length, 1);
  assert.equal(analysis.offers[0].track, 'Churchill Downs');
  assert.equal(analysis.offers[0].raceNumber, 1);
  assert.equal(analysis.offers[0].requiresApproval, false);
});

test('explicit different track and explicit race number preserve their own exact context', () => {
  const analysis = parse([
    '[4:59 p. m., 10/09/2026] Operador: Se aperturó Churchill Downs, 1ra Carrera',
    '[5:00 p. m., 10/09/2026] Jugador A: Juego 1n del 5 con 100k Gulfstream 3ra Carrera',
    '[5:01 p. m., 10/09/2026] Jugador B: Consigo 1n del 5 con 100k Gulfstream 3ra Carrera'
  ]);
  assert.equal(analysis.matches.length, 1);
  assert.equal(analysis.matches[0].track, 'Gulfstream Park');
  assert.equal(analysis.matches[0].raceNumber, 3);
});
