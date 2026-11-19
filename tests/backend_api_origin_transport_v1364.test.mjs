import test from 'node:test';
import assert from 'node:assert/strict';

test('BackendApi keeps credentialed requests on approved origins and blocks redirects', async () => {
  const previous = { window: globalThis.window, localStorage: globalThis.localStorage, fetch: globalThis.fetch };
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
      calls.push({url, options});
      return {
        ok:true, status:200,
        headers:{ get:()=> 'application/json' },
        json:async()=>({ok:true,data:{pong:true}})
      };
    };
    const { BackendApi } = await import('../frontend/src/services/backendApi.js?security1364-web');

    entries.set('contagest_api_base_url', 'https://attacker.example/api/v1');
    assert.deepEqual(await BackendApi.get('/health'), {pong:true});
    assert.equal(calls[0].url, '/api/v1/health');
    assert.equal(calls[0].options.credentials, 'include');
    assert.equal(calls[0].options.redirect, 'error');
    assert.equal(entries.has('contagest_api_base_url'), false);

    BackendApi.setBaseUrl('https://contagest.example/api/v1');
    await BackendApi.get('/health');
    assert.equal(calls[1].url, 'https://contagest.example/api/v1/health');

    BackendApi.setBaseUrl('http://attacker.example/api/v1');
    await BackendApi.get('/health');
    assert.equal(calls[2].url, '/api/v1/health');

    BackendApi.setBaseUrl('https://contagest.example/api/v1');
    globalThis.fetch = async () => { calls.push({redirectAttempt:true}); throw new TypeError('Blocked redirect'); };
    await assert.rejects(BackendApi.get('/health'), (error) => error.status === 0);
    assert.equal(calls.filter((call) => call.redirectAttempt).length, 1, 'no credentialed follow-up to redirected destination');

    globalThis.window.Capacitor = { isNativePlatform:()=>true };
    entries.clear();
    const { BackendApi: NativeApi } = await import('../frontend/src/services/backendApi.js?security1364-native');
    assert.equal(NativeApi.baseUrl, '', 'Android release requires an explicitly configured HTTPS API');
    await assert.rejects(NativeApi.get('/health'), (error) => error.status === 503);
    assert.equal(calls.filter((call) => call.redirectAttempt).length, 1, 'native misconfiguration must not issue a fetch');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
