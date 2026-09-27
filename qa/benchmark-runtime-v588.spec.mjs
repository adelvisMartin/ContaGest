import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { AccessControlService } from '../frontend/src/services/accessControlService.js';
import { fixtureForRequest, fixtureMetadata } from './support/erp-system-fixtures-v155.mjs';
import { waitForRouteReady, waitForStableLayout } from './support/playwright-determinism.mjs';

const candidateSha = String(process.env.CANDIDATE_SHA || '').trim();
if (!/^[a-f0-9]{40}$/i.test(candidateSha)) throw new Error('CANDIDATE_SHA_REQUIRED_40_HEX');

const evidenceDir = path.resolve('artifacts/qa/benchmark-v588');
fs.mkdirSync(evidenceDir, { recursive: true });

function roleSession(roleName) {
  const rbac = AccessControlService.defaultState();
  const userId = roleName === 'admin' ? 'user-admin' : 'user-readonly-demo';
  rbac.activeUserId = userId;
  const user = rbac.users.find((item) => item.id === userId);
  const role = rbac.roles.find((item) => item.id === user?.roleId);
  if (!user || !role) throw new Error(`RBAC_FIXTURE_NOT_FOUND:${roleName}`);
  return {
    rbac,
    session: {
      sessionMode: 'cookie', mode: 'cookie', tenantId: 'qa-v588-tenant',
      tenant: { id: 'qa-v588-tenant', name: 'Synthetic V588', rif: 'J-00000000-0', plan: 'enterprise' },
      user: { id: user.id, name: user.fullName, fullName: user.fullName, email: `${roleName}@example.test`, role: roleName, permissions: [...role.permissions] },
      audience: 'staff', expiresAt: Date.now() + 3_600_000,
    },
  };
}

async function installSyntheticRuntime(page, roleName, stateRef) {
  const { rbac, session } = roleSession(roleName);
  await page.addInitScript(({ auth, store }) => {
    localStorage.setItem('contagest_auth_session', JSON.stringify(auth));
    localStorage.setItem('contagest_ve_enterprise_v7_state', JSON.stringify({ rbac: store, settings: { theme: 'light', businessMode: 'admin' } }));
  }, { auth: session, store: rbac });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/auth/me')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: session }) });
    }
    if (pathname.endsWith('/auth/captcha')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: { token: 'synthetic-v588-captcha', question: '2 + 2', prompt: 'Resuelve 2 + 2', expiresAt: new Date(Date.now() + 300_000).toISOString() } }) });
    }
    const fixture = fixtureForRequest({ url: request.url(), method: request.method(), state: stateRef.value, body: request.postDataJSON?.() || null });
    return route.fulfill({ status: fixture.status, contentType: 'application/json', body: JSON.stringify(fixture.body) });
  });
  return { rbac, session };
}

async function openModule(page, route, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(`/?module=${encodeURIComponent(route)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(route === 'login' ? '.login-shell' : '#app', { state: 'attached', timeout: 20_000 });
  await waitForRouteReady(page, route, { standalone: route === 'login' });
  await waitForStableLayout(page, route === 'login' ? '.login-shell' : '#pages');
}

async function basicInteractionAudit(page) {
  await page.keyboard.press('Tab');
  const result = await page.evaluate(() => ({
    route: document.body.dataset.route || '',
    focused: document.activeElement !== document.body && document.activeElement !== document.documentElement,
    overflow: document.documentElement.scrollWidth > innerWidth + 2,
    dialogs: document.querySelectorAll('[role="dialog"]:not([hidden])').length,
  }));
  expect(result.focused).toBe(true);
  expect(result.overflow).toBe(false);
  return result;
}

for (const viewport of [{ name: 'desktop-1366', width: 1366, height: 768 }, { name: 'mobile-390', width: 390, height: 844 }]) {
  test(`login + first productive surface is keyboard-safe · ${viewport.name}`, async ({ page }) => {
    const stateRef = { value: 'baseline' };
    await installSyntheticRuntime(page, 'admin', stateRef);
    await openModule(page, 'dashboard', viewport);
    const audit = await basicInteractionAudit(page);
    expect(audit.route).toBe('dashboard');
  });

  test(`restricted role cannot render admin module · ${viewport.name}`, async ({ page }) => {
    const stateRef = { value: 'baseline' };
    const { rbac } = await installSyntheticRuntime(page, 'read-only', stateRef);
    expect(AccessControlService.canAccessRoute({ rbac }, 'admin')).toBe(false);
    await openModule(page, 'admin', viewport);
    const actual = await page.locator('body').getAttribute('data-route');
    expect(actual).not.toBe('admin');
    expect((await page.locator('body').innerText()).includes('J-00000000-0')).toBe(false);
  });
}

test('critical financial/report surfaces render synthetic empty/error states without leaking runtime errors', async ({ page }) => {
  const stateRef = { value: 'empty' };
  await installSyntheticRuntime(page, 'admin', stateRef);
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error?.message || error)));
  for (const route of ['ventas', 'bancos', 'estados-financieros']) {
    for (const state of ['empty', 'error']) {
      stateRef.value = state;
      await openModule(page, route, { width: 1366, height: 768 });
      await expect(page.locator('#pages')).toBeVisible();
      expect(await page.locator('#pages').innerText()).not.toBe('');
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2)).toBe(false);
    }
  }
  expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
});

test.afterAll(() => {
  fs.writeFileSync(path.join(evidenceDir, 'browser-meta.json'), `${JSON.stringify({
    ticket: '#588', candidateSha, browser: 'chromium', fixtures: fixtureMetadata(), syntheticOnly: true,
    viewports: ['1366x768', '390x844'], capturedAt: new Date().toISOString(),
  }, null, 2)}\n`);
});
