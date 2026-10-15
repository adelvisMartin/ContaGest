import test from 'node:test';
import assert from 'node:assert/strict';
import { createCounterOrderCommit } from '../frontend/src/services/posCounterOrderCommit.mjs';

const draft = Object.freeze({ source: 'counter', customer: 'QA LAB', items: [{ sku: 'SKU1', qty: 1 }] });
const saved = Object.freeze({ id: 'server-order-001', ...draft });
const deferred = () => { let resolve; let reject; const promise = new Promise((yes,no) => { resolve=yes; reject=no; }); return { promise, resolve, reject }; };

test('commits only a response with an authoritative ID', async () => {
  const local = [];
  const submit = createCounterOrderCommit({ save: async () => saved, commit: (result) => local.push(result) });
  assert.deepEqual(await submit(draft), { status: 'saved', order: saved, uiUpdated: true });
  assert.deepEqual(local, [saved]);
});
test('failed network response does not create a local order or mutate cart', async () => {
  let committed = 0;
  const submit = createCounterOrderCommit({ save: async () => { throw Error('timeout'); }, commit: () => committed++ });
  await assert.rejects(submit(draft), /timeout/);
  assert.equal(committed, 0);
  assert.equal(draft.items.length, 1);
});
test('invalid, missing or blank IDs never pass to Store', async () => {
  for (const invalid of [null, undefined, true, {}, {id:''}, {id:' '}, {id:42}, [], [{id:'x'}]]) {
    let committed = false;
    const submit = createCounterOrderCommit({ save: async () => invalid, commit: () => committed=true });
    await assert.rejects(submit(draft), /POS_ORDER_SERVER_CONFIRMATION_MISSING/);
    assert.equal(committed, false);
  }
});
test('second click during POST is refused, not scheduled for a duplicate write', async () => {
  const gate=deferred(); let calls=0; let commits=0;
  const submit=createCounterOrderCommit({save: () => {calls++;return gate.promise;},commit:()=>commits++});
  const first=submit(draft);
  assert.deepEqual(await submit(draft), {status:'busy'});
  assert.equal(calls, 1);
  gate.resolve(saved);
  assert.equal((await first).status, 'saved');
  assert.equal(commits, 1);
});
test('failed POST releases in-flight gate for deliberate new operator action', async () => {
  const gate=deferred(); let calls=0;
  const submit=createCounterOrderCommit({save:()=>{calls++;return calls===1?gate.promise:Promise.resolve(saved);},commit:()=>{}});
  const first=submit(draft);
  assert.equal((await submit(draft)).status,'busy');
  gate.reject(Error('offline'));
  await assert.rejects(first,/offline/);
  assert.equal((await submit(draft)).status, 'saved');
  assert.equal(calls,2);
});
test('local Store failure after remote success is not mistaken for failed POST', async () => {
  const submit=createCounterOrderCommit({save:async()=>saved,commit:()=>{throw Error('Store unavailable');}});
  const answer=await submit(draft);
  assert.equal(answer.status, 'saved');
  assert.equal(answer.uiUpdated,false);
  assert.equal(answer.order.id,saved.id);
});
test('rejects absent or malformed dependency functions', () => {
  for (const x of [null, {}, {save:()=>{}}, {commit:()=>{}}, {save:1,commit:()=>{}}]) {
    assert.throws(()=>createCounterOrderCommit(x),/POS_ORDER_INVALID_ADAPTERS/);
  }
});
test('does not mutate frozen confirmed order', async () => {
  const submit=createCounterOrderCommit({save:async()=>saved,commit:()=>{}});
  const output=await submit(draft);
  assert.equal(output.order,saved);
  assert.equal(saved.id,'server-order-001');
});

test('food POS page consumes authoritative single-flight submitter', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../frontend/src/pages/FastFoodPosPage.js', import.meta.url), 'utf8');
  assert.match(source, /createCounterOrderCommit\(\{/);
  assert.match(source, /save:\s*\(order\)\s*=>\s*SupabaseSyncService\.createFoodOrder\(order\)/);
  assert.match(source, /if\s*\(!result\.uiUpdated\)/);
  assert.match(source, /if\s*\(!completed\)\s*orderButton\.disabled\s*=\s*false/);
  assert.doesNotMatch(source, /source\s*:\s*['"]local['"]/);
  assert.doesNotMatch(source, /Pedido creado localmente/);
});

test('error path warns of uncertain server result, never navigates as confirmed', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../frontend/src/pages/FastFoodPosPage.js', import.meta.url), 'utf8');
  const orderStart = source.indexOf('const orderButton =');
  const orderEnd = source.indexOf("document.getElementById('btnSendOrderWhatsapp')", orderStart);
  assert.ok(orderStart > 0 && orderEnd > orderStart);
  const handler = source.slice(orderStart, orderEnd);
  assert.match(handler, /catch\s*\{[\s\S]*?Pedido no confirmado/);
  assert.equal((handler.match(/navigate\('pedidos'\)/g) || []).length, 1);
  assert.match(handler, /if\s*\(!result\.uiUpdated\)\s*\{[\s\S]*?return;[\s\S]*?navigate\('pedidos'\)/);
});
