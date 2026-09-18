import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createHipicoSystemRouter } from './hipico-system.routes.js';

const disabledProvider = () => ({
  provider: 'disabled' as const,
  configured: false,
  enrichmentOnly: true as const,
  financialAuthority: false as const,
  reason: 'RACE_PROVIDER_DISABLED',
  timeoutMs: 5000,
  cacheTtlMs: 30000
});

async function startSystemApi(database: 'ok' | 'failed') {
  const app = express();
  app.use('/api/v1/hipico/system', createHipicoSystemRouter({
    source: {},
    readinessCheck: async () => ({ ready: database === 'ok', configuration: 'ok', database }),
    providerStatus: disabledProvider,
    now: () => new Date('2026-09-12T12:00:00.000Z')
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

void test('canonical system API exposes version/status and healthy readiness over HTTP', async (t) => {
  const runtime = await startSystemApi('ok');
  t.after(runtime.close);

  const versionResponse = await fetch(`${runtime.origin}/api/v1/hipico/system/version`);
  assert.equal(versionResponse.status, 200);
  const version = await versionResponse.json() as any;
  assert.equal(version.ok, true);
  assert.equal(typeof version.data.productVersion, 'string');
  assert.equal(typeof version.data.buildSha, 'string');
  assert.equal(version.data.apiVersion, '1');
  assert.equal(typeof version.data.bridgeProtocolVersion, 'string');

  const statusResponse = await fetch(`${runtime.origin}/api/v1/hipico/system/status`);
  assert.equal(statusResponse.status, 200);
  const status = await statusResponse.json() as any;
  assert.equal(status.ok, true);
  assert.equal(status.data.components.bridge.state, 'not_configured');
  assert.equal(status.data.components.documentEngine.state, 'degraded');\n  assert.equal(status.data.components.agent.state, 'degraded');

  const readinessResponse = await fetch(`${runtime.origin}/api/v1/hipico/system/readiness`);
  assert.equal(readinessResponse.status, 200);
  const readiness = await readinessResponse.json() as any;
  assert.equal(readiness.ok, true);
  assert.equal(readiness.data.ready, true);
});

void test('canonical readiness returns the stable error envelope when database is unavailable', async (t) => {
  const runtime = await startSystemApi('failed');
  t.after(runtime.close);

  const response = await fetch(`${runtime.origin}/api/v1/hipico/system/readiness`);
  assert.equal(response.status, 503);
  const body = await response.json() as any;
  assert.deepEqual(Object.keys(body).sort(), ['code', 'message', 'ok', 'requestId', 'retryable'].sort());
  assert.equal(body.ok, false);
  assert.equal(body.code, 'HIPICO_SYSTEM_NOT_READY');
  assert.equal(body.retryable, true);
});
