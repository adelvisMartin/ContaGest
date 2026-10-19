import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../backend/src/modules/verticals/gym-core.routes.ts',import.meta.url),'utf8');
const a=source.indexOf("router.post('/gym/checkins'");
const b=source.indexOf("router.get('/gym/assessments'",a);
assert.ok(a>=0&&b>a,'real check-in handler available');
const handler=source.slice(a,b).replace(/<Array<\{[^}]*\}>>/g,'').replace(/<any\[\]>/g,'');
class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
function fixture({member=true,membership={id:'membership-1',remainingAccesses:2},updated=1,failInsert=false}={}){
 const calls={query:[],update:[],status:null,response:null,isolation:null,transactions:0};
 let route;
 const tx={
  $queryRawUnsafe:async (sql,...args)=>{
   calls.query.push({sql,args});
   if(sql.includes('FROM public."GymMember"'))return member?[{id:'member-1'}]:[];
   if(sql.includes('FROM public."GymMembership"'))return membership?[membership]:[];
   if(sql.includes('INSERT INTO public."GymCheckIn"')){
    if(failInsert)throw new Error('insert failed');
    return [{id:'checkin-1',result:membership?'accepted':'rejected'}];
   }
   throw Error('unrecognized database statement');
  },
  $executeRawUnsafe:async (sql,...args)=>{calls.update.push({sql,args});return updated;}
 };
 const prisma={$transaction:async(callback,options)=>{
  calls.transactions++;calls.isolation=options?.isolationLevel;
  return callback(tx);
 }};
 const compiled=new Function('router','requirePermission','asyncHandler','checkInSchema','ctx',
  'prisma','Prisma','HttpError','one','ok',handler);
 compiled({post:(_path,_perm,cb)=>route=cb},x=>x,x=>x,{parse:x=>x},
  ()=>({tenantId:'tenant-a'}),prisma,{TransactionIsolationLevel:{Serializable:'Serializable'}},
  HttpError,rows=>rows[0],(_res,response,status)=>{calls.response=response;calls.status=status});
 return {calls,submit:()=>route({body:{memberId:'member-1',method:'manual'}},{})};
}
test('single serializable transaction covers accepted record plus decrement',async()=>{
 const x=fixture();await x.submit();assert.equal(x.calls.transactions,1);assert.equal(x.calls.isolation,'Serializable');
 assert.equal(x.calls.update.length,1);assert.equal(x.calls.status,201);assert.equal(x.calls.response.membershipValid,true);
});
test('tenant scope is bound to both member and membership and decrement',async()=>{
 const x=fixture();await x.submit();
 for(const q of x.calls.query)assert.equal(q.args[0],'tenant-a');
 assert.equal(x.calls.update[0].args[1],'tenant-a');
 assert.match(x.calls.query[0].sql,/FOR UPDATE/);
 assert.match(x.calls.query[1].sql,/FOR UPDATE/);
 assert.match(x.calls.query[1].sql,/"remainingAccesses">0/);
});
test('unlimited membership does not decrement count',async()=>{
 const x=fixture({membership:{id:'membership-1',remainingAccesses:null}});
 await x.submit();assert.equal(x.calls.update.length,0);assert.equal(x.calls.status,201);
});
test('no active eligible membership records rejected without consuming accesses',async()=>{
 const x=fixture({membership:null});await x.submit();assert.equal(x.calls.status,200);
 assert.equal(x.calls.response.membershipValid,false);assert.equal(x.calls.update.length,0);
});
test('unknown tenant member cannot create orphan check-in',async()=>{
 const x=fixture({member:false});await assert.rejects(x.submit(),e=>e.status===404);
 assert.equal(x.calls.query.some(q=>q.sql.includes('INSERT INTO')),false);
});
test('concurrent update conflict aborts before check-in insert',async()=>{
 const x=fixture({updated:0});await assert.rejects(x.submit(),e=>e.status===409);
 assert.equal(x.calls.query.some(q=>q.sql.includes('INSERT INTO')),false);
});
test('failed insert propagates transaction error instead of returning success',async()=>{
 const x=fixture({failInsert:true});await assert.rejects(x.submit(),/insert failed/);
 assert.equal(x.calls.status,null);assert.equal(x.calls.transactions,1);
});
test('legacy unsafe two-stage decrement is removed',()=>{
 assert.doesNotMatch(handler,/GREATEST\(0,"remainingAccesses"-1\)/);
 assert.doesNotMatch(handler,/await prisma\.\$executeRawUnsafe/);
 assert.match(handler,/prisma\.\$transaction/);
 assert.match(handler,/WHERE "id"=\$1 AND "tenantId"=\$2 AND "memberId"=\$3/);
});
