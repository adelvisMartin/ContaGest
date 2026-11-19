import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { apiGet, apiPost } from '../frontend/src/services/apiClient.js';

async function serve(handler) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

test('sensitive POST body is never forwarded after a 307 redirect', async (t) => {
  let leaked = '';
  let attackerRequests = 0;
  const attacker = await serve(async (req, res) => {
    attackerRequests++;
    for await (const chunk of req) leaked += chunk.toString();
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ok:true}));
  });
  t.after(() => attacker.server.close());
  const source = await serve((_req, res) => { res.writeHead(307, { Location: attacker.url + '/capture' }); res.end(); });
  t.after(() => source.server.close());
  const sensitive = {client:'Gym A',ledger:[{amount:'1000.00',account:'confidential'}]};
  await assert.rejects(apiPost(source.url, '/api/ledger', sensitive));
  assert.equal(attackerRequests, 0, `attacker received ${leaked}`);
});

test('successful same-origin get and post still return JSON', async t => {
  const server = await serve(async (req, res) => {
    res.setHeader('Content-Type','application/json');
    if (req.method === 'POST') {let body = ''; for await(const c of req) body += c; res.end(body);} else res.end(JSON.stringify({ok:true}));
  });
  t.after(() => server.server.close());
  assert.deepEqual(await apiGet(server.url, '/api/health'), {ok:true});
  assert.deepEqual(await apiPost(server.url, '/api/ledger', {amount:2}), {amount:2});
});


test('GET never follows a redirect into a second host', async t => {
  let unintendedRequests = 0;
  const destination = await serve((_req, res) => {
    unintendedRequests += 1;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ok:true}));
  });
  t.after(() => destination.server.close());
  const source = await serve((_req, res) => {
    res.writeHead(302, { Location: destination.url + '/private-lookup' });
    res.end();
  });
  t.after(() => source.server.close());
  await assert.rejects(apiGet(source.url, '/api/clients'));
  assert.equal(unintendedRequests, 0);
});
