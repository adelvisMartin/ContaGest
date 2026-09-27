import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(path, 'utf8');

test('#570 tenant DB health probe exposes bounded readiness only', () => {
  const source = read('backend/src/modules/index.ts');

  assert.match(source, /router\.get\('\/health\/db', requireTenant/);
  assert.match(source, /select 1 as ready/);
  assert.match(source, /ready: result\[0\]\?\.ready === 1/);
  assert.doesNotMatch(source, /current_database\(\)/);
  assert.doesNotMatch(source, /current_schema\(\)/);
  assert.doesNotMatch(source, /schema:/);
});
