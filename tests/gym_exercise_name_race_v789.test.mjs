import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../backend/src/modules/verticals/gym-training.routes.ts',import.meta.url),'utf8');
const first=source.indexOf("router.post('/gym/exercises'");
const second=source.indexOf("router.patch('/gym/exercises/:id'",first);
const last=source.indexOf("router.post('/gym/progression/evaluate'",second);
assert.ok(first>=0&&second>first&&last>second);
const handlers=source.slice(first,last).replace(/<any\[\]>/g,'');
class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
function fixture(existing=[]){
 const calls=[],posted={};let create,patch;
 const tx={$queryRawUnsafe:async (sql,...args)=>{
  calls.push({sql,args});
  if(sql.includes('pg_advisory_xact_lock'))return [{}];
  if(sql.includes('SELECT "id" FROM public."GymExercise"'))return existing;
  if(sql.includes('SELECT * FROM public."GymExercise"'))return [{id:'ex-1',name:'Old exercise',active:true}];
  if(sql.includes('INSERT INTO public."GymExercise"'))return [{id:'ex-2',name:args[1]}];
  if(sql.includes('UPDATE public."GymExercise"'))return [{id:'ex-1',name:args[2]}];
  throw Error('unhandled SQL '+sql);
 }};
 const prisma={$transaction:async cb=>{posted.txs=(posted.txs||0)+1;return cb(tx)}};
 new Function('router','requirePermission','asyncHandler','ctx','exerciseLibrarySchema','exerciseLibraryPatchSchema',
 'prisma','HttpError','one','ok',handlers)(
  {post:(_p,_g,f)=>create=f,patch:(_p,_g,f)=>patch=f},x=>x,x=>x,()=>({tenantId:'tenant-a'}),
  {parse:x=>x},{parse:x=>x},prisma,HttpError,a=>a[0],(_r,v,status)=>Object.assign(posted,{result:v,status})
 );
 return {calls,posted,create:name=>create({body:{name,active:true}},{}),
  patch:name=>patch({body:{name},params:{id:'ex-1'}},{})};
}
test('create takes tenant/name advisory lock before duplicate query and insert',async()=>{
 const f=fixture();await f.create('Squat');assert.equal(f.posted.txs,1);assert.equal(f.posted.status,201);
 assert.match(f.calls[0].sql,/pg_advisory_xact_lock/);
 assert.match(f.calls[1].sql,/SELECT "id"/);assert.match(f.calls[2].sql,/INSERT INTO/);
});
test('normalized name lock is tenant scoped and case-insensitive',async()=>{
 const a=fixture(),b=fixture();await a.create('Squat');await b.create('squat');
 assert.equal(a.calls[0].args[0],b.calls[0].args[0]);
 const c=fixture();await c.create('BENCH');assert.notEqual(a.calls[0].args[0],c.calls[0].args[0]);
 assert.match(a.calls[0].args[0],/^gym-exercise-name:tenant-a:/);
});
test('duplicate create returns 409, not second INSERT',async()=>{
 const f=fixture([{id:'ex-prev'}]);await assert.rejects(f.create('squat'),e=>e.status===409);
 assert.equal(f.calls.some(c=>c.sql.includes('INSERT INTO')),false);
});
test('rename also locks same key before querying collisions and updating',async()=>{
 const f=fixture();await f.patch('Squat');assert.equal(f.posted.txs,1);
 assert.match(f.calls[0].sql,/pg_advisory_xact_lock/);
 assert.match(f.calls.at(-1).sql,/UPDATE public."GymExercise"/);
});
test('duplicate rename 409 prevents UPDATE',async()=>{
 const f=fixture([{id:'another'}]);await assert.rejects(f.patch('Squat'),e=>e.status===409);
 assert.equal(f.calls.some(c=>c.sql.includes('UPDATE public."GymExercise"')),false);
});
test('no direct Prisma DB writes outside same transaction in both scoped handlers',()=>{
 assert.doesNotMatch(handlers,/await prisma\.\$queryRawUnsafe/);
 assert.equal((handlers.match(/prisma\.\$transaction\(async tx=>/g)||[]).length,2);
});
test('create retains tenant predicates and ON CONFLICT backend guard',()=>{
 assert.match(handlers,/WHERE "tenantId"=\$1 AND lower\("name"\)=lower\(\$2\)/);
 assert.match(handlers,/ON CONFLICT \("tenantId","name"\) DO NOTHING/);
});
