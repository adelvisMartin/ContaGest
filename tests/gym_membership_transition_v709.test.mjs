import test from 'node:test';
import assert from 'node:assert/strict';
import {assertGymMembershipTransition as guard} from '../backend/src/modules/verticals/gym-membership-transition.mjs';
const now=new Date('2026-11-20T14:00:00.000Z');
const input={current:'frozen',target:'active',memberStatus:'active',startsAt:new Date('2026-11-01T00:00:00Z'),endsAt:new Date('2026-12-01T00:00:00Z'),now,otherActiveCount:0};
test('#709 active membership resumes only for valid active member in period',()=>{
 assert.equal(guard(input),true);
 assert.throws(()=>guard({...input,memberStatus:'blocked'}),/MEMBER_NOT_ACTIVE/);
 assert.throws(()=>guard({...input,endsAt:new Date('2026-11-19T12:00:00Z')}),/PERIOD_INVALID/);
 assert.throws(()=>guard({...input,startsAt:new Date('2026-11-21T12:00:00Z')}),/PERIOD_INVALID/);
 assert.throws(()=>guard({...input,otherActiveCount:1}),/ALREADY_ACTIVE/);
});
test('#709 cancelled membership never resurrects',()=>{
 assert.throws(()=>guard({...input,current:'cancelled'}),/CANCELLED_FINAL/);
 assert.equal(guard({...input,current:'cancelled',target:'cancelled'}),true);
 assert.throws(()=>guard({...input,current:'expired'}),/EXPIRED_FINAL/);
});
test('#709 invalid states and counts fail closed',()=>{
 for(const n of [-1,0.2,Infinity,NaN])assert.throws(()=>guard({...input,otherActiveCount:n}),/STATE_INVALID/);
 assert.throws(()=>guard({...input,target:'grace'}),/STATE_INVALID/);
});
