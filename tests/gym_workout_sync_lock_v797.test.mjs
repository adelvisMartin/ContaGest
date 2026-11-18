import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {withGymWorkoutSyncLock} from '../frontend/src/services/gymWorkoutSyncLock.js';

function simulatedLocks() {
  const holders = new Map();
  const requested = [];
  return {
    requested,
    async request(name, options, callback) {
      requested.push({name, mode:options.mode});
      const prior = holders.get(name) || Promise.resolve();
      let release;
      const next = new Promise(resolve => { release = resolve; });
      holders.set(name, prior.then(() => next));
      await prior;
      try { return await callback(); }
      finally { release(); }
    }
  };
}
const A = 't3v-user1';
const B = 't3v-user2';

test('#797 same-scope tabs cannot overlap a workout outbox flush', async () => {
  const locks = simulatedLocks();
  const order = [];
  let unblockFirst;
  const first = withGymWorkoutSyncLock(A, async () => {
    order.push('first-start');
    await new Promise(resolve => { unblockFirst = resolve; });
    order.push('first-end');
    return 'one';
  }, locks);
  const second = withGymWorkoutSyncLock(A, async () => {
    order.push('second');
    return 'two';
  }, locks);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(order, ['first-start']);
  unblockFirst();
  assert.deepEqual(await Promise.all([first, second]), ['one','two']);
  assert.deepEqual(order, ['first-start','first-end','second']);
  assert.equal(locks.requested[0].name, locks.requested[1].name);
  assert.ok(locks.requested.every(row => row.mode === 'exclusive'));
});

test('#797 different member scopes are independent', async () => {
  const locks = simulatedLocks();
  let release;
  const first = withGymWorkoutSyncLock(A, () => new Promise(resolve => { release=resolve; }), locks);
  const second = await withGymWorkoutSyncLock(B, async () => 'other-member', locks);
  assert.equal(second,'other-member');
  release('first-member');
  assert.equal(await first, 'first-member');
  assert.notEqual(locks.requested[0].name, locks.requested[1].name);
});

test('#797 rejected send releases the lock for a safe next retry', async () => {
  const locks=simulatedLocks();
  await assert.rejects(withGymWorkoutSyncLock(A, async () => { throw Error('network'); }, locks), /network/);
  assert.equal(await withGymWorkoutSyncLock(A, async () => 'retry', locks), 'retry');
});

test('#797 browsers without Web Locks still use the server replay boundary', async () => {
  let calls=0;
  assert.equal(await withGymWorkoutSyncLock(A, async () => {calls++; return 'accepted';}, null), 'accepted');
  assert.equal(calls,1);
});

test('#797 invalid scope and invalid callback fail before acquiring a lock', async () => {
  const locks=simulatedLocks();
  for (const scope of ['', 'tenant-A/user-B', '../user', 'anonymous', null]) {
    await assert.rejects(withGymWorkoutSyncLock(scope, async () => null, locks), /SCOPE_INVALID/);
  }
  await assert.rejects(withGymWorkoutSyncLock(A, null, locks), TypeError);
  assert.equal(locks.requested.length,0);
});

test('#797 Gym adapter locks the shared canonical queue, not a second outbox', () => {
  const source = readFileSync(new URL('../frontend/src/services/gymWorkoutOfflineService.js',import.meta.url),'utf8');
  assert.match(source, /withGymWorkoutSyncLock\(sessionScope\(session\),\(\)=>flushOfflineOutbox\(session/);
  assert.match(source, /eventKey:idempotencyKey/);
  assert.match(source, /operations:\['gym\.workout\.set'\]/);
});
