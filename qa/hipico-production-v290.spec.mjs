import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildHipicoQaFixture } from './support/hipico-visual-catalog-v105.mjs';
import { detectHipicoLayoutIssues } from './support/hipico-layout-detector-v105.mjs';

const SHA = String(process.env.HIPICO_QA_SHA || process.env.GITHUB_SHA || 'local').trim();
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'qa', 'hipico-v290', SHA);

async function resetStorage(page) {
  await page.goto('/hipico-control/recovery.html');
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('hipico-control');
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
    localStorage.clear();
  });
}

async function seedWorkspace(page) {
  await resetStorage(page);
  const fixture = buildHipicoQaFixture('normal');
  await page.evaluate(async (payload) => {
    const seed = await import('/hipico-control/assets/js/seed.js');
    const store = await import('/hipico-control/assets/js/store.js');
    const workspaceModule = await import('/hipico-control/assets/js/workspace.js');
    const workspace = seed.createBlankWorkspace();
    workspace.config = { ...workspace.config, ...(payload.config || {}) };
    for (const key of ['participants', 'days', 'races', 'advancedBets', 'movements', 'exchangeRates', 'weekClosures', 'pollas', 'audit', 'syncQueue']) {
      if (Array.isArray(payload[key])) workspace[key] = structuredClone(payload[key]);
    }
    if (payload.syncMeta) workspace.syncMeta = structuredClone(payload.syncMeta);
    await store.initializeStorage(seed.createBlankWorkspace);
    await store.setAppMode('local');
    await store.saveLocalWorkspace(workspaceModule.normalizeWorkspaceShape(workspace), { snapshot: false });
  }, fixture);
}

async function openDashboard(page) {
  await page.addInitScript(() => {
    globalThis.__hipicoLongTasks = [];
    if (globalThis.PerformanceObserver?.supportedEntryTypes?.includes('longtask')) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) globalThis.__hipicoLongTasks.push({ startTime: entry.startTime, duration: entry.duration });
      });
      observer.observe({ type: 'longtask', buffered: true });
      globalThis.__hipicoLongTaskObserver = observer;
    }
  });
  await seedWorkspace(page);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/hipico-control/?view=dashboard');
  await expect(page.locator('#app')).not.toHaveClass(/app-loading/);
  await expect(page.locator('.shell')).toBeVisible();
  return errors;
}

async function contrastFailures(page) {
  return page.evaluate(() => {
    const parse = (value) => {
      const match = String(value).match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)(?:[, /]+([\d.]+))?\)/i);
      return match ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4] == null ? 1 : Number(match[4])] : null;
    };
    const luminance = ([r, g, b]) => {
      const values = [r, g, b].map((channel) => { const c = channel / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    };
    const background = (element) => {
      let current = element;
      while (current) {
        const color = parse(getComputedStyle(current).backgroundColor);
        if (color && color[3] > 0.95) return color;
        current = current.parentElement;
      }
      return [255, 255, 255, 1];
    };
    const failures = [];
    const selector = 'h1,h2,h3,label,.button,.nav-button,.mobile-nav button,.badge,.kpi strong';
    for (const element of document.querySelectorAll(selector)) {
      const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
      if (!rect.width || !rect.height || style.visibility === 'hidden' || style.display === 'none' || element.matches(':disabled,[aria-disabled="true"]')) continue;
      const fg = parse(style.color); const bg = background(element);
      if (!fg || fg[3] < 0.95) continue;
      const l1 = luminance(fg); const l2 = luminance(bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const px = Number.parseFloat(style.fontSize) || 14; const weight = Number.parseInt(style.fontWeight, 10) || 400;
      const large = px >= 24 || (px >= 18.66 && weight >= 700); const required = large ? 3 : 4.5;
      if (ratio + 0.01 < required) failures.push({ tag: element.tagName, className: element.className, text: element.textContent?.trim().slice(0, 80), ratio: Number(ratio.toFixed(2)), required });
    }
    return failures;
  });
}

async function indexedDbProfile(page, volume) {
  return page.evaluate(async (count) => {
    const databaseName = `hipico-perf-v290-${count}-${crypto.randomUUID()}`;
    const request = indexedDB.open(databaseName, 1);
    const db = await new Promise((resolve, reject) => {
      request.onupgradeneeded = () => request.result.createObjectStore('items', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transactionDone = (transaction) => new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('IDB_ABORT'));
    });
    const startWrite = performance.now();
    const write = db.transaction('items', 'readwrite');
    const store = write.objectStore('items');
    for (let index = 1; index <= count; index += 1) store.put({ id: index, text: `event-${index}-${'x'.repeat(128)}`, amount: index * 10 });
    await transactionDone(write);
    const writeMs = performance.now() - startWrite;

    const startRead = performance.now();
    const read = db.transaction('items', 'readonly');
    const reader = read.objectStore('items');
    const requests = [];
    for (let index = Math.max(1, count - 49); index <= count; index += 1) {
      requests.push(new Promise((resolve, reject) => {
        const item = reader.get(index);
        item.onsuccess = () => resolve(item.result);
        item.onerror = () => reject(item.error);
      }));
    }
    const recent = await Promise.all(requests);
    await transactionDone(read);
    const read50Ms = performance.now() - startRead;
    db.close();
    await new Promise((resolve) => {
      const deletion = indexedDB.deleteDatabase(databaseName);
      deletion.onsuccess = deletion.onerror = deletion.onblocked = () => resolve();
    });
    return { volume: count, writeMs, read50Ms, recordsRead: recent.filter(Boolean).length };
  }, volume);
}

for (const width of [360, 390, 430]) {
  test(`mobile ${width}px: responsive focus target-size and contrast release gate`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors = await openDashboard(page);
    expect(errors).toEqual([]);
    const issues = await page.evaluate(detectHipicoLayoutIssues, { touch: true });
    expect(issues, JSON.stringify(issues, null, 2)).toEqual([]);
    expect(await contrastFailures(page), 'WCAG text/control contrast failures').toEqual([]);
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => ({ body: document.activeElement === document.body, visible: Boolean(document.activeElement && document.activeElement.getBoundingClientRect().width) }));
    expect(focus.body).toBe(false);
    expect(focus.visible).toBe(true);
    mkdirSync(ARTIFACT_ROOT, { recursive: true });
    await page.screenshot({ path: join(ARTIFACT_ROOT, `dashboard-${width}-${test.info().project.name}.png`), fullPage: true });
  });
}

test('landscape and reduced visual viewport remain scrollable without global clipping', async ({ page }) => {
  for (const viewport of [{ width: 844, height: 390, label: 'landscape' }, { width: 390, height: 500, label: 'keyboard-like' }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const errors = await openDashboard(page);
    expect(errors).toEqual([]);
    const geometry = await page.evaluate(() => ({
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
      overflowY: getComputedStyle(document.documentElement).overflowY
    }));
    expect(geometry.horizontalOverflow, `${viewport.label}: horizontal overflow`).toBeLessThanOrEqual(1);
    expect(geometry.scrollHeight, `${viewport.label}: page should remain vertically navigable`).toBeGreaterThan(geometry.clientHeight);
    expect(geometry.overflowY).not.toBe('hidden');
  }
});

test('keyboard opens and closes a real dialog and restores focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDashboard(page);
  const trigger = page.getByRole('button', { name: /Nueva carrera/i }).first();
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: /Nueva carrera/i })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('prefers-reduced-motion removes operational animation/transition duration', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDashboard(page);
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  const violations = await page.evaluate(() => {
    const toMs = (value) => Math.max(...String(value).split(',').map((part) => part.trim().endsWith('ms') ? Number.parseFloat(part) : Number.parseFloat(part) * 1000));
    const rows = [];
    for (const element of document.querySelectorAll('button,.button,.toast,.modal,.card')) {
      const style = getComputedStyle(element);
      if (toMs(style.animationDuration) > 1 || toMs(style.transitionDuration) > 1) rows.push({ className: element.className, animation: style.animationDuration, transition: style.transitionDuration });
    }
    return rows;
  });
  expect(violations).toEqual([]);
});

test('installed PWA shell survives offline reload and exposes stale/offline trust state', async ({ page, context }) => {
  await openDashboard(page);
  await page.evaluate(async () => { if ('serviceWorker' in navigator) await navigator.serviceWorker.ready; });
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.shell')).toBeVisible();
  await expect(page.locator('#hipico-sync-trust-banner')).toBeVisible();
  await expect(page.locator('#hipico-sync-trust-banner')).toContainText(/Sin conexión|No se pudo verificar/i);
  await context.setOffline(false);
});

test('runtime metadata mismatch recovers cleanly and DOM mutations cannot resurrect the banner', async ({ page }) => {
  let serveStaleMetadata = true;
  await page.route('**/hipico-control/build-info.json*', async (route) => {
    if (serveStaleMetadata) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: '0.0.0-stale', channel: 'pilot' }) });
      return;
    }
    await route.continue();
  });

  await openDashboard(page);
  const banner = page.locator('#hipico-version-mismatch');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(/Actualización requerida/i);
  await expect(page.locator('html')).toHaveAttribute('data-hipico-version-mismatch', 'true');

  serveStaleMetadata = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(banner).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-hipico-version-mismatch', /.+/);

  await page.evaluate(() => {
    const mutation = document.createElement('div');
    mutation.id = 'hipico-version-recovery-dom-mutation';
    mutation.textContent = 'post-recovery mutation';
    document.querySelector('#app')?.append(mutation);
  });
  await expect(page.locator('#hipico-version-recovery-dom-mutation')).toBeVisible();
  await expect(page.locator('#hipico-version-mismatch')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-hipico-version-mismatch', /.+/);
});

test('browser performance records boot interaction render long tasks memory and IndexedDB 100 500 2000', async ({ page }) => {
  const errors = await openDashboard(page);
  expect(errors).toEqual([]);

  await page.evaluate(() => { globalThis.__hipicoInteractionStartedAt = performance.now(); });
  await page.locator('button[data-view="race"]').first().click();
  await expect(page.locator('#app')).toContainText(/Carrera/i);
  const interactionRenderMs = await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - globalThis.__hipicoInteractionStartedAt)));
  }));

  const indexedDb = [];
  for (const volume of [100, 500, 2000]) indexedDb.push(await indexedDbProfile(page, volume));

  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const paint = performance.getEntriesByType('paint').map((entry) => ({ name: entry.name, startTime: entry.startTime }));
    const longTasks = Array.isArray(globalThis.__hipicoLongTasks) ? globalThis.__hipicoLongTasks : [];
    const memory = performance.memory ? {
      usedJSHeapSize: performance.memory.usedJSHeapSize,
      totalJSHeapSize: performance.memory.totalJSHeapSize,
      jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
    } : null;
    return {
      url: location.pathname,
      navigation: nav ? {
        domContentLoadedMs: nav.domContentLoadedEventEnd,
        loadMs: nav.loadEventEnd,
        transferSize: nav.transferSize,
        encodedBodySize: nav.encodedBodySize,
        decodedBodySize: nav.decodedBodySize
      } : null,
      paint,
      longTasks: { supported: Boolean(globalThis.PerformanceObserver?.supportedEntryTypes?.includes('longtask')), count: longTasks.length, totalDurationMs: longTasks.reduce((sum, item) => sum + item.duration, 0), entries: longTasks.slice(0, 100) },
      memory,
      domNodes: document.getElementsByTagName('*').length,
      measuredAt: new Date().toISOString()
    };
  });
  expect(metrics.navigation).not.toBeNull();
  expect(metrics.navigation.domContentLoadedMs).toBeGreaterThan(0);
  expect(Number(interactionRenderMs)).toBeGreaterThanOrEqual(0);
  expect(indexedDb.map((item) => item.recordsRead)).toEqual([50, 50, 50]);
  mkdirSync(ARTIFACT_ROOT, { recursive: true });
  writeFileSync(join(ARTIFACT_ROOT, `browser-performance-${test.info().project.name}.json`), `${JSON.stringify({
    schema: 'hipico-browser-performance.v290',
    sha: SHA,
    project: test.info().project.name,
    hostContext: 'CI browser measurement; physical i5 6th gen / 16 GB target remains separate hardware evidence when available.',
    interactionRenderMs: Number(Number(interactionRenderMs).toFixed(3)),
    indexedDb: indexedDb.map((item) => ({ ...item, writeMs: Number(item.writeMs.toFixed(3)), read50Ms: Number(item.read50Ms.toFixed(3)) })),
    ...metrics
  }, null, 2)}\n`, 'utf8');
});
