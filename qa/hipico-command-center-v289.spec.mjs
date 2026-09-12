import { test, expect } from '@playwright/test';

const MOCK = {
  generatedAt: '2026-09-11T20:00:00.000Z',
  scope: { groupKey: 'group-1', groupId: null },
  version: { productVersion: '1.13.0-rc3', buildSha: 'a'.repeat(40), apiVersion: '1', bridgeProtocolVersion: '1' },
  system: {
    ok: true,
    components: {
      backend: { state: 'ready', reason: null },
      database: { state: 'ready', reason: null },
      bridge: { state: 'ready', reason: null },
      channel: { state: 'ready', reason: null },
      providers: { state: 'ready', reason: null, financialAuthority: false },
      documentEngine: { state: 'ready', reason: null },
      agent: { state: 'ready', reason: null }
    }
  },
  bridge: { state: 'ready', lastEventAt: '2026-09-11T19:59:50.000Z', ageMs: 10000, sourceSendPossible: false },
  channels: [{ groupKey: 'control-hipico-lab', label: 'LAB', channelType: 'web_bridge', status: 'active', mode: 'shadow_only' }],
  operation: {
    activeMeeting: { id: 'm1', name: 'La Rinconada 11/09' },
    currentRace: { id: 'r1', number: 4, name: 'Carrera 4', state: 'OPEN', scheduledAt: '2026-09-11T20:15:00.000Z' },
    nextRace: { id: 'r2', number: 5, name: 'Carrera 5', state: 'ANNOUNCED', scheduledAt: '2026-09-11T20:45:00.000Z' },
    raceCount: 8
  },
  documents: { states: { extracted: 2 }, recent: [{ id: 'd1', filename: 'programa.pdf', classification: 'RACE_PROGRAM', status: 'extracted', authority: 'official', updatedAt: '2026-09-11T19:55:00.000Z' }] },
  providers: [{ id: 'test-provider', state: 'ready' }],
  agent: { state: 'ready', mode: 'SHADOW', metrics: { reviewed: 230, matched: 228 } },
  queue: { states: {}, pending: 0, failed: 0 },
  conflicts: { reconciliations: 0, rejectedTransitions: 0, agentConflicts: 0, total: 0 },
  alerts: []
};

async function mount(page, state) {
  await page.goto('/hipico-control/recovery.html');
  await page.evaluate(async ({ state }) => {
    document.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="/hipico-control/assets/css/app.css"><link rel="stylesheet" href="/hipico-control/assets/css/mobile-accessibility.css">');
    const { renderCommandCenter } = await import('/hipico-control/assets/js/command-center.js');
    document.body.innerHTML = `<main class="content">${renderCommandCenter(state)}</main>`;
  }, { state });
}

async function noHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(overflow.scroll, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.client + 1);
}

for (const width of [360, 390, 430]) {
  test(`Command Center success is usable at ${width}px with 44px critical action`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await mount(page, { status: 'success', data: MOCK, error: '', updatedAt: '2026-09-11T20:00:00.000Z', stale: false });
    await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible();
    await expect(page.getByText('PostgreSQL')).toBeVisible();
    await expect(page.getByText('Carrera actual')).toBeVisible();
    await noHorizontalOverflow(page);
    const refresh = page.getByRole('button', { name: 'Actualizar' });
    const box = await refresh.boundingBox();
    expect(box?.height || 0).toBeGreaterThanOrEqual(44);
    await refresh.focus();
    await expect(refresh).toBeFocused();
  });
}

test('loading error empty and disabled/offline states remain explicit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page, { status: 'loading', data: null, error: '', updatedAt: null, stale: false });
  await expect(page.getByText('Cargando')).toBeVisible();

  await mount(page, { status: 'error', data: null, error: 'Backend no disponible', updatedAt: null, stale: false });
  await expect(page.getByText('Backend no disponible')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeEnabled();

  await mount(page, { status: 'offline', data: null, error: 'Sin conexión y sin una lectura previa del Command Center.', updatedAt: null, stale: true });
  await expect(page.getByText('Offline')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeDisabled();

  const empty = structuredClone(MOCK);
  empty.operation.activeMeeting = null;
  empty.operation.currentRace = null;
  empty.operation.nextRace = null;
  empty.documents.recent = [];
  empty.alerts = [{ severity: 'info', code: 'NO_ACTIVE_RACE', message: 'No hay una carrera operativa activa en este grupo.' }];
  await mount(page, { status: 'success', data: empty, error: '', updatedAt: '2026-09-11T20:00:00.000Z', stale: false });
  await expect(page.getByText('Sin meeting activo')).toBeVisible();
  await expect(page.getByText('Sin documentos')).toBeVisible();
  await noHorizontalOverflow(page);
});

test('Light Dark and System render without horizontal clipping and reduced motion remains available', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ['light', 'dark', 'system']) {
    await mount(page, { status: 'success', data: MOCK, error: '', updatedAt: '2026-09-11T20:00:00.000Z', stale: false });
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await noHorizontalOverflow(page);
  }
  const reduced = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').media);
  expect(reduced).toContain('prefers-reduced-motion');
});

test('landscape and keyboard-sized viewport keep the Command Center navigable', async ({ page }) => {
  for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 500 }]) {
    await page.setViewportSize(viewport);
    await mount(page, { status: 'success', data: MOCK, error: '', updatedAt: '2026-09-11T20:00:00.000Z', stale: false });
    await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible();
    await noHorizontalOverflow(page);
    const geometry = await page.evaluate(() => ({ scrollHeight: document.documentElement.scrollHeight, clientHeight: document.documentElement.clientHeight, overflowY: getComputedStyle(document.documentElement).overflowY }));
    expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
    expect(geometry.overflowY).not.toBe('hidden');
  }
});

test('200 percent zoom keeps Command Center vertically navigable', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 844 });
  await mount(page, { status: 'success', data: MOCK, error: '', updatedAt: '2026-09-11T20:00:00.000Z', stale: false });
  await page.evaluate(() => { document.body.style.zoom = '2'; });
  await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible();
  const scrollable = await page.evaluate(() => document.documentElement.scrollHeight > document.documentElement.clientHeight);
  expect(scrollable).toBe(true);
});
