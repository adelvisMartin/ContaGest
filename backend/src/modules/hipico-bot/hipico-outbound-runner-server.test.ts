import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const server=readFileSync(new URL('../../server.ts',import.meta.url),'utf8');
const envExample=readFileSync(new URL('../../../.env.example',import.meta.url),'utf8');

test('server boots canonical outbox runner through explicit fail-closed switch',()=>{
  assert.match(server,/startCanonicalOutboundRunner/);
  assert.match(server,/const stopHipicoOutboxRunner\s*=\s*startCanonicalOutboundRunner/);
});

test('outbox worker deployment controls are documented disabled-by-default',()=>{
  assert.match(envExample,/HIPICO_OUTBOX_WORKER_ENABLED=false/);
  assert.match(envExample,/HIPICO_OUTBOX_WORKER_INTERVAL_MS=5000/);
  assert.match(envExample,/HIPICO_OUTBOX_WORKER_MAX_PER_CYCLE=10/);
});
