import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseGymIngredientFilters} from '../backend/src/modules/verticals/gym-ingredient-filters.mjs';

test('#795 ingredient filters keep legacy array limit and accept explicit bounded pages',()=>{
  assert.deepEqual(parseGymIngredientFilters({}),{
    q:'',category:'',active:'',take:1000,skip:0
  });
  assert.deepEqual(parseGymIngredientFilters({
    q:'  yogurt  ',category:' dairy ',active:'true',take:'1',skip:'1000'
  }),{q:'yogurt',category:'dairy',active:'true',take:1,skip:1000});
  assert.equal(parseGymIngredientFilters({active:'false'}).active,'false');
});

test('#795 rejects bad PostgreSQL bool casts, array query pollution and unbounded pages',()=>{
  for(const query of [
    {active:'banana'},{active:'TRUE'},{active:'0'},{active:true},
    {active:['true']},{active:{value:'true'}},
    {category:'\r\n'},{q:'a'.repeat(121)},{q:['nuts']},
    {take:'0'},{take:'1001'},{take:100},{take:'01'},
    {skip:'-1'},{skip:'100001'},{skip:'1e2'}, {skip:' 2 '},
    {tenantId:'foreign'}, {sort:'createdAt'}, []
  ])assert.throws(()=>parseGymIngredientFilters(query),/GYM_INGREDIENT_FILTER_INVALID/);
});

test('#795 ingredient listing is tenant-bound, stable, paged, and keeps array response',()=>{
  const source=readFileSync(new URL('../backend/src/modules/verticals/gym-nutrition.routes.ts',import.meta.url),'utf8');
  const block=source.split("router.get('/gym/ingredients'")[1].split("router.post('/gym/ingredients'")[0];
  assert.match(block,/parseGymIngredientFilters\(req\.query\)/);
  assert.match(block,/new HttpError\(422/);
  assert.match(block,/"tenantId"=\$1/);
  assert.match(block,/ORDER BY "active" DESC,"name" ASC,"id" ASC/);
  assert.match(block,/LIMIT \$5 OFFSET \$6/);
  assert.match(block,/take\+1,skip/);
  assert.match(block,/rows\.slice\(0,take\)/);
  assert.match(block,/X-Pagination-Has-More/);
  assert.match(block,/X-Pagination-Next-Skip/);
  assert.match(block,/private, no-store/);
  assert.doesNotMatch(block,/String\(req\.query\.active/);
});
