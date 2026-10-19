import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../backend/src/modules/verticals/gym-extended.routes.ts',import.meta.url),'utf8');
const a=source.indexOf("router.post('/gym/classes/bookings'");
const b=source.indexOf("router.patch('/gym/memberships/:id/status'",a);
assert.ok(a>0&&b>a,'real booking route present');
const route=source.slice(a,b).replace(/<any\[\]>/g,'').replace(/<Array<\{[^}]*\}>>/g,'');
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
function fixture({existing=null,capacity=2,occupied=1,member=true,membership=true,status='booked',classStatus='scheduled'}={}){
 const calls={sql:[],status:null,response:null,tx:0};
 let endpoint;
 const db={$queryRawUnsafe:async (sql,...args)=>{
  calls.sql.push({sql,args});
  if(sql.includes('FROM public."GymClass"'))return [{id:'class-a',capacity,status:classStatus}];
  if(sql.includes('FROM public."GymMember"'))return member?[{id:'member-a'}]:[];
  if(sql.includes('FROM public."GymClassBooking"')){
    if(sql.includes('count(*)'))return [{taken:occupied}];
    return existing?[{...existing}]:[];
  }
  if(sql.includes('FROM public."GymMembership"'))return membership?[{id:'membership-a'}]:[];
  if(sql.includes('INSERT INTO public."GymClassBooking"'))return [{id:'new-booking',status}];
  throw Error('Unexpected query '+sql);
 }};
 const prisma={$transaction:async cb=>{calls.tx++;return cb(db)}};
 const compiled=new Function('router','requirePermission','asyncHandler','gymClassBookingSchema',
   'context','prisma','one','HttpError','ok',route);
 compiled({post:(_url,_perm,handler)=>endpoint=handler},x=>x,x=>x,{parse:x=>x},
  ()=>({tenantId:'tenant-a'}),prisma,
  (rows,msg='Not found')=>{if(!rows.length)throw new HttpError(404,msg);return rows[0]},
  HttpError,(_res,response,statusCode)=>{calls.status=statusCode;calls.response=response;});
 return {calls,submit:()=>endpoint({body:{classId:'class-a',memberId:'member-a',status}},{})};
}
test('new booking locks class and counts seats inside one transaction',async()=>{
 const x=fixture();await x.submit();
 assert.equal(x.calls.status,201);assert.equal(x.calls.tx,1);
 assert.match(x.calls.sql[0].sql,/FOR UPDATE/);
 assert.match(x.calls.sql.at(-2).sql,/status" IN \('booked','attended'\)/);
 assert.match(x.calls.sql.at(-1).sql,/ON CONFLICT/);
});
test('duplicate retry returns prior booking without writing or consuming another seat',async()=>{
 const x=fixture({existing:{id:'booking-a',status:'booked'},capacity:1,occupied:1});
 await x.submit();assert.equal(x.calls.status,200);assert.equal(x.calls.response.id,'booking-a');
 assert.equal(x.calls.sql.some(q=>q.sql.includes('INSERT INTO')),false);
});
test('sold-out class rejects new booking before insert',async()=>{
 const x=fixture({capacity:1,occupied:1});
 await assert.rejects(x.submit(),e=>e.status===409);
 assert.equal(x.calls.sql.some(q=>q.sql.includes('INSERT INTO')),false);
});
test('tenant member ownership is mandatory',async()=>{
 const x=fixture({member:false});await assert.rejects(x.submit(),e=>e.status===404);
 assert.equal(x.calls.sql.some(q=>q.sql.includes('INSERT INTO')),false);
});
test('active membership is required for booked status',async()=>{
 const x=fixture({membership:false});await assert.rejects(x.submit(),e=>e.status===403);
 assert.equal(x.calls.sql.some(q=>q.sql.includes('INSERT INTO')),false);
});
test('nonbooked status cannot create fabricated attendance or cancellation',async()=>{
 const x=fixture({status:'attended'});await assert.rejects(x.submit(),e=>e.status===409);
 assert.equal(x.calls.sql.some(q=>q.sql.includes('INSERT INTO')),false);
});
test('legitimate booked -> attended is a state change, not a new seat',async()=>{
 const x=fixture({status:'attended',existing:{id:'booking-a',status:'booked'}});
 await x.submit();assert.equal(x.calls.status,201);assert.equal(x.calls.response.status,'attended');
});
test('attended or no-show booking cannot be reopened to steal another seat',async()=>{
 for(const prior of ['attended','no_show']){
   const x=fixture({existing:{id:'booking-a',status:prior}});await assert.rejects(x.submit(),e=>e.status===409);
 }
});
test('cancelled booking may rebook only when a seat is available',async()=>{
 const a=fixture({existing:{id:'booking-a',status:'cancelled'},capacity:2,occupied:1});await a.submit();assert.equal(a.calls.status,201);
 const b=fixture({existing:{id:'booking-a',status:'cancelled'},capacity:1,occupied:1});await assert.rejects(b.submit(),e=>e.status===409);
});
test('class status must be scheduled for new bookings',async()=>{
 const x=fixture({classStatus:'cancelled'});await assert.rejects(x.submit(),e=>e.status===409);
});
test('all SQL reads are tenant-scoped, including bookings count and membership',async()=>{
 const x=fixture();await x.submit();
 for(const q of x.calls.sql)if(q.sql.includes('FROM public.'))assert.ok(q.args.includes('tenant-a'));
 assert.match(route,/WHERE public."GymClassBooking"."tenantId" = EXCLUDED."tenantId"/);
});
test('capacity is read after lock and no separate writes outside the transaction',()=>{
 assert.match(route,/prisma\.\$transaction\(async tx =>/);
 assert.doesNotMatch(route,/await prisma\.\$queryRawUnsafe/);
 assert.match(route,/count\(\*\)::int AS taken/);
 assert.match(route,/FOR UPDATE/);
});
