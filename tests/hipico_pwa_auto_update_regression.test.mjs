import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const indexPath = 'frontend/public/hipico-control/index.html';
const serviceWorkerPath = 'frontend/public/hipico-control/sw.js';
const updateCoordinatorPath = 'frontend/public/hipico-control/assets/js/pwa-update.js';

const read = (path) => fs.readFileSync(path, 'utf8');

function createUpdateRuntime({ controlled = true, waiting = true } = {}) {
  const serviceWorkerListeners = new Map();
  const windowListeners = new Map();
  const messages = [];
  let reloads = 0;
  let updateChecks = 0;

  const registration = {
    waiting: waiting ? { postMessage: (message) => messages.push(message) } : null,
    update: async () => { updateChecks += 1; }
  };
  const serviceWorker = {
    controller: controlled ? { state: 'activated' } : null,
    addEventListener: (type, listener) => serviceWorkerListeners.set(type, listener),
    getRegistration: async () => registration
  };
  const windowObject = {
    location: { reload: () => { reloads += 1; } },
    addEventListener: (type, listener) => windowListeners.set(type, listener)
  };

  vm.runInNewContext(read(updateCoordinatorPath), {
    navigator: { serviceWorker, onLine: true },
    window: windowObject,
    console
  });

  return {
    async fireLoad() {
      windowListeners.get('load')?.();
      await new Promise((resolve) => setImmediate(resolve));
    },
    fireControllerChange() {
      serviceWorkerListeners.get('controllerchange')?.();
    },
    messages,
    reloadCount: () => reloads,
    updateCheckCount: () => updateChecks
  };
}

test('Control Hípico publishes the automatic PWA update coordinator in the versioned shell', () => {
  const index = read(indexPath);
  const serviceWorker = read(serviceWorkerPath);

  assert.match(
    index,
    /<script type="module" src="\.\/assets\/js\/app\.js"><\/script>[\s\S]*<script type="module" src="\.\/assets\/js\/pwa-update\.js"><\/script>/,
    'the update coordinator must load after app.js so the canonical app registration remains authoritative'
  );
  assert.match(
    serviceWorker,
    /shell-r29-auto-update-reload/,
    'this release must rotate the shell cache so already-installed clients receive the update coordinator'
  );
  assert.match(
    serviceWorker,
    /\.\/assets\/js\/pwa-update\.js/,
    'the update coordinator must be available offline as part of the atomic app shell'
  );
});

test('Control Hípico reloads an already-controlled page exactly once after a new worker takes control', () => {
  const code = read(updateCoordinatorPath);

  assert.match(code, /const\s+hadServiceWorkerController\s*=\s*Boolean\(navigator\.serviceWorker\.controller\)/);
  assert.match(code, /addEventListener\(['"]controllerchange['"]/);
  assert.match(code, /if\s*\(!hadServiceWorkerController\s*\|\|\s*reloadingForServiceWorkerUpdate\)\s*return/);
  assert.match(code, /reloadingForServiceWorkerUpdate\s*=\s*true/);
  assert.match(code, /window\.location\.reload\(\)/);

  const runtime = createUpdateRuntime({ controlled: true, waiting: true });
  runtime.fireControllerChange();
  runtime.fireControllerChange();
  assert.equal(runtime.reloadCount(), 1, 'controller takeover must trigger one reload, not a reload loop');
});

test('Control Hípico does not reload on the first service-worker installation', () => {
  const runtime = createUpdateRuntime({ controlled: false, waiting: false });
  runtime.fireControllerChange();
  assert.equal(runtime.reloadCount(), 0, 'first install must not interrupt a new user with an unnecessary reload');
});

test('Control Hípico immediately checks and promotes waiting workers without deleting user data', async () => {
  const code = read(updateCoordinatorPath);

  assert.match(code, /navigator\.serviceWorker\.getRegistration\(\)/);
  assert.match(code, /registration\.waiting\.postMessage\(\{\s*type:\s*['"]SKIP_WAITING['"]\s*\}\)/);
  assert.match(code, /registration\.update\(\)/);
  assert.doesNotMatch(code, /clearLocalWorkspace|indexedDB\.deleteDatabase|localStorage\.clear|sessionStorage\.clear/);

  const runtime = createUpdateRuntime({ controlled: true, waiting: true });
  await runtime.fireLoad();
  assert.equal(runtime.updateCheckCount(), 1);
  assert.equal(runtime.messages.length, 1);
  assert.equal(runtime.messages[0]?.type, 'SKIP_WAITING');
});
