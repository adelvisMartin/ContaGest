import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {selectLabAnswer} from '../src/lab-answer-policy.mjs';

test('confirmed canonical result is the actual LAB response over any misleading local suggestion',()=>{
  const result=selectLabAnswer({
    canonical:{available:true,reason:'CANONICAL_RESULT_CONFIRMED_INTERNAL',text:'Llegada interna: 7 - 3 - 1.'},
    plan:{guidance:'No se puede confirmar ningún resultado.'},
    localFallback:'Se requiere revisión.'
  });
  assert.equal(result.text,'Llegada interna: 7 - 3 - 1.');
  assert.equal(result.source,'LECTURA_CANÓNICA_LIMITADA');
  assert.equal(result.reason,'CANONICAL_RESULT_CONFIRMED_INTERNAL');
});

test('canonical absence response takes precedence over guesses of participants',()=>{
  const output=selectLabAnswer({
    canonical:{available:true,reason:'CANONICAL_ENTRIES_UNAVAILABLE',text:'No hay lista de ejemplares validada.'},
    plan:{guidance:'Quizás corren los caballos A y B'}
  });
  assert.equal(output.text,'No hay lista de ejemplares validada.');
});

test('network or invalid response always falls back to bounded local guidance',()=>{
  assert.deepEqual(selectLabAnswer({
    canonical:{available:false,reason:'LAB_CANONICAL_UNAVAILABLE',text:'fake server result'},
    plan:{guidance:'Necesito fecha e hipódromo.'}
  }),{
    text:'Necesito fecha e hipódromo.',source:'ORIENTACIÓN_LOCAL_SIN_DATOS_CANÓNICOS',
    reason:'LAB_CANONICAL_UNAVAILABLE'
  });
  assert.equal(selectLabAnswer({
    canonical:{available:true,reason:'CANONICAL_RESULT_CONFIRMED_INTERNAL',text:'x'.repeat(1800)},
    localFallback:'Sin datos.'
  }).text,'Sin datos.');
});

test('live Bridge passes selected canonical response text to its LAB-only transport path',async()=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const s=await fs.readFile(path.join(root,'src','index.mjs'),'utf8');
  const i=s.indexOf('function localLabTestReply('),end=s.indexOf('async function clearComposerSafely',i);
  assert.ok(i>0&&end>i);
  const block=s.slice(i,end);
  assert.match(block,/selectLabAnswer\(/);
  assert.match(block,/composeLabAssistantReply\(/);
  assert.match(block,/selectLabAnswer\(/);
  assert.doesNotMatch(block,/Lectura:|Propuesta:/);
  assert.match(block,/Fuente: /,'canonical reply must retain auditable source metadata for outgoing ACK evidence');
  assert.match(block,/Respuesta: /);
  assert.match(s,/sendTextInCurrentLab\(localLabTestReply\(row, classification, plan, canonical\), tag\)/);
});
