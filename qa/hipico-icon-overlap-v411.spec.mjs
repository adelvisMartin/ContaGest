import { test, expect } from '@playwright/test';

async function openLocalDashboard(page) {
  await page.goto('/hipico-control/recovery.html');
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      const request = indexedDB.deleteDatabase('hipico-control');
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
    localStorage.clear();
    const seed = await import('/hipico-control/assets/js/seed.js');
    const store = await import('/hipico-control/assets/js/store.js');
    await store.initializeStorage(seed.createBlankWorkspace);
    await store.setAppMode('local');
    await store.saveLocalWorkspace(seed.createBlankWorkspace(), { snapshot: false });
  });
  await page.goto('/hipico-control/?view=dashboard');
  await expect(page.locator('.shell')).toBeVisible();
}

test.describe('Control Hípico v4.1.1 floating action and icon regression', () => {
  test.use({ viewport: { width: 1366, height: 900 }, hasTouch: false });

  test('help and WhatsApp utilities never overlap and use canonical 16px SVG icons', async ({ page }) => {
    await openLocalDashboard(page);
    await page.evaluate(async () => {
      const { mountOperationalCopyCenter } = await import('/hipico-control/assets/js/operational-copy-center.js');
      const root = mountOperationalCopyCenter();
      root.dataset.opsAuthorized = 'true';
      root.removeAttribute('inert');
      root.removeAttribute('aria-hidden');
    });

    const help = page.locator('.hc-help-trigger');
    const launcher = page.locator('.ops-launcher');
    await expect(help).toBeVisible();
    await expect(launcher).toBeVisible();
    await expect(help.locator('svg')).toHaveCount(1);
    await expect(launcher.locator('svg')).toHaveCount(1);

    const geometry = await page.evaluate(() => {
      const help = document.querySelector('.hc-help-trigger')?.getBoundingClientRect();
      const launcher = document.querySelector('.ops-launcher')?.getBoundingClientRect();
      const icons = [...document.querySelectorAll('.hc-help-trigger svg, .ops-launcher svg')].map((node) => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      });
      return {
        help: help ? { top: help.top, bottom: help.bottom, left: help.left, right: help.right } : null,
        launcher: launcher ? { top: launcher.top, bottom: launcher.bottom, left: launcher.left, right: launcher.right } : null,
        icons
      };
    });

    expect(geometry.help).not.toBeNull();
    expect(geometry.launcher).not.toBeNull();
    expect(geometry.help.bottom).toBeLessThanOrEqual(geometry.launcher.top - 7);
    for (const size of geometry.icons) {
      expect(size.width).toBeGreaterThanOrEqual(15.5);
      expect(size.width).toBeLessThanOrEqual(16.5);
      expect(size.height).toBeGreaterThanOrEqual(15.5);
      expect(size.height).toBeLessThanOrEqual(16.5);
    }
  });

  test('operational modal replaces ad-hoc close/copy glyphs with canonical SVG icons', async ({ page }) => {
    await openLocalDashboard(page);
    await page.evaluate(async () => {
      const { mountOperationalCopyCenter } = await import('/hipico-control/assets/js/operational-copy-center.js');
      const root = mountOperationalCopyCenter();
      root.dataset.opsAuthorized = 'true';
      root.removeAttribute('inert');
      root.removeAttribute('aria-hidden');
    });

    await page.getByRole('button', { name: 'Abrir textos operativos de WhatsApp' }).click();
    await expect(page.locator('.ops-dialog')).toBeVisible();
    await expect(page.locator('[data-ops-close] svg')).toHaveCount(1);
    await expect(page.locator('[data-ops-copy] svg').first()).toHaveCount(1);
    await expect(page.locator('.ops-chevron svg').first()).toHaveCount(1);
  });
});
