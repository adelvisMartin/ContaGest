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
    globalThis.fetch = async (url, options) => {
      calls.push({ redirectAttempt:true, url, options });
      throw new TypeError('Blocked redirect');
    };
    await assert.rejects(BackendApi.get('/health'), (error) => error.status === 0);
    const safeReadAttempts = calls.filter((call) => call.redirectAttempt);
    assert.deepEqual(safeReadAttempts.map((call) => call.url), [
      'https://contagest.example/api/v1/health', '/api/v1/health'
    ], 'read-only fallback must remain on the same trusted origin');
    assert.ok(safeReadAttempts.every((call) => call.options.redirect === 'error'));

    // GET fallback resets the user-configured URL. Reapply the approved endpoint
    // to exercise the intended POST failure path rather than testing the reset default.
    BackendApi.setBaseUrl('https://contagest.example/api/v1');
    // A POST can have committed before the fetch fails: never replay it at the fallback.
    const countBeforePost = calls.length;
    await assert.rejects(BackendApi.post('/api/v1/session-test', {}), (error) => error.status === 0);
    assert.equal(calls.length, countBeforePost + 1);
    assert.equal(calls.at(-1).url, 'https://contagest.example/api/v1/session-test');

    BackendApi.setBaseUrl('https://contagest.example/api/v1');
    const countBeforeAbort = calls.length;
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      throw Object.assign(new Error('cancelled'), {name:'AbortError'});
    };
    await assert.rejects(BackendApi.get('/health'), (error) => error.status === 0);
    assert.equal(calls.length, countBeforeAbort + 1, 'cancelled reads must not retry');

    globalThis.window.Capacitor = { isNativePlatform:()=>true };
    // Native bridge may initialize after the JS module: an already imported API
    // must stop using relative WebView origins without requiring a reload.
    assert.equal(BackendApi.baseUrl, '', 'late native bridge must revoke relative API access');
    await assert.rejects(BackendApi.get('/health'), (error) => error.status === 503);
    assert.equal(calls.length, countBeforeAbort + 1, 'late native bridge must not send a request');
    entries.clear();
    const { BackendApi: NativeApi } = await import('../frontend/src/services/backendApi.js?security1364-native');
    assert.equal(NativeApi.baseUrl, '', 'Android release requires an explicitly configured HTTPS API');
    await assert.rejects(NativeApi.get('/health'), (error) => error.status === 503);
    assert.equal(calls.length, countBeforeAbort + 1, 'native misconfiguration must not issue a fetch');

    // The JS transport must refuse any production site accidentally served over cleartext HTTP.
    delete globalThis.window.Capacitor;
    globalThis.window.location = {
      origin:'http://contagest.example', hostname:'contagest.example', protocol:'http:'
    };
    const { BackendApi: InsecureWebApi } = await import('../frontend/src/services/backendApi.js?security1364-insecure');
    assert.equal(InsecureWebApi.baseUrl, '');
    await assert.rejects(InsecureWebApi.get('/health'), (error) => error.status === 503);
    assert.equal(calls.length, countBeforeAbort + 1, 'insecure production shell must not issue a fetch');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
