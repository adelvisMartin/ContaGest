import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../backend/src/modules/notifications/notifications.routes.ts',import.meta.url),'utf8');
test('#854 preference HH:mm grammar parses actual times, never a literal slash-d',()=>{
 const pre=source.split('const preferenceSchema=')[1]?.split('const authenticatedSelf=')[0];
 assert.ok(pre);
 const regexes=[...pre.matchAll(/z\.string\(\)\.regex\((\/\^.*?\$\/)\)/g)].map(m=>new Function('return '+m[1])());
 assert.equal(regexes.length,2);
 for(const re of regexes){
   for(const valid of ['00:00','09:30','23:59'])assert.equal(re.test(valid),true,valid);
   for(const bad of ['24:00','23:60','9:30','12:3','12\\d3'])assert.equal(re.test(bad),false,bad);
 }
});
