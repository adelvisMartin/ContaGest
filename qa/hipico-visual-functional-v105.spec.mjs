import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HIPICO_VIEWS, HIPICO_VIEWPORTS, buildHipicoQaFixture } from './support/hipico-visual-catalog-v105.mjs';
import { detectHipicoLayoutIssues } from './support/hipico-layout-detector-v105.mjs';

function candidateSha() {
  const explicit = String(process.env.HIPICO_QA_SHA || process.env.GITHUB_SHA || '').trim();
  if (/^[0-9a-f]{40}$/i.test(explicit)) return explicit;
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); }
  catch { return 'unknown-sha'; }
}

const SHA = candidateSha();
const ARTIFACT_ROOT = join(process.cwd(), 'artifacts', 'qa', 'hipico-v105', SHA);

async function resetQaStorage(page) {
  await page.goto('/hipico-control/recovery.html');
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('hipico-control');
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
    localStorage.clear();
  });
}

async function seedLocalWorkspace(page, fixture) {
  await resetQaStorage(page);
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
    const normalized = workspaceModule.normalizeWorkspaceShape(workspace);
    await store.initializeStorage(seed.createBlankWorkspace);
    await store.setAppMode('local');
    await store.saveLocalWorkspace(normalized, { snapshot: false });
  }, fixture);
}

async function openView(page, view, state = 'normal') {
  await seedLocalWorkspace(page, buildHipicoQaFixture(state));
  const consoleErrors = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  await page.goto(`/hipico-control/?view=${encodeURIComponent(view)}`);
  await expect(page.locator('#app')).not.toHaveClass(/app-loading/);
  await expect(page.locator('.shell')).toBeVisible();
  return consoleErrors;
}

async function captureEvidence(page, view, viewportId, state) {
  const directory = join(ARTIFACT_ROOT, view);
  mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: join(directory, `${viewportId}-${state}.png`), fullPage: true });
}

async function expectHealthyLayout(page, viewport, contextLabel) {
  const issues = await page.evaluate(detectHipicoLayoutIssues, { touch: viewport.touch });
  expect(issues, `${contextLabel}\n${JSON.stringify(issues, null, 2)}`).toEqual([]);
}

for (const viewport of HIPICO_VIEWPORTS) {
  test.describe(`Control Hípico ${viewport.id}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.touch
    });
    for (const view of HIPICO_VIEWS) {
      test(`${view.id} · normal · sin overflow/solapamiento`, async ({ page }) => {
        const consoleErrors = await openView(page, view.id, 'normal');
        await expect(page.locator('.content')).toBeVisible();
        await expectHealthyLayout(page, viewport, `${view.id}/${viewport.id}/normal`);
        expect(consoleErrors, `${view.id}/${viewport.id} produjo errores de runtime`).toEqual([]);
        await captureEvidence(page, view.id, viewport.id, 'normal');
      });
    }
  });
}

test.describe('Estados representativos por vista', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  for (const view of HIPICO_VIEWS) {
    test(`${view.id} · empty`, async ({ page }) => {
      const consoleErrors = await openView(page, view.id, 'empty');
      await expectHealthyLayout(page, { touch: true }, `${view.id}/mobile-390/empty`);
      expect(consoleErrors).toEqual([]);
      await captureEvidence(page, view.id, 'mobile-390', 'empty');
    });

    test(`${view.id} · offline`, async ({ page, context }) => {
      const consoleErrors = await openView(page, view.id, 'normal');
      await context.setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event('offline')));
      await expect(page.locator('.offline-banner')).toBeVisible();
      await expectHealthyLayout(page, { touch: true }, `${view.id}/mobile-390/offline`);
      expect(consoleErrors).toEqual([]);
      await captureEvidence(page, view.id, 'mobile-390', 'offline');
      await context.setOffline(false);
    });
  }

  test('permission/auth denial is explicit and non-destructive', async ({ page }) => {
    await resetQaStorage(page);
    await page.goto('/hipico-control/');
    await expect(page.locator('.auth-card')).toBeVisible();
    await page.getByLabel('Correo').fill('qa@example.test');
    await page.getByLabel('Contraseña').fill('qa-password-123');
    await page.getByRole('button', { name: 'Entrar sin conexión' }).click();
    await expect(page.locator('#toast-region')).toContainText('Activa una vez el acceso sin conexión');
    await expect(page.locator('.auth-card')).toBeVisible();
  });

  test('recovery surface renders independently', async ({ page }) => {
    await page.goto('/hipico-control/recovery.html');
    await expect(page.locator('body')).toContainText(/recuper/i);
    const issues = await page.evaluate(detectHipicoLayoutIssues, { touch: true });
    expect(issues).toEqual([]);
    mkdirSync(join(ARTIFACT_ROOT, 'recovery'), { recursive: true });
    await page.screenshot({ path: join(ARTIFACT_ROOT, 'recovery', 'mobile-390-recovery.png'), fullPage: true });
  });
});

test('fixture roto deliberado demuestra que el detector bloquea regresiones', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const brokenFixture = readFileSync(new URL('./fixtures/hipico-v105-broken-overflow.html', import.meta.url), 'utf8');
  await page.setContent(brokenFixture, { waitUntil: 'domcontentloaded' });
  const issues = await page.evaluate(detectHipicoLayoutIssues, { touch: true });
  const types = new Set(issues.map((issue) => issue.type));
  expect(types.has('document-overflow-x')).toBe(true);
  expect(types.has('touch-target-too-small')).toBe(true);
  expect(types.has('icon-label-overlap')).toBe(true);
  expect(types.has('button-without-workflow')).toBe(true);
});
