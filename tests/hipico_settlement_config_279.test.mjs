import test from 'node:test';
import assert from 'node:assert/strict';
import { settlementCommission, settleBet } from '../frontend/public/hipico-control/assets/js/engine.js';

test('race commission snapshot overrides global fallback during settlement',()=>{
  const race={board:['1','','','','',''],boardPositions:[1,2,3,4,5,6],retired:[],commission:0.10};
  const bet={amount:100,play:'1P',horse:'1',without:'',playerId:'p1',receiverId:'p2'};
  const settled=settleBet(bet,race,0.50);
  assert.equal(settlementCommission(race,0.50),0.10);
  assert.equal(settled.playerAmount,90);
  assert.equal(settled.receiverAmount,-100);
  assert.equal(settled.commissionAmount,10);
});

test('settlement commission fails to bounded defaults instead of accepting invalid values',()=>{
  assert.equal(settlementCommission({commission:0},0.05),0);
  assert.equal(settlementCommission({commission:1},0.05),1);
  assert.equal(settlementCommission({commission:2},0.07),0.07);
  assert.equal(settlementCommission({commission:Number.NaN},0.07),0.07);
  assert.equal(settlementCommission({commission:undefined},-1),0.05);
});
