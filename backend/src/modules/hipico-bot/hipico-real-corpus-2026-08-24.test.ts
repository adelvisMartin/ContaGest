import test from 'node:test';
import assert from 'node:assert/strict';
import { classify } from './hipico-operational-classifier.js';

test('real 2026-08-24 offer grammar is normalized without monetary mutation',()=>{
  const cases=[
    ['Juego 2p del 1 50k',{play:'2P',horse:'1',amount:50000}],
    ['Juego 1y2 1 con 100k',{play:'1/2',horse:'1',amount:100000}],
    ['Juego 1p 1 con 100k',{play:'1P',horse:'1',amount:100000}],
    ['Juego 2n del 1 50k',{play:'2N',horse:'1',amount:50000}],
    ['Juego 10a8 el 1 40k',{play:'10A8',horse:'1',amount:40000}]
  ] as const;
  for(const [text,expected] of cases){
    const result=classify(text);
    assert.equal(result.intent,'offer_player',text);
    assert.equal(result.autoEligible,false,text);
    assert.deepEqual(
      {play:result.entities?.play,horse:result.entities?.horse,amount:result.entities?.amount},
      expected,
      text
    );
  }
});

test('real plan with placeholder Pizarra remains a plan snapshot',()=>{
  const text=`Club Hipico Triple Cowns
Presque Isle, 8va Carrera
Ret:
Pizarra: .....

TERCIOS
Juega Gaceta 3/3 (3) con 60.000,00 da Roca
Juega Dakota 3/3 (3) con 30.000,00 da Arevalo
Juega Dakota 3/3 (3) con 40.000,00 da Sinner
Juega Dakota 3n (3) con 40.000,00 da Roca`;
  const result=classify(text);
  assert.equal(result.intent,'plan_snapshot');
  assert.equal(result.autoEligible,false);
  assert.deepEqual(result.entities?.board,[]);
  assert.equal(result.entities?.offers?.length,4);
  assert.deepEqual(result.entities?.offers?.[0],{
    role:'player',play:'3/3',horse:'3',amount:60000,
    participant:'Gaceta',counterparty:'Roca',
    raw:'Juega Gaceta 3/3 (3) con 60.000,00 da Roca'
  });
  assert.equal(result.entities?.offers?.[3]?.play,'3N');
  assert.equal(result.entities?.offers?.[3]?.amount,40000);
});

test('real settlement preserves Pizarra and signed settlement rows',()=>{
  const text=`Club Hipico Triple Cowns
Presque Isle, 8va Carrera
Pizarra: 2.4.10...

TERCIOS
3/3 (3) con 60.000,00
Juega Gaceta Bs. -60.000,00
Consigue Roca Bs. +57.000,00
3/3 (3) con 30.000,00
Juega Dakota Bs. -30.000,00
Consigue Arevalo Bs. +28.500,00`;
  const result=classify(text);
  assert.equal(result.intent,'settlement_snapshot');
  assert.equal(result.autoEligible,false);
  assert.deepEqual(result.entities?.board,['2','4','10']);
  assert.deepEqual(result.entities?.settlementRows,[
    {role:'player',participant:'Gaceta',amount:-60000},
    {role:'receiver',participant:'Roca',amount:57000},
    {role:'player',participant:'Dakota',amount:-30000},
    {role:'receiver',participant:'Arevalo',amount:28500}
  ]);
});

test('real available snapshot parses locale-formatted values as reconciliation evidence',()=>{
  const text=`Club Hipico Triple Cowns
TERCIO\tDISPONIBLE
AREVALO\t-243.030,00
CANARIO\t-28.500,00
DAKOTA\t496.600,00
NAVAS\t952.880,00
ROCA\t808.990,00
YANKEE\t0,00`;
  const result=classify(text);
  assert.equal(result.intent,'balance_snapshot');
  assert.equal(result.autoEligible,false);
  assert.deepEqual(result.entities?.balances,[
    {participant:'AREVALO',available:-243030},
    {participant:'CANARIO',available:-28500},
    {participant:'DAKOTA',available:496600},
    {participant:'NAVAS',available:952880},
    {participant:'ROCA',available:808990},
    {participant:'YANKEE',available:0}
  ]);
});

test('closure, arrival and day close remain separate events',()=>{
  assert.equal(classify('CERRADO CERRADO NO HAY MAS JUGADA').intent,'race_close');
  assert.deepEqual(classify('Llegada 2.4.10').entities?.board,['2','4','10']);
  assert.equal(classify('BUENAS NOCHES DAMAS Y CABALLEROS ESTO ES TODO POR EL DÍA DE HOY').intent,'day_close');
  assert.equal(classify('La gente se fue a dormir 😴').intent,'conversation');
  assert.equal(classify('Se fue').intent,'offer_confirmation');
});
