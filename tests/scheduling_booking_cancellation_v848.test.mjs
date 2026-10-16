import test from 'node:test';
import assert from 'node:assert/strict';
import {cancelBookingUnit, BookingCancellationError} from '../backend/src/modules/scheduling/booking-cancellation-unit.ts';
const bookingId='00000000-0000-4000-8000-000000000123';
const now='2026-10-15T12:00:00.000Z';
const timestamp='2026-10-15T10:30:00.000Z';
const values={minAdvanceMinutes:0,maxAdvanceDays:7,cancellationNoticeMinutes:60,bufferBeforeMinutes:0,bufferAfterMinutes:0,waitlistEnabled:false,waitlistOfferTtlMinutes:0};
const policy={tenant:{revision:'t-1',effectiveFromUtc:'2026-01-01T00:00:00.000Z',values},atUtc:now};
const command=(more={})=>({tenantId:'tenant-A',locationId:'location-A',bookingId,actorId:'actor-A',expectedUpdatedAtUtc:timestamp,nowUtc:now,bookingPolicy:policy,...more});
const booking=(more={})=>({id:bookingId,tenantId:'tenant-A',locationId:'location-A',status:'confirmed',startsAtUtc:'2026-10-15T15:00:00.000Z',updatedAtUtc:timestamp,activeAllocationCount:2,...more});
function port(options={}) {
 let saved={row:booking(),activeCount:2,audit:[]}; const calls=[];
 return {calls,get saved(){return saved},unit:{async runInTransaction(cb){calls.push('BEGIN'); const staged={row:{...saved.row},activeCount:saved.activeCount,audit:[...saved.audit]};
  const tx={async lockBooking(k){calls.push('LOCK');return options.missing?null:{...staged.row,...options.locked}},
   async cancelIfCurrent(k){calls.push('CAS');if(options.cas!==undefined)return options.cas;staged.row.status='cancelled';return 1},
   async releaseActiveAllocations(k){calls.push('RELEASE');const num=options.release!==undefined?options.release:staged.activeCount;staged.activeCount=0;return num},
   async recordAudit(e){calls.push('AUDIT');if(options.auditFail)throw Error('audit-failed');staged.audit.push(e)}
  };try {const result=await cb(tx);saved=staged;calls.push('COMMIT');return result;} catch(error){calls.push('ROLLBACK');throw error;}
 }}};
}
const code=(value)=>e=>e instanceof BookingCancellationError&&e.code===value;
test('confirmed booking cancels once, releases all allocations and audits atomically',async()=>{const p=port();const result=await cancelBookingUnit(command(),p.unit);assert.deepEqual(p.calls,['BEGIN','LOCK','CAS','RELEASE','AUDIT','COMMIT']);assert.equal(result.releasedAllocations,2);assert.equal(p.saved.row.status,'cancelled');assert.equal(p.saved.activeCount,0);assert.equal(p.saved.audit.length,1);assert.equal(result.tenantPolicyRevision,'t-1');assert.ok(Object.isFrozen(result));});
test('already cancelled cannot release or audit a second time',async()=>{const p=port({locked:{status:'cancelled'}});await assert.rejects(cancelBookingUnit(command(),p.unit),code('SCHEDULING_ALREADY_CANCELLED'));assert.deepEqual(p.calls,['BEGIN','LOCK','ROLLBACK']);});
test('missing booking yields tenant-safe 404 and no mutation',async()=>{const p=port({missing:true});await assert.rejects(cancelBookingUnit(command(),p.unit),e=>code('SCHEDULING_CANCEL_NOT_FOUND')(e)&&e.status===404);assert.equal(p.saved.audit.length,0);});
test('tenant spoofing inside returned row fails closed',async()=>{const p=port({locked:{tenantId:'tenant-B'}});await assert.rejects(cancelBookingUnit(command(),p.unit),code('SCHEDULING_CANCEL_INVALID'));assert.ok(!p.calls.includes('CAS'));});
test('location spoofing inside returned row fails closed',async()=>{const p=port({locked:{locationId:'location-B'}});await assert.rejects(cancelBookingUnit(command(),p.unit),code('SCHEDULING_CANCEL_INVALID'));});
test('stale updatedAt precondition prevents cancellation',async()=>{const p=port({locked:{updatedAtUtc:'2026-10-15T10:31:00.000Z'}});await assert.rejects(cancelBookingUnit(command(),p.unit),code('SCHEDULING_CANCEL_STALE'));assert.ok(!p.calls.includes('CAS'));});
test('CAS mismatch fails transaction without releasing claims',async()=>{const p=port({cas:0});await assert.rejects(cancelBookingUnit(command(),p.unit),code('SCHEDULING_CANCEL_STALE'));assert.deepEqual(p.calls,['BEGIN','LOCK','CAS','ROLLBACK']);});
test('release mismatch triggers rollback of booking status',async()=>{const p=port({release:1});await assert.rejects(cancelBookingUnit(command(),p.unit),code('SCHEDULING_CANCEL_RELEASE_MISMATCH'));assert.equal(p.saved.row.status,'confirmed');assert.equal(p.saved.activeCount,2);});
test('audit failure rolls back cancellation and resource release',async()=>{const p=port({auditFail:true});await assert.rejects(cancelBookingUnit(command(),p.unit),/audit-failed/);assert.equal(p.saved.row.status,'confirmed');assert.equal(p.saved.activeCount,2);});
test('cancellation policy blocks requests too close to appointment',async()=>{const p=port({locked:{startsAtUtc:'2026-10-15T12:59:59.999Z'}});await assert.rejects(cancelBookingUnit(command(),p.unit),code('SCHEDULING_CANCEL_POLICY_DENIED'));assert.ok(!p.calls.includes('CAS'));});
test('cancellation exactly on policy cutoff is allowed',async()=>{const p=port({locked:{startsAtUtc:'2026-10-15T13:00:00.000Z'}});assert.equal((await cancelBookingUnit(command(),p.unit)).releasedAllocations,2);});
test('missing or zero active claims are rejected rather than falsely successful',async()=>{for(const x of [0,-1,129,1.5]){const p=port({locked:{activeAllocationCount:x}});await assert.rejects(cancelBookingUnit(command(),p.unit),code('SCHEDULING_CANCEL_INVALID'));assert.ok(!p.calls.includes('CAS'));}});
test('unknown input fields and forged role are rejected before transaction',async()=>{const p=port();await assert.rejects(cancelBookingUnit({...command(),isAdmin:true},p.unit),code('SCHEDULING_CANCEL_INVALID'));assert.deepEqual(p.calls,[]);});
test('invalid UUID, ambiguous time or policy-clock mismatch reject pretransaction',async()=>{for(const q of [{bookingId:'not-uuid'},{nowUtc:'2026-10-15T12:00:00Z'},{expectedUpdatedAtUtc:'2026-02-30T10:00:00.000Z'},{bookingPolicy:{...policy,atUtc:'2026-10-15T11:59:00.000Z'}}]){const p=port();await assert.rejects(cancelBookingUnit(command(q),p.unit),code('SCHEDULING_CANCEL_INVALID'));assert.equal(p.calls.length,0);}});
test('incorrect or missing transaction port fails closed',async()=>{await assert.rejects(cancelBookingUnit(command(),{}),code('SCHEDULING_CANCEL_INVALID'));});
test('adapter missing auditing capability fails before reading/writing booking',async()=>{const calls=[];await assert.rejects(cancelBookingUnit(command(),{runInTransaction:async cb=>cb({lockBooking:async()=>{calls.push('LOCK');return booking()},cancelIfCurrent:async()=>1,releaseActiveAllocations:async()=>2})}),code('SCHEDULING_CANCEL_INVALID'));assert.deepEqual(calls,[]);});
test('malformed DB result with invalid UTC fails before CAS',async()=>{const p=port({locked:{startsAtUtc:'invalid'}});await assert.rejects(cancelBookingUnit(command(),p.unit),code('SCHEDULING_CANCEL_INVALID'));assert.ok(!p.calls.includes('CAS'));});
test('repeat input does not mutate caller command',async()=>{const p=port();const c=command();const before=JSON.stringify(c);await cancelBookingUnit(c,p.unit);assert.equal(JSON.stringify(c),before);});
