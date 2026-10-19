import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseGymMemberQuery} from '../backend/src/modules/verticals/gym-member-query.ts';
const route=readFileSync(new URL('../backend/src/modules/verticals/gym-nutrition.routes.ts',import.meta.url),'utf8');
const snippet=route.slice(route.indexOf("router.get('/gym/nutrition'"),route.indexOf("router.post('/gym/nutrition'"));
const id='130849ad-a46d-5adb-a286-2774fd36bfac';
test('existing no-filter nutrition plans listing stays permitted for gym.manage',()=>{
  assert.deepEqual(parseGymMemberQuery({}),{memberId:''});
  assert.match(snippet,/requirePermission\('gym\.manage'\)/);
  assert.match(snippet,/\(\$2='' OR p\."memberId"=\$2\)/);
});
test('tenant scope remains mandatory for listing and nested meal records',()=>{
  assert.match(snippet,/WHERE p\."tenantId"=\$1/);
  assert.match(snippet,/m\."tenantId"=p\."tenantId"/);
  assert.match(snippet,/parseGymMemberQuery\(req\.query\)\.memberId/);
});
test('valid member filter remains exact',()=>{
  assert.deepEqual(parseGymMemberQuery({memberId:id}),{memberId:id});
});
test('invalid arrays or objects cannot be coerced to a user identifier',()=>{
  for(const memberId of [[id],{id},null])assert.throws(()=>parseGymMemberQuery({memberId}),/ID_INVALID/);
});
test('foreign query keys and filters for another authority reject',()=>{
  for(const bad of [{tenantId:id},{from:'2026-10-16'},{limit:'2000'},{memberId:id,orderBy:'desc'}])
    assert.throws(()=>parseGymMemberQuery(bad),/UNKNOWN_KEY/);
});
test('bad query transport returns a controlled 422 before DB call',()=>{
  assert.match(snippet,/catch \{ throw new HttpError\(422,'Filtro de planes nutricionales inválido\.'\); \}/);
  assert.ok(snippet.indexOf('parseGymMemberQuery(req.query)')<snippet.indexOf('prisma.$queryRawUnsafe'));
});
