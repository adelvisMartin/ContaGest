import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { scheduleOptionalPreventiveReminder } from '../frontend/src/components/veterinary/preventive-reminder-policy.mjs';

test('#748 reminder transport failure stays a partial success without provider PII',async()=>{
 let calls=0;
 const result=await scheduleOptionalPreventiveReminder(async()=>{calls++;throw new Error('provider secret diagnostic');},{id:'saved-vaccine'});
 assert.deepEqual(result,{reminder:null,reminderNotConfirmed:true});
 assert.equal(calls,1);
 assert.doesNotMatch(JSON.stringify(result),/provider secret diagnostic/);
});
test('#748 successful reminder returns its canonical communication identity',async()=>{
 const result=await scheduleOptionalPreventiveReminder(async(event)=>({id:'reminder-1',sourceId:event.id}),{id:'saved-vaccine'});
 assert.deepEqual(result,{reminder:{id:'reminder-1',sourceId:'saved-vaccine'},reminderNotConfirmed:false});
});
test('#748 UI still publishes committed clinical record if reminder is unconfirmed',()=>{
 const src=readFileSync('frontend/src/components/veterinary/VeterinaryPreventiveCarePanel.jsx','utf8');
 assert.match(src,/scheduleOptionalPreventiveReminder\(scheduleReminder,eventRecord\)/);
 assert.match(src,/onCreated\?\.\(\{kind,record:created,reminder\}\)/);
 assert.match(src,/if\(reminderNotConfirmed\)setReminderWarning/);
 assert.match(src,/verifica Comunicaciones antes de programarlo otra vez/);
 assert.doesNotMatch(src,/setTimeout|setInterval/);
});
