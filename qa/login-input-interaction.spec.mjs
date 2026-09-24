import { test, expect } from '@playwright/test';

async function mockCaptcha(page) {
  await page.route('**/api/v1/auth/captcha', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok:true, data:{ kind:'math', question:'11 × 4', prompt:'¿Cuánto es 11 × 4?', token:'qa-token.signature-placeholder', expiresAt:Date.now()+300000, refreshAfterSeconds:300 }, meta:{} })
  }));
}

async function mockDelayedBcvRefresh(page) {
  await page.route('**/api/v1/currency/bcv', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 450));
    await route.fulfill({ status:200, contentType:'application/json', body:JSON.stringify({ ok:true, data:{ rate:250.25, source:'QA delayed BCV refresh', updatedAt:new Date().toISOString() } }) });
  });
}

for (const viewport of [
  { name:'desktop', width:1366, height:768 },
  { name:'mobile', width:390, height:844 }
]) {
  test(`login form controls are not hijacked by router and keep focus on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width:viewport.width, height:viewport.height });
    await mockCaptcha(page);
    await mockDelayedBcvRefresh(page);
    await page.goto('/?module=login', { waitUntil:'domcontentloaded' });

    const form=page.locator('#loginForm');
    const rif=form.locator('input[name="tenantRif"]');
    const email=form.locator('input[name="email"]');
    const password=form.locator('input[name="password"]');
    const captcha=form.locator('input[name="captchaAnswer"]');

    await expect(form).toHaveAttribute('data-no-mui','true');
    await expect(form.locator('[data-login-native-field]')).toHaveCount(4);
    await expect(form.locator('[data-mui-native-mount]')).toHaveCount(0);

    for (const field of [rif,email,password,captcha]) {
      await expect(field).toBeVisible();
      await expect(field).toBeEditable();
    }

    await page.evaluate(() => {
      window.__cgOriginalRif = document.querySelector('#loginForm input[name="tenantRif"]');
      window.__cgCredentialClickPrevented = null;
      document.addEventListener('click', (event) => {
        if (event.target?.matches?.('#loginForm input[name="tenantRif"],#loginForm input[name="email"],#loginForm input[name="password"],#loginForm input[name="captchaAnswer"]')) {
          window.__cgCredentialClickPrevented = event.defaultPrevented;
        }
      });
    });

    await rif.click();
    await expect(rif).toBeFocused();
    await expect.poll(() => page.evaluate(() => window.__cgCredentialClickPrevented)).toBe(false);
    expect(await page.evaluate(() => window.__cgOriginalRif === document.querySelector('#loginForm input[name="tenantRif"]'))).toBe(true);

    await rif.pressSequentially('0000',{delay:180});
    await expect(rif).toBeFocused();
    await expect(rif).toHaveValue('0000');
    expect(await page.evaluate(() => window.__cgOriginalRif === document.querySelector('#loginForm input[name="tenantRif"]'))).toBe(true);
    await rif.pressSequentially('0000',{delay:120});
    await expect(rif).toHaveValue('00000000');

    await email.click();
    await expect(email).toBeFocused();
    await email.pressSequentially('qa.user@example.test',{delay:90});
    await expect(email).toHaveValue('qa.user@example.test');
    await expect(email).toBeFocused();

    await password.click();
    await expect(password).toBeFocused();
    await password.pressSequentially('Synthetic-QA-Value-2026',{delay:45});
    await expect(password).toHaveValue('Synthetic-QA-Value-2026');
    await expect(password).toBeFocused();
    await expect(captcha).not.toBeFocused();

    await captcha.click();
    await expect(captcha).toBeFocused();
    await captcha.pressSequentially('44',{delay:90});
    await expect(captcha).toHaveValue('44');
    await expect(captcha).toBeFocused();
  });
}
