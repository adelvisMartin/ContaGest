import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildHipicoQaFixture, HIPICO_VIEWS } from './support/hipico-visual-catalog-v105.mjs';

const QA_SHA = String(process.env.HIPICO_QA_SHA || process.env.GITHUB_SHA || 'local').trim();
const EVIDENCE_ROOT = join(process.cwd(), 'artifacts', 'qa', 'hipico-browser', QA_SHA, 'ui-v41');

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

async function seedWorkspace(page, state = 'normal') {
  const fixture = buildHipicoQaFixture(state);
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

async function openView(page, view = 'dashboard') {
  await seedWorkspace(page);
  await page.goto(`/hipico-control/?view=${encodeURIComponent(view)}`);
  await expect(page.locator('#app')).not.toHaveClass(/app-loading/);
  await expect(page.locator('.shell')).toBeVisible();
  await expect(page.locator('.content')).toBeVisible();
}

async function selectTheme(page, theme) {
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await page.getByRole('menuitemradio', { name: theme === 'dark' ? 'Oscuro' : theme === 'light' ? 'Claro' : 'Sistema' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function forceTheme(page, theme) {
  await page.evaluate((value) => {
    localStorage.setItem('hipico-control-theme', value);
    document.documentElement.dataset.theme = value;
  }, theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function saveEvidence(page, name) {
  mkdirSync(EVIDENCE_ROOT, { recursive: true });
  await page.screenshot({ path: join(EVIDENCE_ROOT, `${name}.png`), fullPage: true, animations: 'disabled' });
}

test.describe('Control Hípico UI System v4.1 · desktop shell', () => {
  test.use({ viewport: { width: 1366, height: 900 }, hasTouch: false });

  test('content is fluid full-width in every primary view', async ({ page }) => {
    await openView(page, 'dashboard');
    for (const view of HIPICO_VIEWS) {
      await page.goto(`/hipico-control/?view=${encodeURIComponent(view.id)}`);
      await expect(page.locator('.shell')).toBeVisible();
      const metrics = await page.evaluate(() => {
        const main = document.querySelector('.main')?.getBoundingClientRect();
        const content = document.querySelector('.content')?.getBoundingClientRect();
        const style = document.querySelector('.content') ? getComputedStyle(document.querySelector('.content')) : null;
        return { mainWidth: main?.width || 0, contentWidth: content?.width || 0, maxWidth: style?.maxWidth || '' };
      });
      expect(metrics.maxWidth, `${view.id} must not reintroduce a centered max-width`).toBe('none');
      expect(Math.abs(metrics.mainWidth - metrics.contentWidth), `${view.id} must use all available main width`).toBeLessThanOrEqual(1);
    }
  });

  test('sidebar collapses to 66px, expands main content and persists after reload', async ({ page }) => {
    await openView(page);
    const sidebar = page.locator('.sidebar');
    const main = page.locator('.main');
    const beforeSidebar = await sidebar.evaluate((node) => node.getBoundingClientRect().width);
    const beforeMain = await main.evaluate((node) => node.getBoundingClientRect().width);
    expect(beforeSidebar).toBeGreaterThanOrEqual(220);

    await page.getByRole('button', { name: 'Colapsar barra lateral' }).click();
    await expect(page.locator('.shell')).toHaveClass(/is-sidebar-collapsed/);
    const afterSidebar = await sidebar.evaluate((node) => node.getBoundingClientRect().width);
    const afterMain = await main.evaluate((node) => node.getBoundingClientRect().width);
    expect(afterSidebar).toBeGreaterThanOrEqual(64);
    expect(afterSidebar).toBeLessThanOrEqual(68);
    expect(afterMain).toBeGreaterThan(beforeMain + 140);
    expect(await page.evaluate(() => localStorage.getItem('hipico-control-sidebar-collapsed'))).toBe('1');

    await page.reload();
    await expect(page.locator('.shell')).toHaveClass(/is-sidebar-collapsed/);
    await expect(page.getByRole('button', { name: 'Expandir barra lateral' })).toBeVisible();
  });

  test('collapsed navigation remains operable', async ({ page }) => {
    await openView(page);
    await page.getByRole('button', { name: 'Colapsar barra lateral' }).click();
    await page.getByRole('button', { name: 'Cierres y saldos' }).click();
    await expect(page.locator('.topbar h1')).toHaveText('Cierres y saldos');
    await expect(page.locator('.shell')).toHaveClass(/is-sidebar-collapsed/);
  });

  test('global header exposes local theme and quick options', async ({ page }) => {
    await openView(page);
    await expect(page.getByRole('button', { name: 'Cambiar tema' }).last()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeVisible();
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await expect(page.getByRole('menu', { name: 'Opciones rápidas' })).toBeVisible();
    await page.getByRole('menuitemradio', { name: 'Oscuro' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => localStorage.getItem('hipico-control-theme'))).toBe('dark');
    await page.getByRole('button', { name: 'Abrir menú' }).click();
    await expect(page.getByRole('menuitem', { name: 'Configuración' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Ayuda' })).toBeVisible();
  });

  test('legacy horse wordmark is not visible anywhere in the rendered shell', async ({ page }) => {
    await openView(page);
    await expect(page.locator('.hc-brand-lockup, .hc-brand-mark').first()).toBeVisible();
    await expect(page.locator('img[src*="logo-control-hipico.png"]:visible')).toHaveCount(0);
    await expect(page.locator('.group-hero img.brand-logo:visible')).toHaveCount(0);
  });

  test('desktop button and input density stays within the v4 scale', async ({ page }) => {
    await openView(page, 'race');
    const metrics = await page.evaluate(() => {
      const defaultButton = [...document.querySelectorAll('.button')].find((node) => !node.classList.contains('button--small') && !node.classList.contains('button--xl'));
      const input = document.querySelector('.input');
      const buttonStyle = defaultButton ? getComputedStyle(defaultButton) : null;
      const inputStyle = input ? getComputedStyle(input) : null;
      return {
        buttonMinHeight: parseFloat(buttonStyle?.minHeight || '0'),
        buttonFont: parseFloat(buttonStyle?.fontSize || '0'),
        inputMinHeight: parseFloat(inputStyle?.minHeight || '0'),
        inputFont: parseFloat(inputStyle?.fontSize || '0')
      };
    });
    expect(metrics.buttonMinHeight).toBeGreaterThanOrEqual(36);
    expect(metrics.buttonMinHeight).toBeLessThanOrEqual(38);
    expect(metrics.buttonFont).toBeLessThanOrEqual(13.5);
    expect(metrics.inputMinHeight).toBe(36);
    expect(metrics.inputFont).toBeLessThanOrEqual(13.5);
  });

  test('captures exact-SHA light and dark visual evidence for representative views', async ({ page }) => {
    await openView(page, 'dashboard');
    for (const view of ['dashboard', 'race', 'reports', 'settings']) {
      await page.goto(`/hipico-control/?view=${view}`);
      await expect(page.locator('.shell')).toBeVisible();
      await selectTheme(page, 'light');
      await saveEvidence(page, `${view}-desktop-1366-light`);
      await selectTheme(page, 'dark');
      await saveEvidence(page, `${view}-desktop-1366-dark`);
    }
  });
});

test.describe('Control Hípico UI System v4.1 · touch shell', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('mobile keeps its dedicated navigation and ignores desktop collapse state', async ({ page }) => {
    await openView(page);
    await page.evaluate(() => localStorage.setItem('hipico-control-sidebar-collapsed', '1'));
    await page.reload();
    await expect(page.locator('.sidebar')).toBeHidden();
    await expect(page.locator('.topbar')).toBeHidden();
    await expect(page.locator('.mobile-header')).toBeVisible();
    await expect(page.locator('.mobile-nav')).toBeVisible();
    await expect(page.getByRole('button', { name: /barra lateral/i })).toHaveCount(0);
  });

  test('visible interactive controls preserve 44px touch targets', async ({ page }) => {
    await openView(page);
    const tooSmall = await page.evaluate(() => [...document.querySelectorAll('button')]
      .filter((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0 && !node.disabled && rect.height < 43.5;
      })
      .map((node) => ({ label: node.getAttribute('aria-label') || node.textContent?.trim() || 'button', height: node.getBoundingClientRect().height })));
    expect(tooSmall).toEqual([]);
  });

  test('captures mobile light and dark evidence', async ({ page }) => {
    await openView(page, 'dashboard');
    await forceTheme(page, 'light');
    await saveEvidence(page, 'dashboard-mobile-390-light');
    await forceTheme(page, 'dark');
    await saveEvidence(page, 'dashboard-mobile-390-dark');
  });
});
