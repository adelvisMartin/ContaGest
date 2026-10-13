import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifyLocal} from '../src/runtime-utils.mjs';
import {confirmedLabQuoteHint} from '../src/lab-confirmed-quote-hint.mjs';
const group='120363222222222222@g.us',sender='123456789012@lid';
const row=(text,n='m')=>({id:'false_'+group+'_'+n+'_'+sender,text});
const full='¿Cuál es el estado de carrera 5 en La Rinconada el 2026-10-12?';
const race={raceNumber:5,racetrack:'La Rinconada',raceDate:'2026-10-12'};

test('only a single safe fully scoped race survives a confirmed outgoing LAB ACK',()=>{
  assert.deepEqual(confirmedLabQuoteHint(row(full),classifyLocal(full)),race);
  const repeated=full.replace('?', ' y carrera 5?');
  assert.deepEqual(confirmedLabQuoteHint(row(repeated),classifyLocal(repeated)),race);
});

test('multiple different races cannot be remembered as quotable context',()=>{
  for(const text of [
    full.replace('?', ' o carrera 6?'),
    '¿Estado de carrera 5 en La Rinconada el 2026-10-12 o la sexta?',
    '¿Estado de carrera 5 en La Rinconada el 2026-10-12 o 6ta?',
    '¿Estado de carrera 5 en La Rinconada el 2026-10-12 o carrera 99?'
  ])assert.equal(confirmedLabQuoteHint(row(text),classifyLocal(text)),null,text);
});

test('money, corrupt calendar, unpinned sender and echo are not quotable hints',()=>{
  for(const text of [
    'Pagar 50 Bs por carrera 5 en La Rinconada el 2026-10-12',
    '¿Estado de carrera 5 en La Rinconada el 2026-02-30?',
    '¿Estado de carrera 5 en La Rinconada el 2026-10-12 para registrar saldo?',
    '¿Estado de carrera 5 en La Rinconada hoy?'
  ])assert.equal(confirmedLabQuoteHint(row(text),classifyLocal(text)),null,text);
  assert.equal(confirmedLabQuoteHint({...row(full),id:'source-no-participant'},classifyLocal(full)),null);
  assert.equal(confirmedLabQuoteHint({...row(full),fromMe:true},classifyLocal(full)),null);
  assert.equal(confirmedLabQuoteHint({...row(full),hasMedia:true},classifyLocal(full)),null);
});

test('both normal confirmed ACK and crash recovery use identical quote-hint eligibility',()=>{
  const src=readFileSync(new URL('../src/index.mjs',import.meta.url),'utf8');
  const begin=src.indexOf('async function processLabTestInput()');
  const end=src.indexOf('async function visibleLabHasTag(tag)',begin);
  const lab=src.slice(begin,end);
  const recovered=lab.indexOf('if (journalRecord?.state === \'confirmed\')');
  const evaluated=lab.indexOf('confirmedLabQuoteHint(row,classifyLocal(body))',recovered);
  const live=lab.indexOf('confirmedLabQuoteHint(row,classification)',evaluated);
  const send=lab.indexOf('await sendTextInCurrentLab(',evaluated);
  const ack=lab.indexOf('await labTestReplyJournal.confirm(row.id,{visibleTag:true});',send);
  assert.ok(recovered>=0&&evaluated>recovered&&evaluated<send&&
    live>ack,'confirmed crash recovery and normal delivery must share pure guard');
  const hintWrite=lab.indexOf('labQuotedRaceJournal.remember(',live);
  assert.ok(hintWrite>live&&hintWrite>ack);
  assert.match(lab,/const confirmedQuote=confirmedLabQuoteHint\(row,classification\)/);
  assert.match(lab,/race:confirmedQuote,confirmed:true/);
});
