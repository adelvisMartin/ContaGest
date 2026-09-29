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

test.describe('Control Hípico v4.1.3 overlay authority', () => {
  test.use({ viewport: { width: 1366, height: 900 }, hasTouch: false });

  test('legacy modal uses the shared focus, inert, Escape and return-focus lifecycle', async ({ page }) => {
    await openLocalDashboard(page);
    const trigger = page.getByRole('button', { name: 'Captura rápida' }).first();
    await trigger.focus();

    await page.evaluate(async () => {
      const { ui } = await import('/hipico-control/assets/js/ui.js');
      const host = document.createElement('div');
      host.dataset.overlayQaHost = 'true';
      host.innerHTML = ui.dialog('Modal QA', '<button type="button" data-qa-action>Acción</button>');
      document.body.append(host);
      host.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('[data-action="close-modal"]')) host.remove();
      });
    });

    const dialog = page.getByRole('dialog', { name: 'Modal QA' });
    await expect(dialog).toBeVisible();
    await expect(page.locator('.shell')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByRole('button', { name: 'Cerrar' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.shell')).not.toHaveAttribute('aria-hidden', 'true');
    await expect(trigger).toBeFocused();
  });

  test('native operational dialog shares the same lifecycle and restores launcher focus', async ({ page }) => {
    await openLocalDashboard(page);
    await page.evaluate(async () => {
      const { mountOperationalCopyCenter } = await import('/hipico-control/assets/js/operational-copy-center.js');
      const root = mountOperationalCopyCenter();
      root.dataset.opsAuthorized = 'true';
      root.removeAttribute('inert');
      root.removeAttribute('aria-hidden');
    });

    const launcher = page.getByRole('button', { name: 'Abrir textos operativos de WhatsApp' });
    await launcher.click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    await expect(page.locator('.shell')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByRole('button', { name: 'Cerrar centro operativo' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.locator('.shell')).not.toHaveAttribute('aria-hidden', 'true');
    await expect(launcher).toBeFocused();
  });

  test('notice bridge renders canonical semantic toast with SVG dismiss action', async ({ page }) => {
    await openLocalDashboard(page);
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('hipico:notice', {
        detail: { type: 'success', message: 'Operación confirmada' }
      }));
    });

    const toast = page.locator('.toast--success').filter({ hasText: 'Operación confirmada' });
    await expect(toast).toBeVisible();
    await expect(toast).toHaveAttribute('role', 'status');
    await expect(toast.locator('.toast__icon svg')).toHaveCount(1);
    const close = toast.getByRole('button', { name: 'Cerrar notificación' });
    await expect(close.locator('svg')).toHaveCount(1);
    await close.click();
    await expect(toast).toHaveCount(0);
  });
});
