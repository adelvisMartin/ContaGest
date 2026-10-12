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

test('race summary is read-only and excludes transcript summaries and financial requests',()=>{
  const safe=classified('conversation','safe');
  const cases=[
    'Hazme un resumen de la carrera 5',
    '¿Cuál es el resumen de carrera 5?',
    'Dame una síntesis de la carrera 5'
  ];
  for(const text of cases) assert.equal(isLabInformationRequest(text,'summary',safe),true,text);
  for(const text of [
    'hazme un resumen de lo que hablamos',
    'hazme un resumen de lo que hablamos sobre carrera 5',
    'resume los mensajes del chat de carrera 5',
    'resumen de saldo de carrera 5',
    '¿resumen de apuesta carrera 5?',
    'resumen de carrera 5, confirma el pago',
    'resumen de carrera 5; registrar cierre'
  ])assert.equal(isLabInformationRequest(text,'summary',safe),false,text);
  assert.equal(isLabInformationRequest('¿Estado de carrera 5?','summary',safe),false);
  assert.equal(isLabInformationRequest('Resumen de carrera 5','summary',classified('race_result','review')),false);
});
