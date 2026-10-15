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
