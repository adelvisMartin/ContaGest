import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import test from 'node:test';
import { checkedBaseUrl, runHipicoSmoke } from '../scripts/hipico-operational-smoke-v664.mjs';

const status = { ok: true, service: 'hipico-control-operations', mode: 'offline_and_manual_ready', persistence: { ready: false }, linkedDeviceBridge: { ready: false, shadowOnly: true, sourceSendPossible: false } };
async function withServer(responder, run) {
  const server = createServer(responder);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { return await run('http://127.0.0.1:' + server.address().port + '/'); }
  finally { await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve())); }
}
const respond = (options = {}) => (req, res) => {
  if (req.url === '/api/hipico/status') {
    res.writeHead(options.httpCode || 200, { 'Content-Type': options.statusContentType ?? 'application/json', 'Cache-Control': options.statusCacheControl ?? 'no-store' });
    res.end(JSON.stringify(options.body || status));
  } else if (req.url === '/hipico-control/') {
    res.writeHead(200, { 'Content-Type': options.pwaContentType ?? 'text/html' });
    res.end(options.pwaHtml ?? '<title>Control Hípico</title><script type="module" src="./assets/js/app.js"></script>');
  } else { res.writeHead(404); res.end(); }
};

test('#664 Hípico operational status + PWA render smoke uses read-only GET', async () => {
  await withServer(respond(), async url => {
    const result = await runHipicoSmoke(url);
    assert.equal(result.status, 'PASS');
    assert.deepEqual(result.checks.map(x => x.status), ['PASS', 'PASS']);
  });
});
test('#664 unsafe URLs and embedded credentials fail closed', () => {
  for (const url of ['http://example.com/', 'https://user:pass@example.com/', 'https://example.com/?token=x', 'https://example.com/unsafe']) {
    assert.throws(() => checkedBaseUrl(url));
  }
});
test('#664 status contract rejects potentially enabled SOURCE sending', async () => {
  await withServer(respond({ body: { ...status, linkedDeviceBridge: { ...status.linkedDeviceBridge, sourceSendPossible: true } } }), async url => {
    assert.equal((await runHipicoSmoke(url)).status, 'FAIL');
  });
});
test('#664 HTTP failure is explicitly FAIL instead of success', async () => {
  await withServer(respond({ httpCode: 503 }), async url => {
    const result = await runHipicoSmoke(url);
    assert.equal(result.status, 'FAIL');
    assert.deepEqual(result.checks[0], { name: 'status', status: 'FAIL', code: 'HTTP_NOT_SUCCESS', httpStatus: 503 });
  });
});
test('#664 offline backend is BLOCKED, never reported as PASS', async () => {
  await withServer(respond(), async url => {
    const unreachable = async () => { throw new TypeError('fetch failed with secret token'); };
    const result = await runHipicoSmoke(url, unreachable);
    assert.equal(result.status, 'BLOCKED');
    assert.doesNotMatch(JSON.stringify(result), /secret token/);
  });
});

test('#664 status refuses spoofed JSON under HTML, JSONP or mixed MIME', async () => {
  for (const statusContentType of ['text/html', 'application/jsonp', 'application/json, text/html']) {
    await withServer(respond({ statusContentType }), async url => {
      const result = await runHipicoSmoke(url);
      assert.equal(result.status, 'FAIL', statusContentType);
      assert.deepEqual(result.checks[0], { name: 'status', status: 'FAIL', code: 'CONTRACT_MISMATCH' });
      assert.equal(result.checks[1].status, 'PASS');
    });
  }
});

test('#664 status accepts application/json with standard charset parameter', async () => {
  await withServer(respond({ statusContentType: 'application/json; charset=utf-8' }), async url => {
    const result = await runHipicoSmoke(url);
    assert.equal(result.status, 'PASS');
  });
});

test('#664 invalid MIME short-circuits status JSON parsing before touching untrusted body', async () => {
  for (const mediaType of ['text/html', 'application/jsonp', 'application/json, text/html', 'application/problem+json']) {
    let parsed = 0;
    const request = async url => url.pathname === '/api/hipico/status' ? {
      ok: true, status: 200,
      headers: new Headers({ 'content-type': mediaType, 'cache-control': 'no-store' }),
      json: async () => { parsed++; throw new Error('MIME must be checked before body parsing'); }
    } : {
      ok: true, status: 200,
      headers: new Headers({ 'content-type': 'text/html' }),
      text: async () => '<title>Control Hípico</title><script type="module" src="./assets/js/app.js"></script>'
    };
    const result = await runHipicoSmoke('http://127.0.0.1:8080/', request);
    assert.deepEqual(result.checks[0], { name: 'status', status: 'FAIL', code: 'CONTRACT_MISMATCH' });
    assert.equal(result.checks[1].status, 'PASS');
    assert.equal(parsed, 0, 'invalid content-type may not invoke response.json()');
  }
});

test('#664 PWA smoke refuses spoofed HTML MIME before reading the body', async () => {
  for (const pwaContentType of ['application/json; note=text/html', 'text/html, application/json', 'text/htmlp']) {
    await withServer(respond({ pwaContentType }), async url => {
      const result = await runHipicoSmoke(url);
      assert.equal(result.status, 'FAIL');
      assert.deepEqual(result.checks[1], { name: 'pwa', status: 'FAIL', code: 'CONTRACT_MISMATCH' });
      assert.equal(result.checks[0].status, 'PASS');
    });
  }
  await withServer(respond({ pwaContentType: 'Text/HTML; charset=utf-8' }), async url => {
    assert.equal((await runHipicoSmoke(url)).status, 'PASS');
  });
  let htmlReads = 0;
  const request = async url => url.pathname === '/api/hipico/status' ? {
    ok: true, headers: new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store' }),
    json: async () => status
  } : {
    ok: true, headers: new Headers({ 'content-type': 'application/json; note=text/html' }),
    text: async () => { htmlReads++; throw new Error('HTML should not be read with JSON MIME'); }
  };
  const result = await runHipicoSmoke('http://127.0.0.1:8080/', request);
  assert.deepEqual(result.checks[1], { name: 'pwa', status: 'FAIL', code: 'CONTRACT_MISMATCH' });
  assert.equal(htmlReads, 0);
});

test('#664 status cache policy requires an exact no-store directive, not a substring', async () => {
  for (const statusCacheControl of ['no-store=false', 'x-no-store', 'public, no-storex', 'private', 'no-cache, must-revalidate']) {
    await withServer(respond({ statusCacheControl }), async url => {
      const result = await runHipicoSmoke(url);
      assert.equal(result.status, 'FAIL', statusCacheControl);
      assert.deepEqual(result.checks[0], { name: 'status', status: 'FAIL', code: 'CONTRACT_MISMATCH' });
      assert.equal(result.checks[1].status, 'PASS');
    });
  }
  for (const statusCacheControl of ['no-store', 'private, no-store', 'No-Store, no-cache', 'private,  NO-STORE  ']) {
    await withServer(respond({ statusCacheControl }), async url => {
      assert.equal((await runHipicoSmoke(url)).status, 'PASS', statusCacheControl);
    });
  }
});

test('#664 invalid cache directive short-circuits body parsing before touching JSON', async () => {
  let reads = 0;
  const request = async url => url.pathname === '/api/hipico/status' ? {
    ok: true,
    headers: new Headers({ 'content-type': 'application/json', 'cache-control': 'x-no-store' }),
    json: async () => { reads++; throw Error('INVALID_CACHE_POLICY_MUST_NOT_PARSE'); }
  } : {
    ok: true,
    headers: new Headers({ 'content-type': 'text/html' }),
    text: async () => '<title>Control Hípico</title><script type="module" src="./assets/js/app.js"></script>'
  };
  const result = await runHipicoSmoke('http://127.0.0.1:8080/', request);
  assert.equal(result.status, 'FAIL');
  assert.deepEqual(result.checks[0], { name: 'status', status: 'FAIL', code: 'CONTRACT_MISMATCH' });
  assert.equal(reads, 0);
});


test('#664 PWA status cannot pass with text, commented scripts, or non-module assets', async () => {
  const invalid = [
    'Control Hípico assets/js/app.js',
    '<!-- <title>Control Hípico</title><script type="module" src="./assets/js/app.js"></script> -->',
    '<title>Control Hípico</title><p>assets/js/app.js</p>',
    '<title>Control Hípico</title><script data-src="./assets/js/app.js" type="module"></script>',
    '<title>Control Hípico</title><script src="./assets/js/app.js"></script>'
  ];
  for (const pwaHtml of invalid) {
    await withServer(respond({ pwaHtml }), async url => {
      const result = await runHipicoSmoke(url);
      assert.equal(result.status, 'FAIL', pwaHtml);
      assert.equal(result.checks[0].status, 'PASS');
      assert.deepEqual(result.checks[1], { name: 'pwa', status: 'FAIL', code: 'CONTRACT_MISMATCH' });
    });
  }
});

test('#664 PWA smoke accepts a genuine app module script in either attribute order', async () => {
  for (const pwaHtml of [
    '<title>Control Hípico</title><script type="module" src="./assets/js/app.js"></script>',
    '<title>Control Hípico</title><script src="./assets/js/app.js" type="module"></script>'
  ]) {
    await withServer(respond({ pwaHtml }), async url => {
      assert.equal((await runHipicoSmoke(url)).status, 'PASS');
    });
  }
});
