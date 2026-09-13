import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { renderCommandCenterModel } from '../frontend/public/hipico-control/assets/js/command-center.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const emptyLocal = { group: null, groupKey: '', meeting: null, currentRace: null, nextRace: null, localQueue: 0, localConflicts: 0 };

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

test('Command Center renders explicit loading, empty, error, success and disabled states', () => {
  const loading = renderCommandCenterModel({ local: emptyLocal, remote: null, online: true, status: 'loading' });
  assert.match(loading, /data-command-status="loading"/);
  assert.match(loading, /Cargando estado remoto/);

  const empty = renderCommandCenterModel({ local: emptyLocal, remote: readyRemote(), online: true, status: 'ready' });
  assert.match(empty, /data-command-empty/);
  assert.match(empty, /Sin grupo activo configurado/);

  const error = renderCommandCenterModel({ local: emptyLocal, remote: null, online: true, status: 'error', error: 'remote_status_unavailable' });
  assert.match(error, /data-command-status="error"/);
  assert.match(error, /No se pudo actualizar el estado remoto/);

  const success = renderCommandCenterModel({ local: { ...emptyLocal, group: { name: 'Grupo A' }, groupKey: 'grupo-a' }, remote: readyRemote(), online: true, status: 'ready' });
  assert.match(success, /data-command-status="ready"/);
  assert.match(success, /Operativo/);

  const disabled = renderCommandCenterModel({ local: emptyLocal, remote: readyRemote(), online: true, status: 'ready' });
  assert.match(disabled, /Proveedor[\s\S]*Deshabilitado/);
});

test('Command Center keeps an accessible manual refresh action and stale/offline messaging', async () => {
  const source = await read('frontend/public/hipico-control/assets/js/command-center.js');
  assert.match(source, /data-action="refresh-command-center"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /remoteState\.data/);
  assert.match(source, /Datos remotos conservados|Última muestra remota conservada/);
  assert.match(source, /document\.addEventListener\('click'/);
});
