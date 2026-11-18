import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeGymPaymentAmount} from '../backend/src/modules/verticals/gym-payment-amount.mjs';

test('#746 exact decimal cents accept existing JSON numbers and decimal strings',()=>{
  for(const [input,expected] of [
    [0.01,'0.01'],[0.1,'0.10'],[1,'1.00'],[100.25,'100.25'],
    ['1','1.00'],['0.10','0.10'],[' 50.9 ','50.90'],
    ['999999999.00','999999999.00'],[999999999,'999999999.00']
  ])assert.equal(normalizeGymPaymentAmount(input),expected,String(input));
});

test('#746 reject boolean, exponent, fractional cent, leading zero and implicit numeric coercions',()=>{
  for(const input of [
    true,false,null,undefined,{},[],['1'],NaN,Infinity,-Infinity,
    0,-1,-0.01,0.001,1.234,0.1+0.2,1000000000,
    '', '0','0.00','-1','01','01.00','1e2','0x10','Infinity','NaN',
    '0.001','1.234','999999999.01','1000000000',
    '.5','1.','1,50','1 0','10 USD'
  ])assert.throws(()=>normalizeGymPaymentAmount(input),
    {message:'GYM_PAYMENT_AMOUNT_INVALID'},String(input));
});

test('#746 request Zod schema fails closed and route sends decimal string without JS money math',()=>{
  const schema=readFileSync(new URL('../backend/src/modules/verticals/gym.schemas.ts',import.meta.url),'utf8');
  const route=readFileSync(new URL('../backend/src/modules/verticals/gym-extended.routes.ts',import.meta.url),'utf8');
  const payment=route.split("router.post('/gym/payments'")[1]
    .split("router.get('/gym/classes/:classId/bookings'")[0];
  assert.match(schema,/amount: gymPaymentAmount,/);
  assert.match(schema,/normalizeGymPaymentAmount\(value\)/);
  assert.match(schema,/ctx\.addIssue\(\{code:z\.ZodIssueCode\.custom/);
  assert.doesNotMatch(schema,/amount: z\.coerce\.number\(\)/);
  assert.match(payment,/body\.amount,body\.currency/);
  assert.match(payment,/body\.membershipId,body\.amount,tenantId,body\.memberId/);
  assert.doesNotMatch(payment,/Number\(body\.amount\)|parseFloat\(body\.amount\)/);
});
