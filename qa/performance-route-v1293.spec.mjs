import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { test, expect } from '@playwright/test';
import { MODULE_VISUAL_CATALOG } from './support/module-visual-catalog.mjs';
import { PAGE_ROUTES } from '../frontend/src/data/pageRegistry.js';
import { waitForRouteReady } from './support/playwright-determinism.mjs';
import { fixtureForRequest } from './support/erp-system-fixtures-v155.mjs';
import { assertLocalLabOrigin, isAllowedLabRequest, isAllowedLabRedirect, isAllowedLabSocket } from './support/performance-lab-isolation-v1293.mjs';

const targetBase = String(process.env.QA_BASE_URL || '').trim();
if (targetBase) assertLocalLabOrigin(targetBase);
const candidateSha = String(process.env.CANDIDATE_SHA || '').trim().toLowerCase();
assert.match(candidateSha, /^[a-f0-9]{40}$/, '#1293 needs exact CANDIDATE_SHA');
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim().toLowerCase(),
  candidateSha, '#1293 must run on candidate HEAD, not a PR merge ref');
assert.equal(MODULE_VISUAL_CATALOG.length, 60, '#1293 requires current 60-route authority');
assert.deepEqual(new Set(MODULE_VISUAL_CATALOG.map(item => item.route)), new Set(PAGE_ROUTES),
  '#1293 requires the visual catalog to match runtime routes');
const profile = 'desktop-1440';
const runId = String(process.env.CG_PERF1293_RUN_ID || process.env.GITHUB_RUN_ID || '').trim();
assert.match(runId, /^[a-zA-Z0-9_-]{1,80}$/, '#1293 run ID must isolate each campaign');
const output = path.resolve('artifacts/performance/v1293', candidateSha, runId, profile);
const session = {
  sessionMode: 'cookie', mode: 'cookie', tenantId: 'qa-tenant-synthetic',
  tenant: { id: 'qa-tenant-synthetic', name: 'Synthetic Lab', rif: 'J-00000000-0', plan: 'enterprise' },
  user: { id: 'qa-admin-synthetic', fullName: 'Lab Actor', name: 'Lab Actor',
    email: 'lab@example.test', role: 'admin', permissions: ['*'] },
  audience: 'staff', expiresAt: Date.now() + 8 * 60 * 60 * 1000,
};

test.use({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce', serviceWorkers: 'block' });

autoInstallObservers();
function autoInstallObservers() {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((auth) => {
      localStorage.setItem('contagest_auth_session', JSON.stringify(auth));
      window.confirm = () => false;
      window.open = () => null;
      const metrics = { lcpMs: null, cls: null, lcpSupported: false, clsSupported: false };
      globalThis.__cgPerf1293 = metrics;
      if (typeof PerformanceObserver !== 'function') return;
      const supported = PerformanceObserver.supportedEntryTypes || [];
      if (supported.includes('largest-contentful-paint')) {
        metrics.lcpSupported = true;
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) metrics.lcpMs = entry.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      }
      if (supported.includes('layout-shift')) {
        metrics.clsSupported = true;
        metrics.cls = 0;
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) metrics.cls += entry.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });
      }
    }, session);
  });
}

for (const item of MODULE_VISUAL_CATALOG) {
  test(`#1293 route performance lab ${item.route}`, async ({ page, browserName, browser }, testInfo) => {
    assert.equal(browserName, 'chromium', 'This first campaign is Chromium only');
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const allowedOrigin = assertLocalLabOrigin(testInfo.project.use.baseURL);
    let blockedExternalRequests = 0;
    let blockedExternalSockets = 0;
    let observedExternalRequests = 0;
    let observedExternalSockets = 0;
    let unsafeRedirectResponses = 0;
    page.on('request', request => {
      // Redirects might bypass page.route; WebSocket upgrades have their own URL scheme.
      const permitted = request.resourceType() === 'websocket' ?
        isAllowedLabSocket(request.url(), allowedOrigin) :
        isAllowedLabRequest(request.url(), allowedOrigin);
      if (!permitted) observedExternalRequests += 1;
    });
    page.on('websocket', socket => {
      if (!isAllowedLabSocket(socket.url(), allowedOrigin)) observedExternalSockets += 1;
    });
    page.on('response', response => {
      const status = response.status();
      const location = status >= 300 && status < 400 ? response.headers().location : null;
      if (location && !isAllowedLabRedirect(location, response.url(), allowedOrigin)) {
        unsafeRedirectResponses += 1;
      }
    });
    await page.routeWebSocket('**/*', socket => {
      if (!isAllowedLabSocket(socket.url(), allowedOrigin)) {
        blockedExternalSockets += 1;
        return socket.close({ code: 1008, reason: 'LAB_NETWORK_ISOLATION' });
      }
      socket.connectToServer();
    });
    let mockedApiRequests = 0;
    await page.route('**/*', async (route) => {
      const request = route.request();
      const permitted = request.resourceType() === 'websocket' ?
        isAllowedLabSocket(request.url(), allowedOrigin) :
        isAllowedLabRequest(request.url(), allowedOrigin);
      if (!permitted) {
        blockedExternalRequests += 1;
        await route.abort('blockedbyclient');
        return;
      }
      const pathname = new URL(request.url()).pathname;
      if (request.resourceType() === 'websocket' ||
          (pathname !== '/api' && !pathname.startsWith('/api/'))) {
        await route.continue();
        return;
      }
      mockedApiRequests += 1;
      if (pathname.endsWith('/auth/me')) {
        await route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify({ ok: true, data: session }) });
        return;
      }
      if (pathname.endsWith('/auth/captcha')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          ok: true, data: { token: 'synthetic-only', question: '2 + 2', prompt: '2 + 2',
            expiresAt: new Date(Date.now() + 300000).toISOString() } }) });
        return;
      }
      const fixture = fixtureForRequest({ url: request.url(), method: request.method(), state: 'baseline' });
      await route.fulfill({ status: fixture.status, contentType: 'application/json',
        body: JSON.stringify(fixture.body) });
    });
    const started = performance.now();
    const response = await page.goto(`/?module=${encodeURIComponent(item.route)}`, { waitUntil: 'domcontentloaded' });
    expect(response?.ok()).toBe(true);
    await waitForRouteReady(page, item.route, { standalone: Boolean(item.standalone) });
    await expect(page.locator('body')).toHaveAttribute('data-route', item.route);
    // Two animation frames flush supported buffered observers; no arbitrary timeout/sleep.
    const browserMetrics = await page.evaluate(() => new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const resources = performance.getEntriesByType('resource');
        const m = globalThis.__cgPerf1293;
        const bytes = r => r.transferSize || 0;
        const jsTransferBytes = resources.filter(r => /\.(?:m?js|jsx|tsx?)$/i.test(new URL(r.name, location.href).pathname))
          .reduce((sum, r) => sum + bytes(r), 0);
        const cssTransferBytes = resources.filter(r => /\.css$/i.test(new URL(r.name, location.href).pathname))
          .reduce((sum, r) => sum + bytes(r), 0);
        resolve({ lcpMs: m.lcpSupported ? m.lcpMs : null,
          cls: m.clsSupported ? m.cls : null,
          resourceCount: resources.length,
          transferBytes: resources.reduce((sum, r) => sum + bytes(r), 0),
          jsTransferBytes, cssTransferBytes });
      }));
    }));
    const routeReadyMs = performance.now() - started;
    assert.equal(blockedExternalRequests, 0, 'Lab attempted direct foreign network requests');
    assert.equal(blockedExternalSockets, 0, 'Lab attempted foreign WebSocket connections');
    assert.equal(observedExternalRequests, 0, 'Lab observed foreign requests, including redirect chains');
    assert.equal(observedExternalSockets, 0, 'Lab observed foreign WebSocket connections');
    assert.equal(unsafeRedirectResponses, 0, 'Lab observed unsafe HTTP redirect targets');
    assert.deepEqual(errors, [], 'Route emitted JavaScript errors during lab capture');
    const cpus = os.cpus();
    const labEnvironment = {
      nodeVersion: process.version, osPlatform: process.platform, osArch: process.arch,
      cpuModel: cpus[0]?.model || 'unknown', cpuLogicalCores: cpus.length,
      browserVersion: browser.version(), networkProfile: 'UNTHROTTLED_NOT_VERIFIED',
      viewportWidth: 1440, viewportHeight: 900, colorScheme: 'light', reducedMotion: 'reduce',
    };
    const sample = {
      schemaVersion: 1293, candidateSha, runId, route: item.route, profile, labEnvironment,
      browser: 'chromium', fixtureProvenance: 'SYNTHETIC_TEST_ONLY',
      captureMode: 'LAB_RENDER_ONLY',
      metrics: { routeReadyMs, ...browserMetrics,
        // INP needs actual instrumented interactions and real field sampling.
        inpMs: null, mockedApiRequests },
    };
    mkdirSync(output, { recursive: true });
    writeFileSync(path.join(output, `${item.route}.json`), `${JSON.stringify(sample, null, 2)}\n`);
  });
}
