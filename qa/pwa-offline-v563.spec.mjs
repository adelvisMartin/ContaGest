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
    await expect(page.locator('script[src*="pwa-install.js"]')).toHaveCount(1);
    const ownRegistrations = await page.evaluate(async () => {
      const items = await navigator.serviceWorker.getRegistrations();
      return items.filter((item) => item.scope === new URL('/', location.href).href).length;
    });
    expect(ownRegistrations).toBe(1);
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

  test('logout and tenant switch purge only the selected session, including the current worker revision', async ({ page }) => {
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
      const cacheCurrentA = `contagest-ve-v563-3-session-${scopeA}`;
      const cacheB = `contagest-ve-v563-3-session-${scopeB}`;
      const prefixNeighbor = `${cacheA}neighbor`;
      const foreignDb = `contagest-offline-v563-${scopeA}neighbor`;
      const hipicoSessionKey = 'hipico_synthetic_other_product_session';
      try {
        sessionStorage.setItem(hipicoSessionKey, 'independent-product');
        for (const name of [cacheA, cacheCurrentA, cacheB, prefixNeighbor]) {
          const cache = await caches.open(name);
          await cache.put('/synthetic-private-marker', new Response('synthetic'));
        }
        await new Promise((resolve, reject) => {
          const request = indexedDB.open(foreignDb, 1);
          request.onsuccess = () => { request.result.close(); resolve(); };
          request.onerror = () => reject(request.error);
        });
        await service.enqueueOfflineOperation({ session:tenantA, operation:'analytics.event',
          payload:{ events:[] }, idempotencyKey:'logout-a-563' });
        await service.enqueueOfflineOperation({ session:tenantB, operation:'analytics.event',
          payload:{ events:[] }, idempotencyKey:'logout-b-563' });
        await service.setServiceWorkerSession(tenantA);
        await service.purgeOfflineSession(tenantA);
        const names = await caches.keys();
        const dbNames = typeof indexedDB.databases === 'function'
          ? (await indexedDB.databases()).map((entry) => entry.name) : [];
        await service.setServiceWorkerSession(tenantB);
        return {
          scopeA, scopeB,
          oldADeleted: !names.includes(cacheA),
          currentADeleted: !names.includes(cacheCurrentA),
          bPreserved: names.includes(cacheB),
          prefixNeighborPreserved: names.includes(prefixNeighbor),
          dbADeleted: !dbNames.includes(`contagest-offline-v563-${scopeA}`),
          dbBPreserved: dbNames.includes(`contagest-offline-v563-${scopeB}`),
          dbPrefixNeighborPreserved: dbNames.includes(foreignDb),
          hipicoSessionPreserved: sessionStorage.getItem(hipicoSessionKey) === 'independent-product'
        };
      } finally {
        sessionStorage.removeItem(hipicoSessionKey);
        await service.purgeOfflineSession(tenantA);
        await service.purgeOfflineSession(tenantB);
        await caches.delete(prefixNeighbor);
        await new Promise((resolve, reject) => {
          const request = indexedDB.deleteDatabase(foreignDb);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
          request.onblocked = () => reject(new Error('Synthetic neighbor DB remained locked'));
        });
      }
    });
    expect(result.scopeA).not.toBe(result.scopeB);
    expect(result.oldADeleted).toBe(true);
    expect(result.currentADeleted).toBe(true);
    expect(result.bPreserved).toBe(true);
    expect(result.prefixNeighborPreserved).toBe(true);
    expect(result.dbADeleted).toBe(true);
    expect(result.dbBPreserved).toBe(true);
    expect(result.dbPrefixNeighborPreserved).toBe(true);
    expect(result.hipicoSessionPreserved).toBe(true);
  });

  test('blocked IndexedDB deletion reports incomplete offline logout and cleans up the fixture', async ({ page }) => {
    await page.goto('/');
    await importOfflineService(page);
    const result = await page.evaluate(async () => {
      const service = window.__pwaV563;
      const session = { tenantId: 'tenant-idb-block', user: { id: 'user-idb-block' } };
      const databaseName = `contagest-offline-v563-${service.sessionScope(session)}`;
      const connection = await new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName, 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      let failureCode = null;
      try {
        // Keep the connection open when deleteDatabase issues versionchange.
        // IndexedDB must report blocked, not a successful privacy purge.
        try { await service.purgeOfflineSession(session); }
        catch (error) { failureCode = error.code; }
      } finally {
        connection.close();
        // The first pending deletion may complete after the connection closes;
        // this second delete waits for it and guarantees fixture cleanup.
        await new Promise((resolve, reject) => {
          const request = indexedDB.deleteDatabase(databaseName);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
          request.onblocked = () => reject(new Error('Synthetic IDB cleanup is blocked'));
        });
      }
      return { failureCode };
    });
    expect(result.failureCode).toBe('OFFLINE_SESSION_PURGE_FAILED');
  });

  test('outbox allowlist dedupes idempotency and refuses generic financial mutations', async ({ page }) => {
    await page.goto('/');
    await importOfflineService(page);
    const result = await page.evaluate(async () => {
      const service = window.__pwaV563;
      const session = { tenantId:'tenant-outbox', user:{ id:'user-outbox' } };
      const first = await service.enqueueOfflineOperation({ session, operation:'analytics.event', payload:{ events:[{ type:'offline-fixture' }] }, idempotencyKey:'analytics-563-key' });
      const retry = await service.enqueueOfflineOperation({ session, operation:'analytics.event', payload:{ events:[{ type:'offline-fixture' }] }, idempotencyKey:'analytics-563-key' });
      let conflictCode = null;
      try {
        await service.enqueueOfflineOperation({
          session, operation:'analytics.event',
          payload:{ events:[{ type:'different-event-must-not-replace' }] },
          idempotencyKey:'analytics-563-key'
        });
      } catch (error) { conflictCode = error.code; }
      let financialCode = null;
      try { await service.enqueueOfflineOperation({ session, operation:'ledger.post', payload:{ amount:10 }, idempotencyKey:'ledger-563-key' }); }
      catch (error) { financialCode = error.code; }
      const delivered = [];
      const flushed = await service.flushOfflineOutbox(session, async (item) => { delivered.push(item); return { ok:true }; });
      await service.purgeOfflineSession(session);
      return {
        sameId:first.id===retry.id, conflictCode, financialCode,
        delivered:delivered.length, flushed:flushed.length,
        deliveredEvent:delivered[0]?.payload?.events?.[0]?.type
      };
    });
    expect(result.sameId).toBe(true);
    expect(result.conflictCode).toBe('OFFLINE_IDEMPOTENCY_CONFLICT');
    expect(result.deliveredEvent).toBe('offline-fixture');
    expect(result.financialCode).toBe('OFFLINE_OPERATION_NOT_ALLOWED');
    expect(result.delivered).toBe(1);
    expect(result.flushed).toBe(1);
  });
});
