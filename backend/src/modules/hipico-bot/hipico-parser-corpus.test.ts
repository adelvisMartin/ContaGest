import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname,join } from 'node:path';
import { classify } from './hipico-operational-classifier.js';

type CorpusCase={id:string;text:string;expected:{intent:string;review?:boolean;entities?:Record<string,unknown>}};
type Corpus={schemaVersion:number;parserVersion:string;sanitized:boolean;cases:CorpusCase[]};
const here=dirname(fileURLToPath(import.meta.url));
const corpus=JSON.parse(readFileSync(join(here,'corpus','hipico-parser-corpus.v1.json'),'utf8')) as Corpus;

function assertPartialEntities(id:string,actual:Record<string,unknown>|undefined,expected:Record<string,unknown>|undefined){
  if(!expected)return;
  for(const [key,value] of Object.entries(expected)){
    if(key==='offersLength'){assert.equal((actual?.offers as unknown[]|undefined)?.length,value,id);continue;}
    if(key==='settlementRowsLength'){assert.equal((actual?.settlementRows as unknown[]|undefined)?.length,value,id);continue;}
    if(key==='balancesLength'){assert.equal((actual?.balances as unknown[]|undefined)?.length,value,id);continue;}
    assert.deepEqual(actual?.[key],value,id);
  }
}

test('corpus is versioned, sanitized and reproducible offline',()=>{
  assert.equal(corpus.schemaVersion,1);
  assert.match(corpus.parserVersion,/classifier-v\d+/);
  assert.equal(corpus.sanitized,true);
  assert.ok(corpus.cases.length>=15);
  assert.equal(new Set(corpus.cases.map((item)=>item.id)).size,corpus.cases.length);
});

test('golden corpus matches intent/entities and keeps risky cases behind review gate',()=>{
  const predictions=[] as Array<{expected:string;actual:string}>;
  for(const fixture of corpus.cases){
    const result=classify(fixture.text);
    predictions.push({expected:fixture.expected.intent,actual:result.intent});
    assert.equal(result.intent,fixture.expected.intent,fixture.id);
    assertPartialEntities(fixture.id,result.entities as Record<string,unknown>|undefined,fixture.expected.entities);
    if(fixture.expected.review){
      assert.notEqual(result.risk,'safe',fixture.id);
      assert.equal(result.autoEligible,false,fixture.id);
    }
  }

  const intents=[...new Set(predictions.flatMap((row)=>[row.expected,row.actual]))].sort();
  const metrics=Object.fromEntries(intents.map((intent)=>{
    const tp=predictions.filter((row)=>row.expected===intent&&row.actual===intent).length;
    const fp=predictions.filter((row)=>row.expected!==intent&&row.actual===intent).length;
    const fn=predictions.filter((row)=>row.expected===intent&&row.actual!==intent).length;
    const precision=tp/(tp+fp||1);const recall=tp/(tp+fn||1);
    return[intent,{tp,fp,fn,precision,recall}];
  }));
  console.log(`[hipico-corpus-v1] ${JSON.stringify(metrics)}`);
  for(const value of Object.values(metrics)){
    assert.equal(value.precision,1);
    assert.equal(value.recall,1);
  }
});
