import { test, expect } from '@playwright/test';

const emptyLocal = { group: null, groupKey: '', meeting: null, currentRace: null, nextRace: null, localQueue: 0, localConflicts: 0 };
const activeLocal = { ...emptyLocal, group: { id: 'group-1', name: 'Grupo QA' }, groupKey: 'group-1' };

function readyRemote(overrides = {}) {
  return {
    sampledAt: '2026-09-13T19:00:00.000Z',
    system: { state: 'ready', backendReachable: true },
    bridge: { state: 'ready', ready: true },
    channel: { state: 'known', available: true },
    database: { state: 'ready', ready: true },
    providers: { state: 'disabled', provider: 'disabled' },
    agent: { state: 'known', mode: 'shadow' },
    documents: { state: 'not_exposed', available: false },
    queue: { available: true, total: 0 },
    conflicts: { available: true, reconciliationRequired: 0 },
    races: { available: true, state: 'ready', total: 0 },
    alerts: [],
    ...overrides
  };
}

async function renderModel(page, input) {
  await page.goto('/hipico-control/recovery.html');
  const html = await page.evaluate(async (modelInput) => {
    const module = await import('/hipico-control/assets/js/command-center.js');
    return module.renderCommandCenterModel(modelInput);
  }, input);
  await page.setContent(`<main>${html}</main>`);
  return page.locator('[data-command-center]');
}

test('Command Center renders loading, empty, error, success and disabled operational states', async ({ page }) => {
  let center = await renderModel(page, { local: activeLocal, remote: null, online: true, status: 'loading' });
  await expect(center).toHaveAttribute('data-command-status', 'loading');
  await expect(center.getByRole('status')).toContainText('Cargando estado remoto');
  await expect(center.getByRole('button', { name: 'Actualizar Centro de operaciones' })).toBeDisabled();

  center = await renderModel(page, { local: emptyLocal, remote: readyRemote(), online: true, status: 'ready' });
  await expect(center).toHaveAttribute('data-command-empty', '');
  await expect(center.getByRole('status')).toContainText('Sin grupo activo configurado');

  center = await renderModel(page, { local: activeLocal, remote: null, online: true, status: 'error', error: 'remote_status_unavailable' });
  await expect(center).toHaveAttribute('data-command-status', 'error');
  await expect(center.getByRole('status')).toContainText('No se pudo actualizar el estado remoto');

  center = await renderModel(page, { local: activeLocal, remote: readyRemote(), online: true, status: 'ready' });
  await expect(center).toHaveAttribute('data-command-status', 'ready');
  await expect(center).toContainText('Operativo');
  await expect(center.getByRole('button', { name: 'Actualizar Centro de operaciones' })).toBeEnabled();
  await expect(center).toContainText('Deshabilitado');
});

test('Command Center preserves a visible stale remote snapshot when offline', async ({ page }) => {
  const center = await renderModel(page, { local: activeLocal, remote: readyRemote(), online: false, status: 'offline', error: 'offline' });
  await expect(center).toHaveAttribute('data-command-status', 'offline');
  await expect(center.getByRole('status')).toContainText('Última muestra remota conservada');
  await expect(center).toContainText('SIN CONEXIÓN · DATOS CONSERVADOS');
  await expect(center).toContainText('Operativo');
});

test('Command Center refresh remains keyboard focusable outside loading state', async ({ page }) => {
  const center = await renderModel(page, { local: activeLocal, remote: readyRemote(), online: true, status: 'ready' });
  const refresh = center.getByRole('button', { name: 'Actualizar Centro de operaciones' });
  await refresh.focus();
  await expect(refresh).toBeFocused();
});
