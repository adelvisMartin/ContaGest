import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const indexPath = 'frontend/public/hipico-control/index.html';
const serviceWorkerPath = 'frontend/public/hipico-control/sw.js';
const updateCoordinatorPath = 'frontend/public/hipico-control/assets/js/pwa-update.js';

const read = (path) => fs.readFileSync(path, 'utf8');

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
});

test('Control Hípico immediately checks and promotes waiting workers without deleting user data', () => {
  const code = read(updateCoordinatorPath);

  assert.match(code, /navigator\.serviceWorker\.getRegistration\(\)/);
  assert.match(code, /registration\.waiting\.postMessage\(\{\s*type:\s*['"]SKIP_WAITING['"]\s*\}\)/);
  assert.match(code, /registration\.update\(\)/);
  assert.doesNotMatch(code, /clearLocalWorkspace|indexedDB\.deleteDatabase|localStorage\.clear|sessionStorage\.clear/);
});
