import { test, expect } from '@playwright/test';

const MOCK = {
  generatedAt: '2026-09-13T20:00:00.000Z',
  scope: { groupKey: 'group-1' },
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
  bridge: { state: 'ready', lastEventAt: '2026-09-13T19:59:50.000Z', ageMs: 10000, sourceSendPossible: false },
  channels: {
    state: 'ready',
    items: [{ groupKey: 'group-1', label: 'LAB', channelType: 'web_bridge', status: 'active', mode: 'shadow_only' }]
  },
  operation: {
    state: 'ready',
    activeMeeting: { id: 'm1', name: 'La Rinconada 13/09' },
    currentRace: { id: 'r1', number: 4, name: 'Carrera 4', state: 'OPEN', scheduledAt: '2026-09-13T20:15:00.000Z' },
    nextRace: { id: 'r2', number: 5, name: 'Carrera 5', state: 'ANNOUNCED', scheduledAt: '2026-09-13T20:45:00.000Z' },
    meetings: [{ id: 'm1', name: 'La Rinconada 13/09' }],
    raceCount: 8
  },
  documents: {
    state: 'ready',
    states: { extracted: 2 },
    recent: [{ id: 'd1', filename: 'programa.pdf', classification: 'RACE_PROGRAM', status: 'extracted', authority: 'official', updatedAt: '2026-09-13T19:55:00.000Z' }]
  },
  providers: { state: 'ready', items: [{ id: 'test-provider', state: 'ready' }], financialAuthority: false },
  agent: { state: 'ready', mode: 'SHADOW', metrics: { reviewed: 230, matched: 228 } },
  queue: { state: 'ready', states: {}, pending: 0, failed: 0 },
  conflicts: { state: 'ready', reconciliations: 0, rejectedTransitions: 0, agentConflicts: 0, total: 0 },
  alerts: []
};

async function mount(page, state) {
  await page.goto('/hipico-control/recovery.html');
  await page.evaluate(async ({ state }) => {
    document.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="/hipico-control/assets/css/app.css"><link rel="stylesheet" href="/hipico-control/assets/css/mobile-accessibility.css">');
    const { renderCommandCenter } = await import('/hipico-control/assets/js/command-center.js');
    document.body.innerHTML = `<main class="content" aria-label="QA Command Center">${renderCommandCenter(state)}</main>`;
  }, { state });
}

async function noHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(overflow.scroll, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.client + 1);
}

for (const width of [360, 390, 393, 430, 768, 1024, 1440]) {
  test(`Command Center success is usable at ${width}px with accessible critical action`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await mount(page, { status: 'success', data: MOCK, error: '', updatedAt: '2026-09-13T20:00:00.000Z', stale: false });
    await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible();
    await expect(page.getByText('PostgreSQL')).toBeVisible();
    await expect(page.getByText('Carrera actual')).toBeVisible();
    await expect(page.getByText('SOURCE · SOLO LECTURA')).toBeVisible();
    await noHorizontalOverflow(page);
    const refresh = page.getByRole('button', { name: 'Actualizar' });
    const box = await refresh.boundingBox();
    if (width <= 900) expect(box?.height || 0).toBeGreaterThanOrEqual(44);
    await refresh.focus();
    await expect(refresh).toBeFocused();
  });
}

test('loading error offline disabled stale and empty states remain explicit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await mount(page, { status: 'loading', data: null, error: '', updatedAt: null, stale: false });
  await expect(page.getByText('Cargando')).toBeVisible();
  await expect(page.locator('[data-command-center]')).toHaveAttribute('aria-busy', 'true');

  await mount(page, { status: 'error', data: null, error: 'Backend no disponible', updatedAt: null, stale: false });
  await expect(page.getByText('Backend no disponible')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeEnabled();

  await mount(page, { status: 'offline', data: null, error: 'Sin conexión y sin una lectura previa del Command Center.', updatedAt: null, stale: true });
  await expect(page.getByText('Offline')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeDisabled();

  await mount(page, { status: 'disabled', data: null, error: 'Selecciona un grupo válido.', updatedAt: null, stale: false });
  await expect(page.getByText('Deshabilitado')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Actualizar' })).toBeDisabled();

  await mount(page, { status: 'stale', data: MOCK, error: 'No se pudo confirmar la lectura.', updatedAt: '2026-09-13T20:00:00.000Z', stale: true });
  await expect(page.getByText(/Datos del Command Center sin confirmar/)).toBeVisible();

  const empty = structuredClone(MOCK);
  empty.operation.activeMeeting = null;
  empty.operation.currentRace = null;
  empty.operation.nextRace = null;
  empty.operation.meetings = [];
  empty.operation.raceCount = 0;
  empty.documents.recent = [];
  empty.channels.items = [];
  empty.alerts = [];
  await mount(page, { status: 'empty', data: empty, error: '', updatedAt: '2026-09-13T20:00:00.000Z', stale: false });
  await expect(page.getByText('Sin datos operativos')).toBeVisible();
  await expect(page.getByText('Sin documentos')).toBeVisible();
  await noHorizontalOverflow(page);
});

test('unavailable and not-configured components are textual and never represented as healthy zero', async ({ page }) => {
  const degraded = structuredClone(MOCK);
  degraded.system.ok = false;
  degraded.system.components.database = { state: 'unavailable', reason: 'DATABASE_READ_FAILED' };
  degraded.agent = { state: 'not_configured', reason: 'GROUP_ID_NOT_CONFIGURED', mode: null, metrics: null };
  degraded.queue = { state: 'unavailable', states: null, pending: null, failed: null };
  degraded.conflicts = { state: 'unavailable', reconciliations: null, rejectedTransitions: null, agentConflicts: null, total: null };
  await page.setViewportSize({ width: 430, height: 844 });
  await mount(page, { status: 'success', data: degraded, error: '', updatedAt: '2026-09-13T20:00:00.000Z', stale: false });
  await expect(page.getByText('No disponible').first()).toBeVisible();
  await expect(page.getByText('Sin configurar')).toBeVisible();
  await expect(page.getByText('Cola pendiente').locator('..').getByText('No disponible')).toBeVisible();
});

test('Light Dark and System render without horizontal clipping and reduced motion remains available', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ['light', 'dark', 'system']) {
    await mount(page, { status: 'success', data: MOCK, error: '', updatedAt: '2026-09-13T20:00:00.000Z', stale: false });
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; }, theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await noHorizontalOverflow(page);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  expect(reduced).toBe(true);
});

test('landscape and keyboard-sized viewport keep the Command Center vertically navigable', async ({ page }) => {
  for (const viewport of [{ width: 844, height: 390 }, { width: 390, height: 500 }]) {
    await page.setViewportSize(viewport);
    await mount(page, { status: 'success', data: MOCK, error: '', updatedAt: '2026-09-13T20:00:00.000Z', stale: false });
    await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible();
    await noHorizontalOverflow(page);
    const geometry = await page.evaluate(() => ({ scrollHeight: document.documentElement.scrollHeight, clientHeight: document.documentElement.clientHeight, overflowY: getComputedStyle(document.documentElement).overflowY }));
    expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
    expect(geometry.overflowY).not.toBe('hidden');
  }
});

test('200 percent zoom keeps Command Center vertically navigable', async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 844 });
  await mount(page, { status: 'success', data: MOCK, error: '', updatedAt: '2026-09-13T20:00:00.000Z', stale: false });
  await page.evaluate(() => { document.body.style.zoom = '2'; });
  await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible();
  const geometry = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
    overflowY: getComputedStyle(document.documentElement).overflowY
  }));
  expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
  expect(geometry.overflowY).not.toBe('hidden');
});
