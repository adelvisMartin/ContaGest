import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../../../../supabase/sql/hipico_v21_race_data_conflicts.sql', import.meta.url),
  'utf8'
);
const workflow = readFileSync(
  new URL('../../../../.github/workflows/hipico-data-engines.yml', import.meta.url),
  'utf8'
);
const integration = readFileSync(new URL('./hipico-data.integration.ts', import.meta.url), 'utf8');

test('race conflict migration permits explicit DATA_CONFLICT audit events', () => {
  assert.match(migration, /RECORD_DATA_CONFLICT/);
  assert.match(migration, /hipico_race_events_command_check/);
  assert.doesNotMatch(migration, /drop\s+table/i);
});

test('race conflict migration is included in canonical PostgreSQL integration and CI path scope', () => {
  assert.match(integration, /hipico_v21_race_data_conflicts\.sql/);
  assert.match(workflow, /hipico_v21_race_data_conflicts\.sql/);
});
