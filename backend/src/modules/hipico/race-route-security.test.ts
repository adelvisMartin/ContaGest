import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const routes = readFileSync(new URL('./race.routes.ts', import.meta.url), 'utf8');

test('race query DTO exposes only public group scope and never leaks the internal owner id', () => {
  const queryRoute = routes.match(/router\.get\('\/queries\/races',[\s\S]*?\n\}\);/)?.[0] || '';

  assert.match(queryRoute, /scope:\s*\{\s*groupKey:\s*g,\s*meetingId,\s*raceId\s*\}/);
  assert.doesNotMatch(queryRoute, /scope:\s*\{[^}]*ownerId\s*:/);
  assert.doesNotMatch(queryRoute, /scope:\s*\{[^}]*groupId\s*:\s*g/);
});
