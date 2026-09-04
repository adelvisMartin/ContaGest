import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/import-transactional-v95.yml', 'utf8');
const guard = readFileSync('ops/database/prepare-supabase-ephemeral.sql', 'utf8');

test('Imports #95 usa una base PostgreSQL marcada explícitamente como efímera', () => {
  assert.match(workflow, /POSTGRES_DB:\s*contagest_import_v95_e2e/);
  assert.match(workflow, /contagest_import_v95_e2e\?schema=public/);
  assert.doesNotMatch(workflow, /contagest_import_v95(?!_e2e)/);
});

test('el guard de compatibilidad Supabase mantiene fail-closed fuera de bases efímeras', () => {
  assert.match(guard, /\(_e2e\|_drill\|_restore\)\$/);
  assert.match(guard, /Refusing Supabase compatibility stubs in non-ephemeral database/);
});
