import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, OPERATIONAL_INTENTS } from './hipico-operational-classifier.js';

const corpus:[string,string][]=[
  ['Juega PP del 3 con 20','offer_player'],
  ['Juego 1N del 4 con 25','offer_player'],
  ['Consigue 1/2 del 5 con 15','offer_receiver'],
  ['Consigo show del 2 con 10','offer_receiver'],
  ['Cierra carrera 4','race_close'],
  ['Cerrar carrera 4','race_close'],
  ['Cierren la 4','race_close'],
  ['Cerramos la 4','race_close'],
  ['No va mas la 4','race_close'],
  ['No mas jugadas carrera 4','race_close'],
  ['Cerrado cerrado','race_close'],
  ['Cierre de jornada','day_close'],
  ['Esto es todo por el dia de hoy','day_close'],
  ['Los esperamos manana','day_close'],
  ['Pizarra: 2 1 6 4','race_result'],
  ['Llegada 2.1.6.4','race_result'],
  ['Resultado 3-5-1','race_result'],
  ['TERCIO DISPONIBLE\nAdel 100\nLuis -50','balance_snapshot'],
  ['TERCIOS\nJuega PP del 3 con 20','plan_snapshot'],
  ['TERCIOS\nJuega Adel Bs 20\nConsigue Luis Bs 20','settlement_snapshot'],
  ['Liquidacion carrera 4','settlement_snapshot'],
  ['Debe confirmar','pending_confirmation'],
  ['Esperando confirmacion','pending_confirmation'],
  ['J','offer_confirmation'],
  ['Jugando','offer_confirmation'],
  ['S/F','offer_confirmation'],
  ['Se fue','offer_confirmation'],
  ['Confirmado','offer_confirmation'],
  ['Anula esa jugada','cancel_or_correction'],
  ['Corrige la jugada','cancel_or_correction'],
  ['Polla 5 con 20','polla_or_parley'],
  ['Parley con 50 Bs','polla_or_parley'],
  ['Saldo disponible 100 Bs','betting_or_balance'],
  ['Riesgo 250 Bs','betting_or_balance'],
  ['Hola','greeting'],
  ['Ayuda','help'],
  ['Estado de la carrera','status_non_monetary'],
  ['Manana vamos temprano','conversation']
];

test('real Control Hipico corpus maps to expected shadow intents',()=>{
  for(const [text,expected] of corpus){
    const result=classify(text);
    assert.equal(result.intent,expected,`${JSON.stringify(text)} => ${result.intent}, expected ${expected}`);
  }
});

test('operational intents are never auto eligible',()=>{
  for(const [text] of corpus){
    const result=classify(text);
    if(!OPERATIONAL_INTENTS.has(result.intent))continue;
    assert.equal(result.autoEligible,false,`${result.intent} must stay manual/shadow`);
    assert.notEqual(result.risk,'safe',`${result.intent} must not be considered safe automation`);
  }
});

test('close vocabulary wins before broad monetary parsing',()=>{
  const result=classify('Cierra carrera 4');
  assert.equal(result.intent,'race_close');
  assert.equal(result.reason,'CLOSE_REVIEW_GATE');
});

test('same text is not a dedupe key at classifier level',()=>{
  assert.deepEqual(classify('Juega PP del 3 con 20'),classify('Juega PP del 3 con 20'));
  // Provider-message dedupe remains the persistence responsibility; content
  // equality must never collapse two legitimate offers from different sends.
});
