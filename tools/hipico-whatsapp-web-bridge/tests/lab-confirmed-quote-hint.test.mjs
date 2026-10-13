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

test('confirmed ACK never creates a secondary DOM-derived race hint',()=>{
  const src=readFileSync(new URL('../src/index.mjs',import.meta.url),'utf8');
  const helperStart=src.indexOf('async function finalizeConfirmedVisibleLabQuote(');
  const helperEnd=src.indexOf('async function resumePendingLabQueries(',helperStart);
  assert.ok(helperStart>=0&&helperEnd>helperStart);
  const helper=src.slice(helperStart,helperEnd);
  assert.match(helper,/labPendingInbox\?\.read\(row\.id\)/);
  assert.match(helper,/rememberConfirmedPendingLabQuote\(stored\)/);
  assert.match(helper,/LAB_QUOTE_HINT_NO_VERIFIED_INPUT/);
  assert.doesNotMatch(helper,/senderId:sender,text:body/);

  const begin=src.indexOf('async function processLabTestInput()');
  const end=src.indexOf('async function visibleLabHasTag(tag)',begin);
  const lab=src.slice(begin,end);
  const confirmed=lab.slice(lab.indexOf("if (journalRecord?.state === 'confirmed')"),
    lab.indexOf("if (journalRecord?.state === 'ambiguous'"));
  assert.match(confirmed,/await finalizeConfirmedVisibleLabQuote\(row,body\)/);
  assert.match(confirmed,/labPendingInbox\?\.read\(row\.id\)/);
  assert.doesNotMatch(confirmed,/confirmedLabQuoteHint|labQuotedRaceJournal\.remember/);

  const normal=lab.slice(lab.indexOf('await sendTextInCurrentLab('));
  const ack=normal.indexOf('await labTestReplyJournal.confirm(row.id,{visibleTag:true});');
  const finalizer=normal.indexOf('await finalizeConfirmedVisibleLabQuote(row,body)');
  assert.ok(ack>=0&&finalizer>ack);
  assert.doesNotMatch(normal,/confirmedLabQuoteHint\(|labQuotedRaceJournal\.remember\(/,
    'the normal send path must not independently trust mutable DOM after ACK');
});
