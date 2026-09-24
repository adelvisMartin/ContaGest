import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const seed=fs.readFileSync(new URL('../backend/prisma/seed.ts',import.meta.url),'utf8');

test('59/75 inventory opening audit seed binds UUID id with the database UUID type',()=>{
  assert.match(seed,/InventoryMovementAuditLink[\s\S]*CAST\(\$\{randomUUID\(\)\} AS uuid\)/);
  assert.doesNotMatch(seed,/InventoryMovementAuditLink[\s\S]{0,350}\(\$\{randomUUID\(\)\},/);
});
