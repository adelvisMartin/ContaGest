import { test, expect } from '@playwright/test';

async function importOfflineService(page) {
  return page.evaluate(async () => {
    const service = await import('/src/services/pwaOfflineService.js');
    window.__pwaV563 = service;
    return true;
  });
}

async function waitForWorker(page) {
  await expect.poll(() => page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const registration = await navigator.serviceWorker.ready;
    return Boolean(registration.active);
  })).toBe(true);
}

test.describe('PWA offline #563', () => {
  test('install and service worker update/recovery keep one coherent shell', async ({ page }) => {
    await page.goto('/');
    await waitForWorker(page);
    const manifest = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifest).toBe('/manifest.webmanifest');
    const recovered = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const worker = registration.active;
      return new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => resolve(event.data);
        worker.postMessage({ type: 'RECOVER_CACHE' }, [channel.port2]);
      });
    });
    expect(recovered.recovered).toBe(true);
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL.includes('/sw.js'))).toBe(true);
  });

  test('offline and reconnect are visibly distinct from confirmed online data', async ({ page, context }) => {
    await page.goto('/');
    await waitForWorker(page);
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.locator('[data-cg-connectivity]')).toContainText('Sin conexión');
    await expect(page.locator('html')).toHaveAttribute('data-network-state', 'offline-stale');
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(page.locator('[data-cg-connectivity]')).toContainText('Reconectado');
    await expect(page.locator('html')).toHaveAttribute('data-network-state', 'revalidating');
  });

  test('logout purge removes tenant A cache/indexeddb and tenant switch uses a different scope', async ({ page }) => {
    await page.goto('/');
    await waitForWorker(page);
    await importOfflineService(page);
    const result = await page.evaluate(async () => {
      const service = window.__pwaV563;
      const tenantA = { tenantId:'tenant-a', user:{ id:'user-a' } };
      const tenantB = { tenantId:'tenant-b', user:{ id:'user-b' } };
      const scopeA = service.sessionScope(tenantA);
      const scopeB = service.sessionScope(tenantB);
      const cacheA = `contagest-ve-v563-session-${scopeA}`;
      const cache = await caches.open(cacheA);
      await cache.put('/tenant-a-private-marker', new Response('A'));
      await service.enqueueOfflineOperation({ session:tenantA, operation:'analytics.event', payload:{ events:[] }, idempotencyKey:'logout-a-563' });
      await service.setServiceWorkerSession(tenantA);
      await service.purgeOfflineSession(tenantA);
      const cachesAfterLogout = await caches.keys();
      await service.setServiceWorkerSession(tenantB);
      const dbNames = typeof indexedDB.databases === 'function' ? (await indexedDB.databases()).map((entry) => entry.name) : [];
      return { scopeA, scopeB, cachesAfterLogout, dbNames };
    });
    expect(result.scopeA).not.toBe(result.scopeB);
    expect(result.cachesAfterLogout.some((name) => name.includes(result.scopeA))).toBe(false);
    expect(result.dbNames.some((name) => String(name).includes(result.scopeA))).toBe(false);
  });

  test('outbox allowlist dedupes idempotency and refuses generic financial mutations', async ({ page }) => {
    await page.goto('/');
    await importOfflineService(page);
    const result = await page.evaluate(async () => {
      const service = window.__pwaV563;
      const session = { tenantId:'tenant-outbox', user:{ id:'user-outbox' } };
      const first = await service.enqueueOfflineOperation({ session, operation:'analytics.event', payload:{ events:[{ type:'offline-fixture' }] }, idempotencyKey:'analytics-563-key' });
      const retry = await service.enqueueOfflineOperation({ session, operation:'analytics.event', payload:{ events:[{ type:'offline-fixture' }] }, idempotencyKey:'analytics-563-key' });
      let financialCode = null;
      try { await service.enqueueOfflineOperation({ session, operation:'ledger.post', payload:{ amount:10 }, idempotencyKey:'ledger-563-key' }); }
      catch (error) { financialCode = error.code; }
      const delivered = [];
      const flushed = await service.flushOfflineOutbox(session, async (item) => { delivered.push(item); return { ok:true }; });
      await service.purgeOfflineSession(session);
      return { sameId:first.id===retry.id, financialCode, delivered:delivered.length, flushed:flushed.length };
    });
    expect(result.sameId).toBe(true);
    expect(result.financialCode).toBe('OFFLINE_OPERATION_NOT_ALLOWED');
    expect(result.delivered).toBe(1);
    expect(result.flushed).toBe(1);
  });
});
