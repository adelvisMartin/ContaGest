import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDateKey, parseDateTime, __test__ } from '../frontend/public/hipico-control/assets/js/whatsapp/normalization.js';

test('WhatsApp export date parsing rejects JavaScript calendar rollover and invalid clocks',()=>{
  for(const value of ['31/02/2026','29/02/2026','00/09/2026','11/13/2026','11-09-2026','']){
    assert.equal(parseDateKey(value),null,value);
  }
  assert.equal(parseDateKey('29/02/2028'),'2028-02-29');
  assert.equal(parseDateKey('9/11/26'),'2026-11-09');

  for(const time of ['0:10 a.m.','13:10 p.m.','12:60 p.m.','24:00 p.m.','10:10','']){
    assert.equal(parseDateTime('11/09/2026',time),null,time);
  }
  assert.equal(parseDateTime('31/02/2026','10:10 a.m.'),null);
});

test('WhatsApp export wall-clock serialization is deterministic and independent of host timezone',()=>{
  assert.equal(parseDateTime('11/09/2026','1:05 a.m.'),'2026-09-11T01:05:00.000Z');
  assert.equal(parseDateTime('11/09/2026','12:05 a.m.'),'2026-09-11T00:05:00.000Z');
  assert.equal(parseDateTime('11/09/2026','1:05 p.m.'),'2026-09-11T13:05:00.000Z');
  assert.equal(parseDateTime('11/09/2026','12:05 p.m.'),'2026-09-11T12:05:00.000Z');
});

test('frontend Gregorian helper covers leap and century rules explicitly',()=>{
  assert.equal(__test__.gregorianDaysInMonth(2028,2),29);
  assert.equal(__test__.gregorianDaysInMonth(2026,2),28);
  assert.equal(__test__.gregorianDaysInMonth(2000,2),29);
  assert.equal(__test__.gregorianDaysInMonth(1900,2),28);
  assert.equal(__test__.gregorianDaysInMonth(2026,13),0);
});
