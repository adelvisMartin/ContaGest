import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { nodeSupported } from '../scripts/rea-local-install.mjs';

const script = fileURLToPath(new URL('../scripts/rea-local-install.mjs', import.meta.url));
function run(...args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}

test('supported upstream Node ranges are enforced before any download', () => {
  for (const version of ['v22.19.0', 'v22.22.1', 'v24.11.0', 'v26.0.0', 'v28.2.4']) {
    assert.equal(nodeSupported(version), true, version);
  }
  for (const version of ['v22.16.0', 'v22.18.9', 'v24.10.9', 'v25.5.0', 'v20.20.0', 'malformed']) {
    assert.equal(nodeSupported(version), false, version);
  }
});

test('read-only plan declares exact pinned version, isolated prefix, external prerequisites', () => {
  const result = run('plan');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /rea-agents@6\.5\.0/);
  assert.match(result.stdout, /\.local-tools[\\/]rea/);
  assert.match(result.stdout, /No global tools, Node upgrade, MCP registration/);
});

test('invalid commands fail closed without invoking npm or REA', () => {
  const result = run('untrusted-command');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /REA_LOCAL_BLOCKED: Usage/);
});

test('unsupported Node blocks installation; plan remains available', () => {
  assert.equal(run('plan').status, 0);
  if (!nodeSupported(process.version)) {
    const result = run('install');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Node .* unsupported by REA/);
  }
});
