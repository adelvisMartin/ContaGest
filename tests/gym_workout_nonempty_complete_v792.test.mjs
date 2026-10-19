import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../backend/src/modules/verticals/gym-training.routes.ts',import.meta.url),'utf8');
const start=source.indexOf("router.post('/gym/workout-sessions/:id/complete'");
const end=source.indexOf("router.get('/gym/performance'",start);
assert.ok(start>=0&&end>start);
const code=source.slice(start,end).replace(/<any\[\]>/g,'').replace(/<Array<\{[^}]*\}>>/g,'');
class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
function fixture({sessionStatus='in_progress',exists=true,recorded=1}={}){
 let handler;const calls={sql:[],response:null,status:null,transactions:0};
 const tx={$queryRawUnsafe:async(sql,...args)=>{
  calls.sql.push({sql,args});
  if(sql.includes('FROM public."GymWorkoutSession"'))return exists?[{id:'session-a',status:sessionStatus}]:[];
  if(sql.includes('FROM public."GymWorkoutSet"'))return [{recorded}];
  if(sql.includes('UPDATE public."GymWorkoutSession"'))return [{id:'session-a',status:'completed'}];
  throw Error('unexpected sql');
 }};
 const prisma={$transaction:async fn=>{calls.transactions++;return fn(tx);}};
 new Function('router','requirePermission','asyncHandler','ctx','prisma','HttpError','one','ok',code)(
  {post:(_path,_perm,fn)=>handler=fn},x=>x,x=>x,()=>({tenantId:'tenant-a'}),prisma,HttpError,
  (v,msg='missing')=>{if(!v.length)throw new HttpError(404,msg);return v[0]},(_res,result,status)=>{calls.response=result;calls.status=status});
 return {calls,submit:()=>handler({params:{id:'session-a'}},{})};
}
test('completed set evidence lets an in-progress workout finish',async()=>{
 const x=fixture({recorded:1});await x.submit();assert.equal(x.calls.response.status,'completed');assert.equal(x.calls.transactions,1);
});
test('all-skipped but recorded workout remains auditable, not fabricated',async()=>{
 const x=fixture({recorded:2});await x.submit();assert.equal(x.calls.response.id,'session-a');
 assert.match(x.calls.sql[1].sql,/'completed','skipped'/);
});
test('zero recorded sets cannot mark session complete',async()=>{
 const x=fixture({recorded:0});await assert.rejects(x.submit(),e=>e.status===409);
 assert.equal(x.calls.sql.some(q=>q.sql.includes('UPDATE public."GymWorkoutSession"')),false);
});
test('invalid count cannot bypass evidence',async()=>{
 for(const invalid of [null,NaN,-1,'1',1.5]){const x=fixture({recorded:invalid});await assert.rejects(x.submit(),e=>e.status===409);}
});
test('already completed session cannot be written again',async()=>{
 const x=fixture({sessionStatus:'completed'});await assert.rejects(x.submit(),e=>e.status===409);
 assert.equal(x.calls.sql.length,1);
});
test('missing tenant session returns not found without query of workout sets',async()=>{
 const x=fixture({exists:false});await assert.rejects(x.submit(),e=>e.status===404);
 assert.equal(x.calls.sql.length,1);
});
test('row lock and tenant scope apply to evidence and mutation in one transaction',async()=>{
 const x=fixture();await x.submit();
 assert.match(x.calls.sql[0].sql,/FOR UPDATE OF s/);
 for(const c of x.calls.sql)assert.equal(c.args[0],'tenant-a');
 assert.equal(x.calls.transactions,1);
});
