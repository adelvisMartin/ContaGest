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
      const values = [r, g, b].map((channel) => {
        const c = channel / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
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
      if (ratio + 0.01 < required) failures.push({ tag: element.tagName, className: element.className, text: element.textContent?.trim().slice(0, 80), ratio: Number(ratio.toFixed(2)), required });
    }
    return failures;
  });
}

for (const width of [360, 390, 430]) {
  test(`mobile ${width}px: responsive, focus and contrast release gate`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors = await openDashboard(page);
    expect(errors).toEqual([]);
    const issues = await page.evaluate(detectHipicoLayoutIssues, { touch: true });
    expect(issues, JSON.stringify(issues, null, 2)).toEqual([]);
    expect(await contrastFailures(page), 'WCAG text/control contrast failures').toEqual([]);
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, body: document.activeElement === document.body, visible: Boolean(document.activeElement && document.activeElement.getBoundingClientRect().width) }));
    expect(focus.body).toBe(false);
    expect(focus.visible).toBe(true);
  });
}

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

test('runtime metadata mismatch is explicit and fail-visible instead of silent', async ({ page }) => {
  await page.route('**/hipico-control/build-info.json*', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: '0.0.0-stale', channel: 'pilot' }) });
  });
  await openDashboard(page);
  const banner = page.locator('#hipico-version-mismatch');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText(/Actualización requerida/i);
  expect(await page.locator('html').getAttribute('data-hipico-version-mismatch')).toBe('true');
});

test('PWA boot performance is measured and written as SHA-bound evidence', async ({ page }) => {
  const errors = await openDashboard(page);
  expect(errors).toEqual([]);
  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const paint = performance.getEntriesByType('paint').map((entry) => ({ name: entry.name, startTime: entry.startTime }));
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
      measuredAt: new Date().toISOString()
    };
  });
  expect(metrics.navigation).not.toBeNull();
  expect(metrics.navigation.domContentLoadedMs).toBeGreaterThan(0);
  mkdirSync(ARTIFACT_ROOT, { recursive: true });
  writeFileSync(join(ARTIFACT_ROOT, `browser-performance-${test.info().project.name}.json`), `${JSON.stringify({ sha: SHA, project: test.info().project.name, ...metrics }, null, 2)}\n`, 'utf8');
});
