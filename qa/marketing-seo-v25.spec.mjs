import { test, expect } from '@playwright/test';

const publicRoutes = [
  '/soluciones/',
  '/soluciones/comercios/',
  '/soluciones/contadores/',
  '/soluciones/salud-veterinaria/',
  '/soluciones/gimnasios/',
  '/soluciones/multiempresa/'
];

test.describe('Issue #25 · separación Marketing/SEO', () => {
  test('la aplicación privada publica noindex incluso en login', async ({ page }) => {
    await page.goto('/?module=login', { waitUntil:'domcontentloaded' });
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page).toHaveTitle(/Acceso privado \| ContaGest/);
  });

  test('la landing pública es indexable y tiene SEO/structured data propio', async ({ page }) => {
    await page.goto('/soluciones/', { waitUntil:'domcontentloaded' });
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /index,follow/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://conta-gest-frontend.vercel.app/soluciones/');
    await expect(page.locator('script[type="application/ld+json"]')).toContainText('SoftwareApplication');
    await expect(page.locator('script[type="application/ld+json"]')).toContainText('FAQPage');
    await expect(page.locator('h1')).toContainText('Control empresarial');
    await expect(page.locator('[data-demo-cta]').first()).toBeVisible();
    await expect(page.locator('[data-whatsapp-cta]').first()).toBeHidden();
  });

  test('la portada enlaza todas las verticales requeridas', async ({ page }) => {
    await page.goto('/soluciones/', { waitUntil:'domcontentloaded' });
    for (const route of publicRoutes.slice(1)) {
      await expect(page.locator(`a[href="${route}"]`).first()).toBeVisible();
    }
  });

  for (const route of publicRoutes) {
    test(`${route} mantiene canonical, indexación pública y assets v11.15`, async ({ page }) => {
      await page.goto(route, { waitUntil:'domcontentloaded' });
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /index,follow/);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://conta-gest-frontend.vercel.app${route}`);
      await expect(page.locator('img[src="/brand/contagest-logo.svg"]').first()).toBeVisible();
      await expect(page.locator('img[src="/icons/contagest-app.svg"]').first()).toBeVisible();
      await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
    });
  }

  test('mobile 360px no produce overflow horizontal y la navegación es operable', async ({ page }) => {
    await page.setViewportSize({ width:360, height:800 });
    await page.goto('/soluciones/', { waitUntil:'domcontentloaded' });
    const toggle = page.locator('[data-marketing-menu-toggle]');
    await expect(toggle).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('[data-marketing-menu]')).toHaveAttribute('data-open', 'true');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('desktop mantiene navegación horizontal sin menú móvil', async ({ page }) => {
    await page.setViewportSize({ width:1440, height:900 });
    await page.goto('/soluciones/', { waitUntil:'domcontentloaded' });
    await expect(page.locator('[data-marketing-menu]')).toBeVisible();
    await expect(page.locator('[data-marketing-menu-toggle]')).toBeHidden();
  });
});
