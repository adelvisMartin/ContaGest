import test from 'node:test';
import assert from 'node:assert/strict';
import { writeBookingUnit, classifyBookingDatabaseError, BookingWriteError } from '../backend/src/modules/scheduling/booking-write-unit.js';

const ids = {tenant:'tenant_A',location:'location_A',actor:'operator-1',source:'dental-appointment-42'};
const now = '2026-10-15T11:00:00.000Z';
const at = minute => new Date(Date.UTC(2026, 9, 15, 12, minute)).toISOString();
const id = counter => '00000000-0000-4000-8000-' + String(counter).padStart(12,'0');
const values = Object.freeze({minAdvanceMinutes:30,maxAdvanceDays:7,cancellationNoticeMinutes:60,
  bufferBeforeMinutes:10,bufferAfterMinutes:15,waitlistEnabled:false,waitlistOfferTtlMinutes:0});
const command = (overrides={}) => ({
  tenantId:ids.tenant,locationId:ids.location,bookingId:id(101),idempotencyKey:id(102),
  sourceType:'dental',sourceId:ids.source,actorId:ids.actor,startsAtUtc:at(0),
  bookingPolicy:{tenant:{revision:'tenant-v4',effectiveFromUtc:'2026-01-01T00:00:00.000Z',values},atUtc:now},
  steps:[{stepId:'intake',offsetMinutes:0,durationMinutes:30,resourceIds:['chair-1']},
    {stepId:'procedure',offsetMinutes:30,durationMinutes:60,resourceIds:['chair-1']}],
  ...overrides
});
function store(options={}) {
  const committed={bookings:[],allocations:[],transactions:0};
  let nextId=200;
  const port={
    generateAllocationId:()=>options.idGenerator?.() ?? id(++nextId),
    async runInTransaction(callback) {
      committed.transactions++;
      const staged={bookings:[...committed.bookings],allocations:[...committed.allocations]};
      const result=await callback({
        async insertBooking(row) { if(options.onBooking) await options.onBooking(row); staged.bookings.push(row); },
        async insertAllocation(row) { if(options.onAllocation) await options.onAllocation(row); staged.allocations.push(row); }
      });
      committed.bookings=staged.bookings;
      committed.allocations=staged.allocations;
      return result;
    }
  };
  return {committed,port};
}
const err=(code,text='secret=PRIVATE_SCHEDULE_URL')=>Object.assign(new Error(text),{code,detail:text,constraint:'secret_resource_911'});

// Proof covers the port protocol only, not ACID in a real PostgreSQL process.
test('one transaction writes booking then every ordered allocation; policy edge buffers apply only to global boundaries',async()=>{
  const {port,committed}=store();const result=await writeBookingUnit(command(),port);
  assert.equal(committed.transactions,1);
  assert.equal(committed.bookings.length,1);
  assert.equal(committed.allocations.length,2);
  assert.equal(result.allocationCount,2);
  assert.equal(result.endsAtUtc,at(90));
  assert.deepEqual(committed.allocations.map(x=>x.occupiedStartAt),[at(-10),at(30)]);
  assert.deepEqual(committed.allocations.map(x=>x.occupiedEndAt),[at(30),at(105)]);
  assert.equal(result.tenantPolicyRevision,'tenant-v4');
  assert.equal(result.servicePolicyRevision,null);
});
test('policy min-advance rejects before any transaction starts',async()=>{
  const {port,committed}=store();
  await assert.rejects(writeBookingUnit(command({startsAtUtc:'2026-10-15T11:10:00.000Z'}),port),
    e=>e instanceof BookingWriteError&&e.code==='SCHEDULING_BOOKING_WINDOW_CONFLICT');
  assert.equal(committed.transactions,0);
});
test('policy max-advance rejects without a write',async()=>{
  const {port,committed}=store();
  await assert.rejects(writeBookingUnit(command({startsAtUtc:'2026-10-24T12:00:00.000Z'}),port),
    e=>e.code==='SCHEDULING_BOOKING_WINDOW_CONFLICT');
  assert.equal(committed.transactions,0);
});
test('buffer-induced intra-booking collision is rejected before the transaction starts',async()=>{
  const {port,committed}=store();const steps=[
    {stepId:'a',offsetMinutes:0,durationMinutes:30,resourceIds:['chair-1'],bufferAfterMinutes:5},
    {stepId:'b',offsetMinutes:30,durationMinutes:30,resourceIds:['chair-1']}];
  await assert.rejects(writeBookingUnit(command({steps}),port),e=>e.code==='SCHEDULING_INTERNAL_RESOURCE_CONFLICT');
  assert.equal(committed.transactions,0);
});
test('distinct resources may be booked in parallel within the same ACID callback',async()=>{
  const {port,committed}=store(); const steps=[
    {stepId:'b',offsetMinutes:0,durationMinutes:60,resourceIds:['room-b']},
    {stepId:'a',offsetMinutes:0,durationMinutes:30,resourceIds:['room-a']}];
  const r=await writeBookingUnit(command({steps}),port);
  assert.equal(r.endsAtUtc,at(60));
  assert.deepEqual(committed.allocations.map(c=>c.resourceId),['room-a','room-b']);
});
test('multiple resources for one stage create claims with same booking id',async()=>{
  const {port,committed}=store();await writeBookingUnit(command({steps:[
    {stepId:'a',offsetMinutes:0,durationMinutes:60,resourceIds:['staff-1','chair-2']}]}),port);
  assert.equal(committed.allocations.length,2);
  assert.ok(committed.allocations.every(x=>x.bookingId===id(101)&&x.tenantId===ids.tenant));
});
test('server policy before/after does not silently replace stricter stage buffers',async()=>{
  const {port,committed}=store();await writeBookingUnit(command({steps:[
    {stepId:'a',offsetMinutes:0,durationMinutes:45,resourceIds:['room-a'],bufferBeforeMinutes:25,bufferAfterMinutes:35}
  ]}),port);
  assert.equal(committed.allocations[0].occupiedStartAt,at(-25));
  assert.equal(committed.allocations[0].occupiedEndAt,at(80));
});
test('service policy revision overrides advance/buffers through existing authority',async()=>{
  const {port,committed}=store();const p=command();p.bookingPolicy.service={revision:'service-v2',effectiveFromUtc:'2026-10-01T00:00:00.000Z',values:{bufferBeforeMinutes:20}};
  const result=await writeBookingUnit(p,port);
  assert.equal(result.servicePolicyRevision,'service-v2');
  assert.equal(committed.allocations[0].occupiedStartAt,at(-20));
});
test('database exclusion 23P01 maps to privacy-safe 409 without exposing SQL or IDs',async()=>{
  const {port,committed}=store({onAllocation(){throw err('23P01')}});
  await assert.rejects(writeBookingUnit(command(),port),e=>e instanceof BookingWriteError&&
    e.code==='SCHEDULING_RESOURCE_CONFLICT'&&e.httpStatus===409&&
    !e.message.includes('secret')&&!e.message.includes('PRIVATE')&&!e.retryable);
  assert.equal(committed.bookings.length,0);
  assert.equal(committed.allocations.length,0);
});
test('unique-key conflict 23505 is not mistaken for successful idempotent retry',async()=>{
  const {port,committed}=store({onBooking(){throw err('23505')}});
  await assert.rejects(writeBookingUnit(command(),port),e=>e.code==='SCHEDULING_UNIQUE_CONFLICT');
  assert.equal(committed.bookings.length,0);
});
test('foreign-key failure 23503 is a bounded reference conflict',async()=>{
  assert.equal(classifyBookingDatabaseError(err('23503')).code,'SCHEDULING_REFERENCE_CONFLICT');
});
test('CHECK violation 23514 is a bounded constraint conflict',async()=>{
  assert.equal(classifyBookingDatabaseError(err('23514')).code,'SCHEDULING_CONSTRAINT_CONFLICT');
});
test('serialization conflict 40001 is retryable, never silently retried',async()=>{
  const {port,committed}=store({onBooking(){throw err('40001')}});
  await assert.rejects(writeBookingUnit(command(),port),e=>e.retryable&&e.code==='SCHEDULING_RETRYABLE_CONFLICT');
  assert.equal(committed.transactions,1);
});
test('deadlock 40P01 is classified as retryable conflict',async()=>{
  const e=classifyBookingDatabaseError(err('40P01'));
  assert.equal(e.code,'SCHEDULING_RETRYABLE_CONFLICT'); assert.equal(e.retryable,true);
});
test('unexpected errors are propagated, not masked into misleading 409',async()=>{
  const e=err('XX999');const {port}=store({onAllocation(){throw e;}});
  await assert.rejects(writeBookingUnit(command(),port),x=>x===e);
  assert.equal(classifyBookingDatabaseError(e),null);
});
test('simulated failure on second allocation rolls back all staged rows',async()=>{
  let calls=0; const {port,committed}=store({onAllocation(){if(++calls===2)throw err('23P01')}});
  await assert.rejects(writeBookingUnit(command(),port),e=>e.code==='SCHEDULING_RESOURCE_CONFLICT');
  assert.deepEqual(committed.bookings,[]); assert.deepEqual(committed.allocations,[]);
});
test('invalid server-generated allocation id fails the transaction (no partial commit)',async()=>{
  const {port,committed}=store({idGenerator:()=> 'not-a-uuid'});
  await assert.rejects(writeBookingUnit(command(),port),e=>e.code==='SCHEDULING_WRITE_INPUT_INVALID');
  assert.equal(committed.bookings.length,0);
});
test('forged tenant authority field cannot be injected into command',async()=>{
  const {port,committed}=store();
  await assert.rejects(writeBookingUnit({...command(),claimedRole:'admin'},port),e=>e.code==='SCHEDULING_WRITE_INPUT_INVALID');
  assert.equal(committed.transactions,0);
});
test('unsafe identifiers, missing idempotency UUID, and wrong source type fail closed',async()=>{
  for(const field of [{tenantId:'customer/foo'},{idempotencyKey:'text'},{bookingId:'notuuid'},{sourceType:'DENTAL'}]){
    const {port,committed}=store();
    await assert.rejects(writeBookingUnit(command(field),port),e=>e.code==='SCHEDULING_WRITE_INPUT_INVALID');
    assert.equal(committed.transactions,0);
  }
});
test('future-effective policy fails closed before database write',async()=>{
  const c=command();c.bookingPolicy.tenant.effectiveFromUtc='2026-12-01T00:00:00.000Z';
  const {port,committed}=store();
  await assert.rejects(writeBookingUnit(c,port),e=>e.code==='SCHEDULING_POLICY_NOT_EFFECTIVE');
  assert.equal(committed.transactions,0);
});
test('duplicate resource in the same stage is rejected before database write',async()=>{
  const {port,committed}=store();
  await assert.rejects(writeBookingUnit(command({steps:[{stepId:'a',offsetMinutes:0,durationMinutes:60,resourceIds:['room-a','room-a']}]}),port),e=>e.code==='SCHEDULING_SEGMENTS_INVALID');
  assert.equal(committed.transactions,0);
});
test('empty steps are rejected before database write',async()=>{
  const {port,committed}=store();
  await assert.rejects(writeBookingUnit(command({steps:[]}),port));
  assert.equal(committed.transactions,0);
});
test('missing transaction boundary fails before writing',async()=>{
  await assert.rejects(writeBookingUnit(command(),{generateAllocationId:()=>id(201)}),e=>e.code==='SCHEDULING_WRITE_INPUT_INVALID');
});
test('command inputs remain unchanged and successful returned result frozen',async()=>{
  const c=command();const before=JSON.stringify(c);const {port}=store();
  const result=await writeBookingUnit(c,port);
  assert.equal(JSON.stringify(c),before); assert.equal(Object.isFrozen(result),true);
});
