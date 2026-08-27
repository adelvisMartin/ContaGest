import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHipicoMoney, moneyMinorString, addHipicoMoney, reverseMinor, formatMinor } from './hipico-money.js';

test('parses Venezuelan grouping and decimal notation exactly',()=>{
  assert.equal(moneyMinorString('60.000,00'),'6000000');
  assert.equal(moneyMinorString('1.234.567,89'),'123456789');
  assert.equal(moneyMinorString('60,000.00'),'6000000');
});

test('handles negative, positive and zero without binary floating point',()=>{
  assert.equal(moneyMinorString('-0,01'),'-1');
  assert.equal(moneyMinorString('0'),'0');
  assert.equal(moneyMinorString('0,10'),'10');
  assert.equal(addHipicoMoney(parseHipicoMoney('0,10'),parseHipicoMoney('0,20')),30n);
});

test('rejects exponent and over-precision',()=>{
  assert.throws(()=>parseHipicoMoney('1e6'),/EXPONENT/);
  assert.throws(()=>parseHipicoMoney('10,001'),/INVALID_SCALE|INVALID/);
});

test('reversal is exact inverse in minor units',()=>{
  assert.equal(reverseMinor('6000000'),'-6000000');
  assert.equal(formatMinor(-6000000n),'-60000.00');
});
