import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

test('frontend navigation baseline captures render/resources/long tasks without arbitrary thresholds', async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__cgLongTasks = [];
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) globalThis.__cgLongTasks.push({ startTime: entry.startTime, duration: entry.duration });
      });
      observer.observe({ type: 'longtask', buffered: true });
      globalThis.__cgLongTaskObserverSupported = true;
    } catch {
      globalThis.__cgLongTaskObserverSupported = false;
    }
  });

  await page.goto('/?module=login', { waitUntil: 'networkidle' });
  await expect(page.locator('.login-shell')).toBeVisible();

  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');
    const resourceDurations = resources.map((entry) => entry.duration).sort((a, b) => a - b);
    const p = (values, percentile) => {
      if (!values.length) return 0;
      const index = Math.min(values.length - 1, Math.max(0, Math.ceil((percentile / 100) * values.length) - 1));
      return Number(values[index].toFixed(3));
    };
    return {
      navigation: nav ? {
        durationMs: Number(nav.duration.toFixed(3)),
        domContentLoadedMs: Number(nav.domContentLoadedEventEnd.toFixed(3)),
        loadEventMs: Number(nav.loadEventEnd.toFixed(3)),
        transferSize: nav.transferSize,
        decodedBodySize: nav.decodedBodySize,
      } : null,
      resources: {
        count: resources.length,
        transferBytes: resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
        durationMs: { p50: p(resourceDurations, 50), p95: p(resourceDurations, 95), p99: p(resourceDurations, 99) },
      },
      longTasks: {
        supported: Boolean(globalThis.__cgLongTaskObserverSupported),
        count: globalThis.__cgLongTasks.length,
        totalDurationMs: Number(globalThis.__cgLongTasks.reduce((sum, entry) => sum + entry.duration, 0).toFixed(3)),
        maxDurationMs: Number(Math.max(0, ...globalThis.__cgLongTasks.map((entry) => entry.duration)).toFixed(3)),
      },
      heap: performance.memory ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
      } : null,
    };
  });

  const outputDir = path.resolve('artifacts/performance');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'frontend-browser-v564.json'), `${JSON.stringify({
    ticket: '#564',
    candidateSha: process.env.CANDIDATE_SHA || process.env.GITHUB_SHA || 'unknown',
    budgetMode: 'observe-only',
    capturedAt: new Date().toISOString(),
    route: 'login',
    metrics,
  }, null, 2)}\n`);
});
