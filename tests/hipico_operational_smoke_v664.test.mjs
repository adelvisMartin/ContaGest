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
    res.writeHead(options.httpCode || 200, { 'Content-Type': options.statusContentType ?? 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(options.body || status));
  } else if (req.url === '/hipico-control/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<title>Control Hípico</title><script src="./assets/js/app.js"></script>');
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
