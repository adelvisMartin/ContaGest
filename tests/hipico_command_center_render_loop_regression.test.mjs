import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const shellPath = 'frontend/public/hipico-control/assets/js/command-center-shell.js';
const source = () => fs.readFileSync(shellPath, 'utf8');

test('Control Hípico command center ignores its own DOM mutations', () => {
  const code = source();

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
  const code = source();
  const observerStart = code.indexOf('new MutationObserver');
  assert.ok(observerStart >= 0, 'MutationObserver must remain installed');

  const observerSlice = code.slice(observerStart, observerStart + 700);
  assert.match(observerSlice, /scheduleMount\(\)/, 'external app mutations must still schedule a mount');
  assert.match(observerSlice, /childList:\s*true/);
  assert.match(observerSlice, /subtree:\s*true/);
});
