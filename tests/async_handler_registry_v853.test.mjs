import test from 'node:test';
import assert from 'node:assert/strict';
import { createAsyncJobHandlerRegistry, assertApprovedAsyncJobHandler } from '../backend/src/modules/jobs/async-handler-registry.ts';

const key = 'reports.refresh.v1';
const policy = (handlerKey=key) => ({
  handlerKey, effectGuard: 'compare-and-set',
  validatePayload: (p) => p !== null && typeof p === 'object' && !Array.isArray(p) &&
    Object.getPrototypeOf(p) === Object.prototype && Object.keys(p).length === 1 &&
    typeof p.reportId === 'string' && /^[0-9]{1,10}$/.test(p.reportId),
});

test('only an explicitly registered handler with its schema can be enqueued', () => {
  const registry = createAsyncJobHandlerRegistry([policy()]);
  assert.doesNotThrow(() => assertApprovedAsyncJobHandler(registry, key, {reportId: '42'}));
  for (const payload of [{reportId:'42', token:'unsafe'}, {reportId:42}, [], null]) {
    assert.throws(() => assertApprovedAsyncJobHandler(registry, key, payload), /ASYNC_HANDLER_PAYLOAD_INVALID/);
  }
  assert.throws(() => assertApprovedAsyncJobHandler(registry, 'reports.send.v1', {reportId:'42'}), /ASYNC_HANDLER_NOT_REGISTERED/);
});

test('unknown and forged registry objects fail closed, including empty registry', () => {
  const forged = {keys:[key], assertAllowed() {}};
  assert.throws(() => assertApprovedAsyncJobHandler(forged, key, {}), /ASYNC_HANDLER_REGISTRY_UNTRUSTED/);
  assert.throws(() => assertApprovedAsyncJobHandler(undefined, key, {}), /ASYNC_HANDLER_REGISTRY_UNTRUSTED/);
  assert.throws(() => assertApprovedAsyncJobHandler(createAsyncJobHandlerRegistry([]), key, {}), /ASYNC_HANDLER_NOT_REGISTERED/);
});

test('schema errors never expose original payload or exception message', () => {
  const registry = createAsyncJobHandlerRegistry([{handlerKey:key,effectGuard:'effect-ledger',validatePayload() { throw Error('password=secret-token'); }}]);
  assert.throws(() => assertApprovedAsyncJobHandler(registry,key,{password:'secret-token'}), (e) => e.message === 'ASYNC_HANDLER_PAYLOAD_INVALID');
});

test('duplicate, unversioned, non-allowlisted and unsafe registrations are rejected', () => {
  for (const defs of [
    [policy(),policy()], [policy('__proto__')], [policy('reports.refresh')],
    [{...policy(),effectGuard:'unknown'}], [{...policy(),validatePayload:'not a function'}],
    new Array(33).fill(policy()), null,
  ]) assert.throws(() => createAsyncJobHandlerRegistry(defs), /^Error: ASYNC_HANDLER_/);
});

test('registry keys are immutable, sorted and do not grant dispatch capability', () => {
  const registry = createAsyncJobHandlerRegistry([policy('reports.zeta.v1'),policy('reports.alpha.v1')]);
  assert.deepEqual(registry.keys,['reports.alpha.v1','reports.zeta.v1']);
  assert.ok(Object.isFrozen(registry) && Object.isFrozen(registry.keys));
  assert.equal('execute' in registry,false);
  assert.equal('dispatch' in registry,false);
});

test('schema validators cannot silently mutate the payload to approve a different effect', () => {
  const registry = createAsyncJobHandlerRegistry([{
    handlerKey:key, effectGuard:'provider-idempotency',
    validatePayload(p) { p.reportId = 'trusted'; return true; },
  }]);
  const payload = {reportId:'untrusted'};
  assert.throws(() => assertApprovedAsyncJobHandler(registry,key,payload), /ASYNC_HANDLER_PAYLOAD_INVALID/);
});

test('rejected validator cannot mutate caller input, including nested state', () => {
  const registry = createAsyncJobHandlerRegistry([{
    handlerKey:key, effectGuard:'compare-and-set',
    validatePayload(p) { p.nested.value='malicious'; return true; },
  }]);
  const payload = {nested:{value:'original'}};
  assert.throws(() => assertApprovedAsyncJobHandler(registry,key,payload), /ASYNC_HANDLER_PAYLOAD_INVALID/);
  assert.deepEqual(payload,{nested:{value:'original'}});
});

test('accessor and non-JSON payloads are rejected without invoking getters or leaking details', () => {
  let getterCalls = 0;
  const payload = { get secret() { getterCalls++; return 'raw-secret'; } };
  const registry = createAsyncJobHandlerRegistry([{
    handlerKey:key, effectGuard:'effect-ledger', validatePayload() { return true; },
  }]);
  assert.throws(() => assertApprovedAsyncJobHandler(registry,key,payload), (e) => e.message === 'ASYNC_HANDLER_PAYLOAD_INVALID');
  assert.equal(getterCalls, 0);
  const cycle = {}; cycle.self = cycle;
  for (const invalid of [cycle, {nested: undefined}, {nested:Infinity}, {nested:new Date()}, {nested:BigInt(42)}, {'big':'🚀'.repeat(5000)}]) {
    assert.throws(() => assertApprovedAsyncJobHandler(registry,key,invalid), (e) => e.message === 'ASYNC_HANDLER_PAYLOAD_INVALID');
  }
});

test('validator receives deeply immutable detached JSON but original remains mutable', () => {
  const registry = createAsyncJobHandlerRegistry([{
    handlerKey:key, effectGuard:'compare-and-set',
    validatePayload(p) {
      assert.ok(Object.isFrozen(p) && Object.isFrozen(p.nested) && Object.isFrozen(p.nested.ids));
      assert.notEqual(p, original);
      assert.equal(p.nested.ids[0], 42);
      return true;
    },
  }]);
  const original = {nested:{ids:[42]}};
  assert.doesNotThrow(() => assertApprovedAsyncJobHandler(registry,key,original));
  original.nested.ids.push(43);
  assert.deepEqual(original.nested.ids,[42,43]);
});


test('oversized arrays fail before key enumeration and do not reach the handler', () => {
  let enumerated = 0, invoked = 0;
  const oversized = new Proxy(new Array(100_000), {
    ownKeys() { enumerated++; throw Error('should not enumerate'); },
  });
  const registry = createAsyncJobHandlerRegistry([{
    handlerKey: key, effectGuard: 'compare-and-set',
    validatePayload() { invoked++; return true; },
  }]);
  assert.throws(() => assertApprovedAsyncJobHandler(registry,key,{items:oversized}),
    (e) => e.message === 'ASYNC_HANDLER_PAYLOAD_INVALID');
  assert.equal(enumerated,0);
  assert.equal(invoked,0);
});

test('oversized strings are rejected before later property traversal', () => {
  const registry = createAsyncJobHandlerRegistry([{
    handlerKey: key, effectGuard: 'compare-and-set', validatePayload: () => true,
  }]);
  const payload = { data: 'a'.repeat(20_000), safe: 'ignored' };
  assert.throws(() => assertApprovedAsyncJobHandler(registry,key,payload),
    /ASYNC_HANDLER_PAYLOAD_INVALID/);
  assert.equal(payload.data.length,20_000);
});

test('too many shallow keys fail without invoking the registered validator', () => {
  let invoked=0;
  const registry = createAsyncJobHandlerRegistry([{
    handlerKey: key, effectGuard: 'effect-ledger', validatePayload() { invoked++; return true; },
  }]);
  const payload = Object.fromEntries(Array.from({length:8500},(_,i)=>['k'+i,0]));
  assert.throws(() => assertApprovedAsyncJobHandler(registry,key,payload),
    /ASYNC_HANDLER_PAYLOAD_INVALID/);
  assert.equal(invoked,0);
});

test('modest dense arrays and Unicode payloads still reach an approved schema', () => {
  const registry = createAsyncJobHandlerRegistry([{
    handlerKey: key, effectGuard: 'compare-and-set',
    validatePayload: p => Object.isFrozen(p) && Object.isFrozen(p.rows) &&
      p.rows.length === 128 && p.message === '✔ seguridad',
  }]);
  const payload = {rows: Array.from({length:128},(_,i)=>i), message:'✔ seguridad'};
  assert.doesNotThrow(()=>assertApprovedAsyncJobHandler(registry,key,payload));
});
