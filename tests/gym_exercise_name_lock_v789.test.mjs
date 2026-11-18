import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../backend/src/modules/verticals/gym-training.routes.ts',import.meta.url),'utf8');
const create=source.split("router.post('/gym/exercises'")[1].split("router.patch('/gym/exercises/:id'")[0];
const edit=source.split("router.patch('/gym/exercises/:id'")[1].split("router.post('/gym/progression/evaluate'")[0];

test('#789 exercise name lock uses PostgreSQL lower/btrim exactly as duplicate predicate',()=>{
  const lock="pg_advisory_xact_lock(hashtextextended('gym-exercise-name:'||$1||':'||lower(btrim($2)),0))";
  for(const block of [create,edit]){
    assert.ok(block.includes(lock));
    assert.match(block,/tenantId,b\.name/);
    assert.match(block,/lower\(btrim\("name"\)\)=lower\(btrim\(\$2\)\)/);
    assert.doesNotMatch(block,/b\.name\.trim\(\)\.toLowerCase\(\)/);
    const lockAt=block.indexOf(lock);
    const duplicate=block.indexOf('lower(btrim("name"))=lower(btrim($2))');
    const mutation=block.indexOf(block===create?
      'INSERT INTO public."GymExercise"':'UPDATE public."GymExercise"');
    assert.ok(lockAt>=0&&duplicate>lockAt&&mutation>duplicate);
  }
});

test('#789 exercise edit locks tenant-owned current record before merging patch state',()=>{
  const rows=edit.indexOf('const currentRows=await tx.$queryRawUnsafe');
  const recordLock=edit.indexOf('WHERE "tenantId"=$1 AND "id"=$2\n    FOR UPDATE');
  const snapshot=edit.indexOf("const current=one(currentRows");
  const update=edit.indexOf('UPDATE public."GymExercise"');
  assert.ok(rows>0&&recordLock>rows&&snapshot>recordLock&&update>snapshot);
  assert.match(edit,/ON CONFLICT|UPDATE public\."GymExercise"/);
  assert.match(edit,/WHERE "tenantId"=\$1 AND "id"=\$2/);
});
