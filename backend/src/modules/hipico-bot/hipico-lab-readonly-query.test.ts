import test from 'node:test';
import assert from 'node:assert/strict';
import {isLabInformationRequest} from './hipico-lab-readonly-query.js';

const classified=(intent:string,risk:'safe'|'review'|'monetary')=>({intent,risk});

test('informational result, participants and race-state questions are read-only eligible',()=>{
  assert.equal(isLabInformationRequest('¿Cuál fue el resultado de carrera 5?','result',classified('conversation','review')),true);
  assert.equal(isLabInformationRequest('¿Qué caballos participan en carrera 5?','participants',classified('conversation','review')),true);
  assert.equal(isLabInformationRequest('¿Estado de carrera 5?','status',classified('status_non_monetary','safe')),true);
});

test('monetary intents and result submissions never inherit the read-only exception',()=>{
  const cases=[
    ['¿resultado y pagar premio?','result',classified('conversation','review')],
    ['¿carrera 5, saldo de 50 Bs?','status',classified('betting_or_balance','monetary')],
    ['RESULTADO: 7-3-1','result',classified('race_result','review')],
    ['¿Quién ganó? confirma la jugada','result',classified('conversation','review')],
    ['resultado de carrera 5; cobrar $100','result',classified('conversation','review')],
    ['¿jugada ganadora y registrar?','result',classified('conversation','review')]
  ] as const;
  for(const [text,purpose,kind] of cases){
    assert.equal(isLabInformationRequest(text,purpose,kind),false,text);
  }
});

test('purpose mismatch or arbitrary statements cannot force aggregate reads',()=>{
  assert.equal(isLabInformationRequest('Hola','result',classified('greeting','safe')),false);
  assert.equal(isLabInformationRequest('Voy a comprar caballos','participants',classified('conversation','review')),false);
  assert.equal(isLabInformationRequest('¿Cuál es el resultado?','status',classified('conversation','review')),false);
  assert.equal(isLabInformationRequest('¿Qué caballos corren?','participants',classified('race_open','review')),false);
});


test('new canonical schedule purposes require specific informational-only topic',()=>{
  assert.equal(isLabInformationRequest('¿Qué carrera sigue?','next',{intent:'conversation',risk:'review'}),true);
  assert.equal(isLabInformationRequest('¿Cuál es la carrera activa?','active',{intent:'conversation',risk:'review'}),true);
  assert.equal(isLabInformationRequest('¿Cuál es la cartelera?','schedule',{intent:'conversation',risk:'review'}),true);
  assert.equal(isLabInformationRequest('¿Qué carrera sigue y pagar premio?','next',{intent:'conversation',risk:'review'}),false);
  assert.equal(isLabInformationRequest('Registra la programación','schedule',{intent:'conversation',risk:'review'}),false);
  assert.equal(isLabInformationRequest('¿Qué carrera sigue?','next',{intent:'offer_player',risk:'monetary'}),false);
});
