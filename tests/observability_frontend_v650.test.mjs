import assert from 'node:assert/strict';
import test from 'node:test';
import { apiGet } from '../frontend/src/services/apiClient.js';

test('#650 frontend exposes a safe correlation reference without internal cause leakage', async (t) => {
  const previousFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = previousFetch; });

  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: false,
    code: 'DEPENDENCY_UNAVAILABLE',
    message: 'Servicio temporalmente no disponible.',
    correlationId: 'corr-650-frontend-safe',
    requestId: 'request-650-frontend-safe',
    internalCause: 'postgresql://runtime:super-secret@db.example.test/postgres'
  }), {
    status: 503,
    headers: {
      'content-type': 'application/json',
      'x-correlation-id': 'corr-650-frontend-safe'
    }
  });

  await assert.rejects(
    () => apiGet('https://example.test', '/api/v1/reports'),
    (error) => {
      assert.equal(error.status, 503);
      assert.equal(error.code, 'DEPENDENCY_UNAVAILABLE');
      assert.equal(error.correlationId, 'corr-650-frontend-safe');
      assert.equal(error.requestId, 'request-650-frontend-safe');
      assert.match(error.message, /Referencia: corr-650-frontend-safe/);
      assert.doesNotMatch(error.message, /super-secret|postgresql:\/\//);
      assert.equal(error.payload, undefined, 'raw server payload must not be retained on the thrown error');
      return true;
    }
  );
});
