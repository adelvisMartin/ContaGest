import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validGymMealClockTime as valid} from '../backend/src/modules/verticals/gym-meal-clock.mjs';
test('valid 24h HH:mm clock boundaries',()=>{for(const v of ['00:00','09:05','12:30','23:59'])assert.equal(valid(v),true);});
test('seconds supported when specified',()=>{for(const v of ['00:00:00','12:34:56','23:59:59'])assert.equal(valid(v),true);});
test('blank time is accepted as no schedule for legacy form',()=>assert.equal(valid(''),true));
test('invalid minute/hour/second values rejected',()=>{for(const v of ['24:00','25:30','12:60','12:30:60','-1:00'])assert.equal(valid(v),false);});
test('locale and timezone ambiguous inputs rejected',()=>{for(const v of ['9:30','9 PM','09:30Z','09:30+04','09:30:00.001',' 09:30','09:30 ','2026-10-16T09:30'])assert.equal(valid(v),false);});
test('null/undefined/nonstring input rejected by pure guard',()=>{for(const v of [null,undefined,0,930,[],{}])assert.equal(valid(v),false);});
test('the real nutrition schema validates plannedAt, not free text',()=>{
 const src=readFileSync(new URL('../backend/src/modules/verticals/gym.schemas.ts',import.meta.url),'utf8');
 const start=src.indexOf('export const nutritionMealSchema'),end=src.indexOf('export const completeNutritionSchema',start);
 const block=src.slice(start,end);
 assert.match(src,/import \{ validGymMealClockTime \} from '\.\/gym-meal-clock\.mjs'/);
 assert.match(block,/plannedAt:z\.string\(\)\.refine\(validGymMealClockTime/);
 assert.doesNotMatch(block,/plannedAt:z\.string\(\)\.optional\(\)\.nullable\(\)/);
});
test('route binds validated clock parameter to SQL ::time with optional empty -> null',()=>{
 const src=readFileSync(new URL('../backend/src/modules/verticals/gym-nutrition.routes.ts',import.meta.url),'utf8');
 const start=src.indexOf("router.post('/gym/nutrition'"),end=src.indexOf("router.get('/gym/nutrition/:id/shopping-list'",start);
 const block=src.slice(start,end);
 assert.match(block,/completeNutritionSchema\.parse/);
 assert.match(block,/\$7::time/);
 assert.match(block,/meal\.plannedAt\|\|null/);
});
