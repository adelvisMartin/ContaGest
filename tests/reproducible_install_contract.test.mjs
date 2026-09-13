import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const rootPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

test('Vercel installs the exact locked workspace dependency graph on the repository Node contract', () => {
  assert.equal(rootPackage.engines?.node, '22.x');
  assert.equal(lock.lockfileVersion, 3);
  assert.deepEqual(lock.packages?.['']?.workspaces, ['frontend', 'backend']);
  assert.equal(lock.packages?.['']?.engines?.node, '22.x');
  assert.equal(vercel.installCommand, 'npm ci --no-audit --no-fund');
  assert.doesNotMatch(vercel.installCommand, /npm\s+install(?:\s|$)/);
});
