import test from 'node:test';
import assert from 'node:assert/strict';

let importIndex = 0;

async function withBrowserTransport(fetchImpl, exercise) {
  const saved = { window: globalThis.window, localStorage: globalThis.localStorage, fetch: globalThis.fetch };
  const entries = new Map();
  const calls = [];
  try {
    globalThis.window = {
      location: { origin:'https://contagest.example', hostname:'contagest.example', protocol:'https:' },
      dispatchEvent() {}
    };
    globalThis.localStorage = {
      getItem(key) { return entries.get(key) ?? null; },
      setItem(key, value) { entries.set(key, String(value)); },
      removeItem(key) { entries.delete(key); }
    };
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return fetchImpl(url, options, calls.length);
    };
    const { BackendApi } = await import(`../frontend/src/services/backendApi.js?security1364-abort-${++importIndex}`);
    await exercise(BackendApi, calls);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
}

test('cancelled fiscal POST with generated idempotency key makes only one request', async () => {
  await withBrowserTransport(async () => {
    throw Object.assign(new Error('cancelled'), { name:'AbortError' });
  }, async (api, calls) => {
    await assert.rejects(api.post('/fiscal/close-period', { period:'2026-10' }), (error) =>
      error.status === 0 && error.payload?.cancelled === true);
    assert.equal(calls.length, 1);
    assert.match(calls[0].options.headers['Idempotency-Key'], /^cg-/);
  });
});

test('aborted signal never retries even if fetch surfaces a TypeError', async () => {
  const controller = new AbortController();
  controller.abort();
  await withBrowserTransport(async () => { throw new TypeError('fetch failed'); }, async (api, calls) => {
    await assert.rejects(api.request('/accounting/entries', {
      method:'POST', body:{ memo:'test' }, signal:controller.signal,
      headers:{ 'Idempotency-Key':'explicit-test-key' }
    }), (error) => error.status === 0 && error.payload?.cancelled === true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.signal, controller.signal);
    assert.equal(calls[0].options.headers['Idempotency-Key'], 'explicit-test-key');
  });
});

test('genuine transient network failures still reuse the same financial idempotency key', async () => {
  await withBrowserTransport(async (_url, _options, attempt) => {
    if (attempt === 1) throw new TypeError('network temporarily unavailable');
    return {
      ok:true, status:201,
      headers:{ get:(name)=>name==='content-type'?'application/json':null },
      json:async()=>({ok:true,data:{id:'safe-entry'}})
    };
  }, async (api, calls) => {
    assert.deepEqual(await api.post('/accounting/entries', { memo:'test' }), {id:'safe-entry'});
    assert.equal(calls.length, 2, 'only known idempotent routes may retry transient errors');
    assert.equal(calls[0].url, calls[1].url);
    assert.equal(calls[0].options.headers['Idempotency-Key'], calls[1].options.headers['Idempotency-Key']);
    assert.equal(calls[0].options.credentials, 'include');
    assert.equal(calls[1].options.redirect, 'error');
  });
});
