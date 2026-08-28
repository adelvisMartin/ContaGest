import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('diagnostic status uses shared redaction and health classifier', async () => {
  const source = await fs.readFile(new URL('../src/diagnostic-status.mjs', import.meta.url), 'utf8');
  assert.match(source, /classifyHealth/);
  assert.match(source, /deriveOperationalMetrics/);
  assert.match(source, /redactDiagnostic/);
  assert.match(source, /sourceSendPossible/);
  assert.match(source, /process\.exitCode/);
});
