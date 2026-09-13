import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const prismaMigration = readFileSync(
  new URL('../../../prisma/migrations/20260911211500_hipico_domain_source_identity/migration.sql', import.meta.url),
  'utf8'
);
const supabaseAlignment = readFileSync(
  new URL('../../../../supabase/sql/hipico_v15_domain_integrity_alignment.sql', import.meta.url),
  'utf8'
);

for (const [label, sql] of [
  ['Prisma migration', prismaMigration],
  ['Supabase V15 alignment', supabaseAlignment]
] as const) {
  test(`${label} keeps the canonical event log append-only with a pinned function search_path`, () => {
    assert.match(sql, /CREATE OR REPLACE FUNCTION public\.hipico_domain_events_immutable_guard\(\)/i);
    assert.match(sql, /LANGUAGE plpgsql\s+SET search_path\s*=\s*public,\s*pg_temp/i);
    assert.match(sql, /BEFORE UPDATE OR DELETE ON public\.hipico_domain_events/i);
    assert.match(sql, /HIPICO_DOMAIN_EVENTS_APPEND_ONLY/);
    assert.doesNotMatch(sql, /SECURITY\s+DEFINER/i);
  });
}

test('both migration paths preserve fail-closed source identity and scoped aggregate integrity', () => {
  for (const sql of [prismaMigration, supabaseAlignment]) {
    assert.match(sql, /HIPICO_DOMAIN_SOURCE_IDENTITY_DUPLICATES/);
    assert.match(sql, /hipico_domain_events_source_identity_v297/);
    assert.match(sql, /HIPICO_DOMAIN_ORPHAN_EVENTS/);
    assert.match(sql, /hipico_domain_events_aggregate_fk/);
    assert.match(sql, /ON DELETE RESTRICT/i);
  }
});
