import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { AccessControlService } from '../frontend/src/services/accessControlService.js';
import { fixtureForRequest, fixtureMetadata } from './support/erp-system-fixtures-v155.mjs';
import { waitForRouteReady, waitForStableLayout } from './support/playwright-determinism.mjs';

const sha = String(process.env.CANDIDATE_SHA || '').trim();
if (!/^[a-f0-9]{40}$/i.test(sha)) throw new Error('CANDIDATE_SHA_REQUIRED_40_HEX');
const out = path.resolve('artifacts/qa/benchmark-v590');
fs.mkdirSync(out, { recursive: true });

const verticals = [
  { id: 'odontologia', route: 'odontologia', restrictedUser: 'user-readonly-demo' },
  { id: 'gimnasio', route: 'gimnasio', restrictedUser: 'user-readonly-demo' },
  { id: 'veterinaria', route: 'veterinaria', restrictedUser: 'user-readonly-demo' },
];
const viewports = [
  { name: 'desktop-1366', width: 1366, height: 768 },
  { name: 'mobile-390', width: 390, height: 844 },
];

function makeSession(userId) {
  const rbac = AccessControlService.defaultState();
  rbac.activeUserId = userId;
  const user = rbac.users.find((item) => item.id === userId);
  const role = rbac.roles.find((item) => item.id === user?.roleId);
  if (!user || !role) throw new Error(`RBAC_FIXTURE_NOT_FOUND:${userId}`);
  return {
    rbac,
    session: {
      sessionMode: 'cookie', mode: 'cookie', tenantId: 'qa-v590-tenant',
      tenant: { id: 'qa-v590-tenant', name: 'Synthetic V590', rif: 'J-00000000-0', plan: 'enterprise' },
      user: { id: user.id, name: user.fullName, fullName: user.fullName, email: `${user.id}@example.test`, role: userId === 'user-admin' ? 'admin' : 'staff', permissions: [...role.permissions] },
      audience: 'staff', expiresAt: Date.now() + 3_600_000,
    },
  };
}

async function installHarness(page, userId, stateRef) {
  const { rbac, session } = makeSession(userId);
  await page.addInitScript(({ auth, acl }) => {
    localStorage.setItem('contagest_auth_session', JSON.stringify(auth));
    localStorage.setItem('contagest_ve_enterprise_v7_state', JSON.stringify({ rbac: acl, settings: { theme: 'light', businessMode: 'admin' } }));
  }, { auth: session, acl: rbac });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith('/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: session }) });
    const fixture = fixtureForRequest({ url: request.url(), method: request.method(), state: stateRef.value, body: request.postDataJSON?.() || null });
    return route.fulfill({ status: fixture.status, contentType: 'application/json', body: JSON.stringify(fixture.body) });
  });
  return rbac;
}

async function open(page, route, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(`/?module=${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#app', { state: 'attached', timeout: 20_000 });
  await waitForRouteReady(page, route);
  await waitForStableLayout(page, '#pages');
}

for (const vertical of verticals) {
  for (const viewport of viewports) {
    test(`${vertical.id} synthetic responsive/runtime states · ${viewport.name}`, async ({ page }) => {
      const stateRef = { value: 'baseline' };
      await installHarness(page, 'user-admin', stateRef);
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(String(error?.message || error)));
      for (const state of ['baseline', 'loading', 'empty', 'error']) {
        stateRef.value = state;
        await open(page, vertical.route, viewport);
        await expect(page.locator('#pages')).toBeVisible();
        expect(await page.locator('#pages').innerText()).not.toBe('');
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2)).toBe(false);
        await page.keyboard.press('Tab');
        expect(await page.evaluate(() => document.activeElement !== document.body && document.activeElement !== document.documentElement)).toBe(true);
      }
      expect(pageErrors, JSON.stringify(pageErrors, null, 2)).toEqual([]);
    });

    test(`${vertical.id} restricted role is evaluated by the canonical RBAC service · ${viewport.name}`, async ({ page }) => {
      const stateRef = { value: 'baseline' };
      const rbac = await installHarness(page, vertical.restrictedUser, stateRef);
      const expectedAccess = AccessControlService.canAccessRoute({ rbac }, vertical.route);
      await open(page, vertical.route, viewport);
      const actual = await page.locator('body').getAttribute('data-route');
      if (expectedAccess) expect(actual).toBe(vertical.route);
      else expect(actual).not.toBe(vertical.route);
    });
  }
}

test.afterAll(() => {
  fs.writeFileSync(path.join(out, 'browser-meta.json'), `${JSON.stringify({
    ticket: '#590', candidateSha: sha, browser: 'chromium', syntheticOnly: true,
    verticals: verticals.map((item) => item.id), viewports: viewports.map((item) => `${item.width}x${item.height}`),
    states: ['baseline', 'loading', 'empty', 'error'], fixtures: fixtureMetadata(), capturedAt: new Date().toISOString(),
  }, null, 2)}\n`);
});
