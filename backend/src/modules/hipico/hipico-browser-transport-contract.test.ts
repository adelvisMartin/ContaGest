import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const security = readFileSync(new URL('../../shared/middleware/security.ts', import.meta.url), 'utf8');

test('browser clients may send only the Hípico operator and explicit group scope headers they need', () => {
  assert.match(security, /allowedHeaders:[\s\S]*['"]x-hipico-operator-token['"]/);
  assert.match(security, /allowedHeaders:[\s\S]*['"]x-hipico-group-key['"]/);
  assert.doesNotMatch(security, /allowedHeaders:[\s\S]*['"]x-hipico-bridge-token['"]/);
});
