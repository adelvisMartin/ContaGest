import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildHipicoQaFixture } from './support/hipico-visual-catalog-v105.mjs';
import { detectHipicoLayoutIssues } from './support/hipico-layout-detector-v105.mjs';

function candidateSha() {
  const explicit = String(process.env.HIPICO_QA_SHA || process.env.HIPICO_CANDIDATE_SHA || process.env.GITHUB_SHA || '').trim();
  if (/^[0-9a-f]{40}$/i.test(explicit)) return explicit.toLowerCase();
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim().toLowerCase(); }
  catch { return 'unknown-sha'; }
}

const SHA = candidateSha();
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

async function seedWorkspace(page, state = 'normal') {
  await resetStorage(page);
  const fixture = buildHipicoQaFixture(state);
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

async function openDashboard(page, { remote = null, state = 'normal' } = {}) {
  if (remote) {
    await page.route('**/api/hipico/command-center', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: remote }) });
    });
  }
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
  await seedWorkspace(page, state);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/hipico-control/?view=dashboard');
  await expect(page.locator('#app')).not.toHaveClass(/app-loading/);
  await expect(page.locator('.shell')).toBeVisible();
  await expect(page.locator('[data-command-center]')).toBeVisible();
  return errors;
}

function remoteFixture() {
  return {
    sampledAt: '2026-09-12T15:00:00.000Z',
    system: { state: 'ready', backendReachable: true },
    bridge: { state: 'ready', ready: true, identityReady: true, persistenceReady: true },
    channel: { state: 'known', groupAutomation: 'bridge-required', qaMode: 'shadow-only', targetSupport: ['individual'] },
    database: { state: 'ready', ready: true },
    providers: { state: 'disabled', provider: 'disabled', configured: false, financialAuthority: false, circuitState: 'closed' },
    agent: { state: 'known', mode: 'shadow', shadowOnly: true, evaluations: { available: true, pending: 1, matched: 2, total: 3 } },
    documents: { state: 'not_exposed', reason: 'DOCUMENT_CAPABILITY_NOT_EXPOSED_BY_CURRENT_BACKEND' },
    queue: { available: true, total: 2, pendingApproval: 1, queued: 1, sending: 0, failed: 0 },
    conflicts: { reconciliationRequired: 1 },
    alerts: ['OUTBOX_RECONCILIATION_REQUIRED']
  };
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
    for (const element of document.querySelectorAll('h1,h2,h3,label,.button,.nav-button,.mobile-nav button,.badge,[data-command-center] strong,[data-command-center] small')) {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (!rect.width || !rect.height || style.visibility === 'hidden' || style.display === 'none' || element.matches(':disabled,[aria-disabled="true"]')) continue;
      const fg = parse(style.color);
      const bg = background(element);
      if (!fg || fg[3] < 0.95) continue;
      const l1 = luminance(fg); const l2 = luminance(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const px = Number.parseFloat(style.fontSize) || 14;
      const weight = Number.parseInt(style.fontWeight, 10) || 400;
      const large = px >= 24 || (px >= 18.66 && weight >= 700);
      const required = large ? 3 : 4.5;
      if (ratio + 0.01 < required) failures.push({ tag: element.tagName, text: element.textContent?.trim().slice(0, 80), ratio: Number(ratio.toFixed(2)), required });
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
    const done = (transaction) => new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('IDB_ABORT'));
    });
    const writeStart = performance.now();
    const write = db.transaction('items', 'readwrite');
    const store = write.objectStore('items');
    for (let index = 1; index <= count; index += 1) store.put({ id: index, text: `event-${index}-${'x'.repeat(128)}`, amount: index * 10 });
    await done(write);
    const writeMs = performance.now() - writeStart;
    const readStart = performance.now();
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
    await done(read);
    const read50Ms = performance.now() - readStart;
    db.close();
    await new Promise((resolve) => {
      const deletion = indexedDB.deleteDatabase(databaseName);
      deletion.onsuccess = deletion.onerror = deletion.onblocked = () => resolve();
    });
    return { volume: count, writeMs, read50Ms, recordsRead: recent.filter(Boolean).length };
  }, volume);
}

for (const width of [360, 390, 430]) {
  test(`mobile ${width}px keeps Command Center responsive, keyboard-visible and WCAG-oriented`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors = await openDashboard(page, { remote: remoteFixture() });
    expect(errors).toEqual([]);
    const issues = await page.evaluate(detectHipicoLayoutIssues, { touch: true });
    expect(issues, JSON.stringify(issues, null, 2)).toEqual([]);
    expect(await contrastFailures(page), 'WCAG text/control contrast failures').toEqual([]);
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => ({ body: document.activeElement === document.body, visible: Boolean(document.activeElement && document.activeElement.getBoundingClientRect().width) }));
    expect(focus.body).toBe(false);
    expect(focus.visible).toBe(true);
    await expect(page.locator('[data-command-center]')).toContainText('Sistema');
    await expect(page.locator('[data-command-center]')).toContainText('Bridge');
    await expect(page.locator('[data-command-center]')).toContainText('Base de datos');
    await expect(page.locator('[data-command-center]')).toContainText('Documentos');
    mkdirSync(ARTIFACT_ROOT, { recursive: true });
    await page.screenshot({ path: join(ARTIFACT_ROOT, `command-center-${width}-${test.info().project.name}.png`), fullPage: true });
  });
}

test('Command Center uses real remote states and never renders hidden message/recipient secrets', async ({ page }) => {
  await openDashboard(page, { remote: remoteFixture() });
  const center = page.locator('[data-command-center]');
  await expect(center).toContainText('Operativo');
  await expect(center).toContainText('PostgreSQL listo');
  await expect(center).toContainText('shadow');
  await expect(center).toContainText('OUTBOX_RECONCILIATION_REQUIRED');
  await expect(center).not.toContainText('SECRET-MESSAGE');
  await expect(center).not.toContainText('584121234567');
});

test('offline Command Center and installed PWA shell remain explicit after offline reload', async ({ page, context }) => {
  await openDashboard(page, { remote: remoteFixture() });
  await page.evaluate(async () => { if ('serviceWorker' in navigator) await navigator.serviceWorker.ready; });
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.locator('[data-command-center]')).toContainText(/Sin conexión/i);
  await expect(page.locator('.offline-banner').first()).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.shell')).toBeVisible();
  await expect(page.locator('.offline-banner').first()).toContainText(/Sin conexión/i);
  await context.setOffline(false);
});

test('runtime metadata mismatch is explicit and recovers without banner resurrection', async ({ page }) => {
  let stale = true;
  await page.route('**/hipico-control/build-info.json*', async (route) => {
    if (stale) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ product: 'control-hipico', version: '0.0.0-stale' }) });
      return;
    }
    await route.continue();
  });
  await openDashboard(page, { remote: remoteFixture() });
  const banner = page.locator('#hipico-version-mismatch');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(/Actualización requerida/i);
  await expect(page.locator('html')).toHaveAttribute('data-hipico-version-mismatch', 'true');
  stale = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(banner).toHaveCount(0);
  await page.evaluate(() => {
    const mutation = document.createElement('div');
    mutation.id = 'post-version-recovery-mutation';
    mutation.textContent = 'mutation';
    document.querySelector('#app')?.append(mutation);
  });
  await expect(page.locator('#post-version-recovery-mutation')).toBeVisible();
  await expect(page.locator('#hipico-version-mismatch')).toHaveCount(0);
});

test('light dark system preference survives bootstrap without invalid theme values', async ({ page }) => {
  await resetStorage(page);
  await page.evaluate(() => localStorage.setItem('hipico-theme', 'dark'));
  await page.goto('/hipico-control/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('hipico-theme'))).toBe('light');
  await page.evaluate(() => { document.documentElement.dataset.theme = 'system'; });
  await expect.poll(() => page.evaluate(() => localStorage.getItem('hipico-theme'))).toBe('system');
});

test('keyboard dialog restores focus, reduced motion is honored, and 200% text zoom reflows', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openDashboard(page, { remote: remoteFixture() });
  const trigger = page.getByRole('button', { name: /Nueva carrera/i }).first();
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  const motionViolations = await page.evaluate(() => {
    const toMs = (value) => Math.max(...String(value).split(',').map((part) => part.trim().endsWith('ms') ? Number.parseFloat(part) : Number.parseFloat(part) * 1000));
    return [...document.querySelectorAll('button,.button,.toast,.modal,.card')].map((element) => {
      const style = getComputedStyle(element);
      return { className: element.className, animation: toMs(style.animationDuration), transition: toMs(style.transitionDuration) };
    }).filter((row) => row.animation > 1 || row.transition > 1);
  });
  expect(motionViolations).toEqual([]);

  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  const zoomGeometry = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, overflowY: getComputedStyle(document.documentElement).overflowY }));
  expect(zoomGeometry.overflow).toBeLessThanOrEqual(1);
  expect(zoomGeometry.overflowY).not.toBe('hidden');
  const zoomIssues = await page.evaluate(detectHipicoLayoutIssues, { touch: true });
  expect(zoomIssues, JSON.stringify(zoomIssues, null, 2)).toEqual([]);
});

test('landscape and keyboard-like viewport preserve natural vertical scroll and no global clipping', async ({ page }) => {
  for (const viewport of [{ width: 844, height: 390, label: 'landscape' }, { width: 390, height: 500, label: 'keyboard-like' }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const errors = await openDashboard(page, { remote: remoteFixture() });
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

test('browser performance records boot/render/long-tasks/memory and IndexedDB 100 500 2000', async ({ page }) => {
  const errors = await openDashboard(page, { remote: remoteFixture() });
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
    const longTasks = Array.isArray(globalThis.__hipicoLongTasks) ? globalThis.__hipicoLongTasks : [];
    return {
      navigation: nav ? { domContentLoadedMs: nav.domContentLoadedEventEnd, loadMs: nav.loadEventEnd, transferSize: nav.transferSize, encodedBodySize: nav.encodedBodySize, decodedBodySize: nav.decodedBodySize } : null,
      paint: performance.getEntriesByType('paint').map((entry) => ({ name: entry.name, startTime: entry.startTime })),
      longTasks: { supported: Boolean(globalThis.PerformanceObserver?.supportedEntryTypes?.includes('longtask')), count: longTasks.length, totalDurationMs: longTasks.reduce((sum, item) => sum + item.duration, 0), entries: longTasks.slice(0, 100) },
      memory: performance.memory ? { usedJSHeapSize: performance.memory.usedJSHeapSize, totalJSHeapSize: performance.memory.totalJSHeapSize, jsHeapSizeLimit: performance.memory.jsHeapSizeLimit } : null,
      domNodes: document.getElementsByTagName('*').length,
      measuredAt: new Date().toISOString()
    };
  });
  expect(metrics.navigation).not.toBeNull();
  expect(Number(interactionRenderMs)).toBeGreaterThanOrEqual(0);
  expect(indexedDb.map((item) => item.recordsRead)).toEqual([50, 50, 50]);
  mkdirSync(ARTIFACT_ROOT, { recursive: true });
  writeFileSync(join(ARTIFACT_ROOT, `browser-performance-${test.info().project.name}.json`), `${JSON.stringify({ schema: 'hipico-browser-performance.v290', sha: SHA, project: test.info().project.name, interactionRenderMs, indexedDb, ...metrics }, null, 2)}\n`);
});
