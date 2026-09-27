import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const shellPath = 'frontend/public/hipico-control/assets/js/command-center-shell.js';
const serviceWorkerPath = 'frontend/public/hipico-control/sw.js';
const shellSource = () => fs.readFileSync(shellPath, 'utf8');
const serviceWorkerSource = () => fs.readFileSync(serviceWorkerPath, 'utf8');

test('Control Hípico command center ignores its own DOM mutations', () => {
  const code = shellSource();

  assert.match(
    code,
    /function\s+isCommandCenterMutation\s*\(mutation[^)]*\)/,
    'the shell must classify mutations produced inside its own host'
  );
  assert.match(
    code,
    /target\s*===\s*host\s*\|\|\s*host\.contains\(target\)/,
    'the classifier must cover the host itself and descendants'
  );
  assert.match(
    code,
    /mutations\.every\(isCommandCenterMutation\)/,
    'the observer must ignore batches made exclusively by command-center rendering'
  );
});

test('Control Hípico command center still remounts for external app mutations', () => {
  const code = shellSource();
  const observerStart = code.indexOf('new MutationObserver');
  assert.ok(observerStart >= 0, 'MutationObserver must remain installed');

  const observerSlice = code.slice(observerStart, observerStart + 700);
  assert.match(observerSlice, /scheduleMount\(\)/, 'external app mutations must still schedule a mount');
  assert.match(observerSlice, /childList:\s*true/);
  assert.match(observerSlice, /subtree:\s*true/);
});

test('Control Hípico invalidates the cached shell that contained the render loop', () => {
  const code = serviceWorkerSource();

  assert.doesNotMatch(
    code,
    /r26-access-bootstrap-local-group-recovery/,
    'existing PWA clients must not keep the cache that contains the looping command-center shell'
  );
  assert.match(
    code,
    /r27-command-center-render-loop-fix/,
    'the service worker must publish a new shell cache revision for the hotfix'
  );
  assert.match(code, /command-center-shell\.js/);
});
