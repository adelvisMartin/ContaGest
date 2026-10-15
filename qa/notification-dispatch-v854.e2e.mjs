import { test, expect } from '@playwright/test';

/**
 * #854 — opt-in API/browser-transport E2E against a disposable LOCAL backend.
 * No provider calls are made; the generic route must respond fail-closed.
 * Requires a synthetic tenant token with sales.manage.
 * Never run against production, staging or another person's data.
 */
function target() {
  if (process.env.CG_NOTIFICATION_E2E_ISOLATED !== 'true') {
    throw new Error('BLOCKED: CG_NOTIFICATION_E2E_ISOLATED=true is required');
  }
  const raw = process.env.CG_NOTIFICATION_E2E_URL;
  let url;
  try { url = new URL(raw); }
  catch { throw new Error('BLOCKED: explicit local API URL required'); }
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash) {
    throw new Error('BLOCKED: only loopback HTTP disposable API targets are permitted');
  }
  const token = process.env.CG_NOTIFICATION_E2E_TOKEN;
  if (typeof token !== 'string' || token.length < 16) {
    throw new Error('BLOCKED: synthetic tenant-scoped auth token required');
  }
  return { base: url.origin + url.pathname.replace(/\/$/, ''), token };
}

test('#854: a generic notification is not falsely queued without an outbox', async ({ request }) => {
  const { base, token } = target();
  const marker = 'PRIVATE_DO_NOT_ECHO_854';
  const destination = '+19990005444';
  const response = await request.post(`${base}/api/v1/notifications/send`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { to: destination, message: marker }
  });
  expect(response.status()).toBe(503);
  const body = await response.text();
  expect(body).not.toContain(marker);
  expect(body).not.toContain(destination);
  expect(body).not.toMatch(/"queued"\s*:\s*true/);
  expect(body).toMatch(/cola de notificaciones|NOTIFICATION.*UNAVAILABLE/i);
});

test('#854: safe template preview neither queues nor exposes unescaped HTML', async ({ request }) => {
  const { base, token } = target();
  const response = await request.post(base + '/api/v1/notifications/templates/preview', {
    headers: { Authorization: 'Bearer ' + token },
    data: {
      key: 'operational.notice',
      locale: 'es-VE',
      values: { title: '<img src=x>', detail: 'Turno registrado' },
      quietHours: {
        timeZone: 'America/Caracas',
        start: '22:00', end: '07:00', at: '2026-10-15T02:00:00Z'
      }
    }
  });
  expect(response.status()).toBe(200);
  const json = await response.json();
  expect(json.ok).toBe(true);
  expect(json.data.preview.subject).toContain('&lt;img');
  expect(json.data.preview.deliveryScheduled).toBe(false);
  expect(json.data.queued).toBe(false);
  expect(json.data.delivered).toBe(false);
  expect(json.data.quietHours.deferred).toBe(true);
  const rejected = await request.post(base + '/api/v1/notifications/templates/preview', {
    headers: { Authorization: 'Bearer ' + token },
    data: { key: 'operational.notice', values: { title: 'OK', detail: 'OK', tenantId: 'OTHER' } }
  });
  expect(rejected.status()).toBe(422);
});
