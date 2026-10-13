import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {labOutgoingEvidenceMatches} from '../src/lab-outgoing-evidence.mjs';

const labTag='[LABTEST:012345abcd]';
const mirrorTag='[SHADOW:012345abcd]';
const fullLab=[
  labTag,
  '🧪 CONTROL HÍPICO · PRUEBA LAB',
  'Mensaje: ¿Qué carrera sigue?',
  'Lectura: status_non_monetary',
  'Respuesta: Carrera interna 5; solo LAB.',
  'Fuente: LECTURA_CANÓNICA_LIMITADA',
  'Consulta: CANONICAL_NEXT_RACE'
].join('\n');

test('exact first-line outgoing LAB proof accepts complete reply, including CRLF normalization',()=>{
  assert.equal(labOutgoingEvidenceMatches(fullLab,labTag),true);
  assert.equal(labOutgoingEvidenceMatches(fullLab.replace(/\n/g,'\r\n'),labTag),true);
  assert.equal(labOutgoingEvidenceMatches('  '+fullLab+'  ',labTag),true);
});

test('quote, partial substring or unrelated outgoing mention must never confirm a message',()=>{
  const falseProofs=[
    'Cité una respuesta anterior: '+fullLab,
    'Otro texto antes\n'+fullLab,
    '[SHADOW:012345abcd]\n'+fullLab,
    'Este es un forward:\n[LABTEST:012345abcd]',
    labTag,
    labTag+'\nSolo la etiqueta, sin el resto de la respuesta.',
    '[LABTEST:012345abce]\n'+fullLab.split('\n').slice(1).join('\n'),
    fullLab.replace('Respuesta: ','R: '),
    fullLab.replace('Fuente: ','F: ')
  ];
  for(const text of falseProofs){
    assert.equal(labOutgoingEvidenceMatches(text,labTag),false,text.slice(0,70));
  }
});

test('LAB and SHADOW tags cannot be substituted or embedded in one another',()=>{
  assert.equal(labOutgoingEvidenceMatches(mirrorTag+'\n🧪 CONTROL HÍPICO · SHADOW LOCAL',mirrorTag),true);
  assert.equal(labOutgoingEvidenceMatches(mirrorTag+'\nEspejo de backend.',mirrorTag),true);
  assert.equal(labOutgoingEvidenceMatches(fullLab,mirrorTag),false);
  assert.equal(labOutgoingEvidenceMatches(mirrorTag+'\nEspejo de backend.',labTag),false);
  assert.equal(labOutgoingEvidenceMatches('[SHADOW:012345abcd]\n',mirrorTag),false);
});

test('invalid tags, oversize chat text and altered hashes never yield a confirmed ACK',()=>{
  for(const tag of [
    '012345abcd','[LABTEST:012345abc]', '[LABTEST:012345abcdef]',
    '[SOURCE:012345abcd]','[LABTEST:012345abcX]','[LABTEST:012345abcd]\n'
  ]) assert.equal(labOutgoingEvidenceMatches(fullLab,tag),false);
  assert.equal(labOutgoingEvidenceMatches(fullLab+'X'.repeat(4200),labTag),false);
  assert.equal(labOutgoingEvidenceMatches(null,labTag),false);
});

test('current Bridge only scans outgoing rows of #main and verifies pinned LAB group on both sides',()=>{
  const src=readFileSync(new URL('../src/index.mjs',import.meta.url),'utf8');
  const start=src.indexOf('async function visibleLabHasTag(tag)');
  const end=src.indexOf('async function sendMirrorToLab',start);
  assert.ok(start>0&&end>start);
  const block=src.slice(start,end);
  assert.match(block,/const main=document\.querySelector\('#main'\)/);
  assert.match(block,/main\.querySelectorAll\('\.message-out'\)/);
  assert.match(block,/slice\(-100\)/);
  assert.match(block,/labOutgoingEvidenceMatches\(text,tag\)/);
  assert.equal((block.match(/await assertCurrentLabIdentity\(\)/g)||[]).length,2);
  assert.doesNotMatch(block,/\.includes\(needle\)|document\.querySelectorAll\('\.message-out'\)/);
});

test('a forged outgoing quoted tag cannot mark the persisted LAB journal confirmed',()=>{
  const body='Reenviaron esta cadena:\n'+fullLab;
  assert.equal(labOutgoingEvidenceMatches(body,labTag),false);
  const journal=readFileSync(new URL('../src/lab-test-reply-journal.mjs',import.meta.url),'utf8');
  assert.match(journal,/to==='confirmed'&&visibleTag!==true/);
  const bridge=readFileSync(new URL('../src/index.mjs',import.meta.url),'utf8');
  assert.match(bridge,/if \(await visibleLabHasTag\(tag\)\)/);
});

test('local SOURCE→LAB mirror formats without undefined canonical/plan variables',()=>{
  const code=readFileSync(new URL('../src/index.mjs',import.meta.url),'utf8');
  const start=code.indexOf('function localMirrorText('),end=code.indexOf('function shouldMirror(',start);
  assert.ok(start>0&&end>start);
  const body=code.slice(start,end);
  const fn=vm.runInNewContext('('+body+')',{
    mirrorTagFor:()=>mirrorTag,localSuggestion:()=> 'Solo revisión.',
  });
  const output=fn({
    externalMessageId:'source-id',groupName:'Grupo SOURCE',
    senderLabel:'Remitente autorizado',text:'Participantes de carrera 5'
  },{intent:'horse_entries',risk:'review',confidence:0.92});
  assert.match(output,/^\[SHADOW:012345abcd\]\n/);
  assert.match(output,/SHADOW LOCAL/);
  assert.match(output,/LAB_LOCAL_ONLY/);
  assert.match(output,/Solo revisión/);
  assert.doesNotMatch(output,/undefined|CANONICAL_RESULT_CONFIRMED_INTERNAL/);
  assert.equal(labOutgoingEvidenceMatches(output,mirrorTag),true);
});
