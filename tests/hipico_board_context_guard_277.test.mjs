import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWhatsAppChat } from '../frontend/public/hipico-control/assets/js/whatsapp.js';
import { resolveBoardTarget } from '../frontend/public/hipico-control/assets/js/race-context-guard.js';

function workspace(track='Churchill Downs',number=1){
  return {
    config:{activeGroupId:'g1',activeWhatsappGroupId:'g1',activeRaceByGroup:{g1:'r1'},groups:[{id:'g1',companyName:'CONTROL HÍPICO',currency:'Bs.',exchangeRate:100}],racetrackCatalog:['Churchill Downs','Colonial Downs','Del Mar']},
    days:[{id:'d1',groupId:'g1',date:'2026-09-10',status:'open'}],
    races:[{id:'r1',groupId:'g1',dayId:'d1',date:'2026-09-10',racetrack:track,number,status:'locked',board:['','','','','',''],bets:[]}],
    participants:[],movements:[],exchangeRates:[]
  };
}

function parse(lines){
  return parseWhatsAppChat(lines,{racetrackCatalog:['Churchill Downs','Colonial Downs','Del Mar']});
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

test('board guard uses app-styled accessible confirmation instead of native browser prompts',()=>{
  const source = readFileSync(new URL('../frontend/public/hipico-control/assets/js/race-context-guard.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source,/window\.(?:alert|confirm)\s*\(/);
  assert.match(source,/role=\"dialog\"/);
  assert.match(source,/aria-modal=\"true\"/);
  assert.match(source,/Confirmar carrera y aplicar/);
  assert.match(source,/Control Hípico no liquida dinero por una llegada ambigua/);
});
