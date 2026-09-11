import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWhatsAppChat } from '../frontend/public/hipico-control/assets/js/whatsapp.js';
import { resolveBoardTarget, resolveImportTarget } from '../frontend/public/hipico-control/assets/js/race-context-guard.js';

function workspace(track='Churchill Downs',number=1){
  return {
    config:{activeGroupId:'g1',activeWhatsappGroupId:'g1',activeRaceByGroup:{g1:'r1'},groups:[{id:'g1',companyName:'CONTROL HÍPICO',currency:'Bs.',exchangeRate:100}],racetrackCatalog:['Churchill Downs','Colonial Downs','Del Mar']},
    days:[{id:'d1',groupId:'g1',date:'2026-09-10',status:'open'}],
    races:[{id:'r1',groupId:'g1',dayId:'d1',date:'2026-09-10',racetrack:track,number,status:'locked',board:['','','','','',''],bets:[]}],
    participants:[],movements:[],exchangeRates:[],chatImports:[]
  };
}

function parse(lines){
  return parseWhatsAppChat(lines,{racetrackCatalog:['Churchill Downs','Colonial Downs','Del Mar']});
}

function pairedChat(raceNumber=1){
  return [
    `[4:59 p. m., 10/09/2026] Operador: Se aperturó Churchill Downs, ${raceNumber}ra Carrera`,
    '[5:00 p. m., 10/09/2026] Jugador A: Juego 1n del 5 con 100k',
    '[5:01 p. m., 10/09/2026] Jugador B: Consigo 1n del 5 con 100k'
  ].join('\n');
}

test('board with explicit matching track and race resolves MATCH',()=>{
  const analysis=parse('[5:00 p. m., 10/09/2026] Operador: Churchill Downs, 1ra Carrera\nPizarra: 1.2.8.7');
  const result=resolveBoardTarget(analysis,workspace());
  assert.equal(result.status,'MATCH');
  assert.equal(result.context.track,'Churchill Downs');
  assert.equal(result.context.raceNumber,1);
  assert.deepEqual(result.board.board,['1','2','8','7']);
});

test('known singular/plural track alias resolves exactly without fuzzy substring matching',()=>{
  const analysis=parse('[5:00 p. m., 10/09/2026] Operador: Churchill Downs, 1ra Carrera\nPizarra: 1.2.8.7');
  assert.equal(resolveBoardTarget(analysis,workspace('Churchill Down',1)).status,'MATCH');
});

test('arrival inherits nearest explicit race opening in same segment',()=>{
  const analysis=parse([
    '[4:59 p. m., 10/09/2026] Operador: Se aperturó Churchill Downs, 1ra Carrera',
    '[5:10 p. m., 10/09/2026] Operador: Llegada 1.2.8.7'
  ].join('\n'));
  const result=resolveBoardTarget(analysis,workspace());
  assert.equal(result.status,'MATCH');
  assert.equal(result.context.track,'Churchill Downs');
  assert.equal(result.context.raceNumber,1);
});

test('board for another race is blocked as MISMATCH',()=>{
  const analysis=parse('[5:10 p. m., 10/09/2026] Operador: Colonial Downs, 10ma Carrera\nPizarra: 6.8.5.2');
  const result=resolveBoardTarget(analysis,workspace('Churchill Downs',1));
  assert.equal(result.status,'MISMATCH');
  assert.match(result.reason,/Colonial Downs 10/);
  assert.match(result.reason,/Churchill Downs 1/);
});

test('arrival without race context remains AMBIGUOUS and requires explicit operator confirmation',()=>{
  const analysis=parse('[5:10 p. m., 10/09/2026] Operador: Llegada 6.8.5.2');
  const result=resolveBoardTarget(analysis,workspace());
  assert.equal(result.status,'AMBIGUOUS');
  assert.match(result.reason,/no declara hipódromo y carrera/i);
});

test('opening from a previous closed segment is never inherited by a later board',()=>{
  const analysis=parse([
    '[4:59 p. m., 10/09/2026] Operador: Se aperturó Churchill Downs, 1ra Carrera',
    '[5:05 p. m., 10/09/2026] Operador: CARRERA CERRADA',
    '[5:20 p. m., 10/09/2026] Operador: Llegada 6.8.5.2'
  ].join('\n'));
  const result=resolveBoardTarget(analysis,workspace());
  assert.equal(result.status,'AMBIGUOUS');
});

test('offers inherit exact track and race number from an actionable opening',()=>{
  const analysis=parse(pairedChat(1));
  assert.equal(analysis.offers.length,2);
  assert.deepEqual(analysis.offers.map((offer)=>[offer.track,offer.raceNumber]),[
    ['Churchill Downs',1],
    ['Churchill Downs',1]
  ]);
  assert.equal(analysis.matches.length,1);
  assert.equal(analysis.matches[0].track,'Churchill Downs');
  assert.equal(analysis.matches[0].raceNumber,1);
});

test('a new explicit race opening separates otherwise identical offers without requiring a closure message',()=>{
  const analysis=parse([
    '[4:59 p. m., 10/09/2026] Operador: Se aperturó Churchill Downs, 1ra Carrera',
    '[5:00 p. m., 10/09/2026] Jugador A: Juego 1n del 5 con 100k',
    '[5:02 p. m., 10/09/2026] Operador: Se aperturó Churchill Downs, 2da Carrera',
    '[5:03 p. m., 10/09/2026] Jugador B: Consigo 1n del 5 con 100k'
  ].join('\n'));
  assert.equal(analysis.matches.length,0);
  assert.deepEqual(analysis.activeOffers.map((offer)=>offer.raceNumber),[1,2]);
  assert.notEqual(analysis.activeOffers[0].segmentId,analysis.activeOffers[1].segmentId);
});

test('an ambiguous opening ends inherited race context instead of silently assigning later offers to the previous race',()=>{
  const analysis=parse([
    '[4:59 p. m., 10/09/2026] Operador: Se aperturó Churchill Downs, 1ra Carrera',
    '[5:02 p. m., 10/09/2026] Operador: Se aperturó la carrera',
    '[5:03 p. m., 10/09/2026] Jugador A: Juego 1n del 5 con 100k'
  ].join('\n'));
  assert.equal(analysis.offers.length,1);
  assert.equal(analysis.offers[0].raceNumber,null);
  assert.equal(analysis.offers[0].track,'');
});

test('exactly bound whatsapp matches are eligible only for the same active race',()=>{
  const analysis=parse(pairedChat(1));
  assert.equal(resolveImportTarget(analysis,workspace('Churchill Downs',1)).status,'MATCH');
  const mismatch=resolveImportTarget(analysis,workspace('Churchill Downs',2));
  assert.equal(mismatch.status,'MISMATCH');
  assert.match(mismatch.reason,/Churchill Downs 1/);
  assert.match(mismatch.reason,/Churchill Downs 2/);
});

test('match target blocks another track even when the race number is the same',()=>{
  const analysis=parse(pairedChat(1));
  const mismatch=resolveImportTarget(analysis,workspace('Colonial Downs',1));
  assert.equal(mismatch.status,'MISMATCH');
});

test('contextless matched offers require explicit operator confirmation before import',()=>{
  const analysis=parse([
    '[5:00 p. m., 10/09/2026] Jugador A: Juego 1n del 5 con 100k',
    '[5:01 p. m., 10/09/2026] Jugador B: Consigo 1n del 5 con 100k'
  ].join('\n'));
  assert.equal(analysis.matches.length,1);
  assert.equal(resolveImportTarget(analysis,workspace()).status,'AMBIGUOUS');
});

test('race guards use app-styled accessible confirmation instead of native browser prompts',()=>{
  const source = readFileSync(new URL('../frontend/public/hipico-control/assets/js/race-context-guard.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source,/window\.(?:alert|confirm)\s*\(/);
  assert.match(source,/role=\"dialog\"/);
  assert.match(source,/aria-modal=\"true\"/);
  assert.match(source,/Confirmar carrera y aplicar/);
  assert.match(source,/Confirmar carrera e importar/);
  assert.match(source,/data-action=\"apply-chat-board\"/);
  assert.match(source,/data-action=\"import-chat-matches\"/);
  assert.match(source,/Control Hípico no liquida dinero por una llegada ambigua/);
});
