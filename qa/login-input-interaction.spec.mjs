import { test, expect } from '@playwright/test';

async function mockCaptcha(page) {
  await page.route('**/api/v1/auth/captcha', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      data: {
        kind: 'math',
        question: '11 × 4',
        prompt: '¿Cuánto es 11 × 4?',
        token: 'qa-login-input-token-with-more-than-twenty-characters.signature',
        expiresAt: Date.now() + 300000,
        refreshAfterSeconds: 300
      },
      meta: {}
    })
  }));
}

for (const viewport of [
  { name: 'desktop', width: 1366, height: 768 },
  { name: 'mobile', width: 390, height: 844 }
]) {
  test(`login credential inputs accept and preserve typing on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mockCaptcha(page);
    await page.goto('/?module=login', { waitUntil: 'domcontentloaded' });

    const rif = page.locator('#loginForm input[name="tenantRif"]');
    const email = page.locator('#loginForm input[name="email"]');
    const password = page.locator('#loginForm input[name="password"]');
    const captcha = page.locator('#loginForm input[name="captchaAnswer"]');

    for (const field of [rif, email, password, captcha]) {
      await expect(field).toBeVisible();
      await expect(field).toBeEditable();
    }

    await rif.click();
    await rif.pressSequentially('00000000', { delay: 12 });
    await expect(rif).toHaveValue('00000000');

    await email.click();
    await email.pressSequentially('admin@erp.local', { delay: 12 });
    await expect(email).toHaveValue('admin@erp.local');

    await password.click();
    await password.pressSequentially('QaOnly!2026-NotARealPassword', { delay: 8 });
    await expect(password).toHaveValue('QaOnly!2026-NotARealPassword');

    await captcha.click();
    await captcha.pressSequentially('44', { delay: 12 });
    await expect(captcha).toHaveValue('44');

    await email.focus();
    await expect(email).toBeFocused();
    await page.keyboard.press('End');
    await page.keyboard.type('.qa');
    await expect(email).toHaveValue('admin@erp.local.qa');

    const nativeLayer = await page.evaluate(() => ({
      rifDisplay: getComputedStyle(document.querySelector('#loginForm input[name="tenantRif"]')).display,
      muiMountDisplay: getComputedStyle(document.querySelector('#loginForm input[name="tenantRif"]')?.parentElement?.querySelector('[data-mui-native-mount]')).display
    }));
    expect(nativeLayer.rifDisplay).not.toBe('none');
    expect(nativeLayer.muiMountDisplay).toBe('none');
  });
}
