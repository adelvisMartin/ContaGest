import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWhatsAppChat } from '../frontend/public/hipico-control/assets/js/whatsapp.js';
import { __test__ as assistant } from '../frontend/public/hipico-control/assets/js/race-opening-assistant.js';

const catalog=['Churchill Downs','Colonial Downs','Parx Racing'];

function parse(lines){
  return parseWhatsAppChat(lines.join('\n'),{racetrackCatalog:catalog});
}

test('latest explicit opening becomes a reviewable operator suggestion',()=>{
  const analysis=parse(['[8:00 p. m., 11/9/2026] Operador: Se aperturó Churchill Downs 3ra carrera']);
  const opening=assistant.latestActionableOpening(analysis);
  const model=assistant.openingModel(opening);
  assert.deepEqual(model,{messageId:opening.id,track:'Churchill Downs',raceNumber:3});
  const markup=assistant.cardMarkup(model,null);
  assert.match(markup,/Preparar carrera/);
  assert.match(markup,/requiere confirmación del operador/);
  assert.match(markup,/no cambia la carrera automáticamente/);
});

test('a newer ambiguous opening invalidates an older actionable suggestion',()=>{
  const analysis=parse([
    '[8:00 p. m., 11/9/2026] Operador: Se aperturó Churchill Downs 3ra carrera',
    '[8:10 p. m., 11/9/2026] Operador: Se aperturó la carrera'
  ]);
  assert.equal(analysis.raceOpenings.length,2);
  assert.equal(analysis.raceOpenings.at(-1).raceContext.actionable,false);
  assert.equal(assistant.latestActionableOpening(analysis),null);
});

test('matching active race is informational and does not offer a duplicate creation action',()=>{
  const opening={messageId:'m1',track:'Churchill Downs',raceNumber:3};
  const markup=assistant.cardMarkup(opening,{racetrack:'Churchill Downs',number:3});
  assert.match(markup,/YA ACTIVA/);
  assert.doesNotMatch(markup,/data-race-opening-prepare/);
});

test('different race requires explicit preparation instead of automatic mutation',()=>{
  const opening={messageId:'m1',track:'Colonial Downs',raceNumber:4};
  const markup=assistant.cardMarkup(opening,{racetrack:'Churchill Downs',number:3});
  assert.match(markup,/POR REVISAR/);
  assert.match(markup,/data-action="new-race"/);
  assert.match(markup,/Confirma|confirmación|revisar/i);
});
