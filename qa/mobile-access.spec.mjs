import { test, expect } from '@playwright/test';

async function mockCaptcha(page) {
  await page.route('**/api/v1/auth/captcha', (route) => route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify({
      ok:true,
      data:{
        kind:'math',
        question:'8 + 4',
        prompt:'¿Cuánto es 8 + 4?',
        token:'qa-captcha-token-with-more-than-twenty-characters.signature',
        expiresAt:Date.now()+300000,
        refreshAfterSeconds:300
      },
      meta:{}
    })
  }));
}

async function expectNoPageOverflow(page) {
  const size = await page.evaluate(() => ({
    viewport:document.documentElement.clientWidth,
    root:document.documentElement.scrollWidth,
    body:document.body.scrollWidth
  }));
  expect(size.root, JSON.stringify(size)).toBeLessThanOrEqual(size.viewport + 2);
  expect(size.body, JSON.stringify(size)).toBeLessThanOrEqual(size.viewport + 2);
}

for (const viewport of [
  { name:'android-compact', width:344, height:760 },
  { name:'iphone', width:390, height:844 },
  { name:'tablet', width:768, height:1024 }
]) {
  test(`internal login is responsive on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width:viewport.width, height:viewport.height });
    await mockCaptcha(page);
    await page.goto('/', { waitUntil:'domcontentloaded' });
    await expect(page.getByRole('heading',{ name:'Iniciar sesión', exact:true })).toBeVisible();
    await expect(page.getByRole('tab',{ name:/Equipo interno/i })).toBeVisible();
    await expect(page.getByRole('tab',{ name:/Cliente con licencia/i })).toBeVisible();
    await expect(page.locator('[data-captcha-question]')).toContainText('8 + 4');
    await expectNoPageOverflow(page);
    if (viewport.name === 'android-compact') {
      await page.screenshot({ path:'test-results/v11-14-login-android-344.png', fullPage:true });
    }
  });
}

test('client link exposes only licensed-client access on mobile', async ({ page }) => {
  await page.setViewportSize({ width:344, height:760 });
  await mockCaptcha(page);
  await page.goto('/cliente', { waitUntil:'domcontentloaded' });
  await expect(page.getByRole('heading',{ name:'Acceso de cliente', exact:true })).toBeVisible();
  await expect(page.getByText('Cliente con licencia',{ exact:true }).first()).toBeVisible();
  await expect(page.locator('[data-login-access="staff"]')).toHaveCount(0);
  await expect(page.locator('[name="licenseKey"]')).toBeVisible();
  await expect(page.locator('[name="licenseKey"]')).toHaveAttribute('required','');
  await expectNoPageOverflow(page);
  await page.screenshot({ path:'test-results/v11-14-cliente-android-344.png', fullPage:true });
});

test('public PWA manifest exposes Chromium installability fields', async ({ request }) => {
  const manifestResponse = await request.get('/manifest.webmanifest');
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.display).toBe('standalone');
  expect(manifest.start_url).toBe('/?source=pwa');
  expect(manifest.prefer_related_applications).toBe(false);
  expect(manifest.icons.some((icon) => String(icon.sizes).includes('192x192'))).toBeTruthy();
  expect(manifest.icons.some((icon) => String(icon.sizes).includes('512x512'))).toBeTruthy();

  for (const iconPath of ['/icons/contagest-app-192.svg','/icons/contagest-app-512.svg']) {
    const icon = await request.get(iconPath);
    expect(icon.ok()).toBeTruthy();
    expect(icon.headers()['content-type']).toContain('image/svg+xml');
  }

  const worker = await request.get('/sw.js');
  expect(worker.ok()).toBeTruthy();
  expect(await worker.text()).toContain('contagest-ve-v11-14-0');
});
