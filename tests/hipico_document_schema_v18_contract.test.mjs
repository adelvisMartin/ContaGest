import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migrationPath = new URL('../supabase/sql/hipico_v18_documents.sql', import.meta.url);
const storePath = new URL('../backend/src/modules/hipico/document.store.ts', import.meta.url);

function source(url) {
  return fs.readFileSync(url, 'utf8');
}

test('document schema contains every persistence table used by the canonical document store', () => {
  const migration = source(migrationPath);
  const store = source(storePath);
  for (const table of ['hipico_documents', 'hipico_document_sources', 'hipico_document_events']) {
    assert.match(store, new RegExp(`public\\.${table}`), `store must use ${table}`);
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`), `migration must create ${table}`);
  }
});

test('raw PDF identity and provenance are immutable while derived review state remains auditable', () => {
  const migration = source(migrationPath);
  assert.match(migration, /hipico_documents_immutable_evidence/);
  assert.match(migration, /HIPICO_DOCUMENT_IMMUTABLE_EVIDENCE/);
  assert.match(migration, /hipico_document_sources_immutable/);
  assert.match(migration, /HIPICO_DOCUMENT_SOURCE_IMMUTABLE/);
  assert.match(migration, /hipico_document_events_guard_immutable/);
  assert.match(migration, /HIPICO_DOCUMENT_EVENT_IMMUTABLE/);
  assert.match(migration, /foreign key\s*\(document_id, owner_id, group_key\)/i);
});

test('document evidence tables are RLS protected and browser roles cannot mutate raw evidence', () => {
  const migration = source(migrationPath);
  for (const table of ['hipico_documents', 'hipico_document_sources', 'hipico_document_events']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(migration, new RegExp(`revoke all on public\\.${table} from anon`, 'i'));
    assert.match(migration, new RegExp(`revoke all on public\\.${table} from authenticated`, 'i'));
  }
  assert.match(migration, /hipico_documents_select_own/);
  assert.match(migration, /hipico_document_sources_select_own/);
  assert.match(migration, /hipico_document_events_select_own/);
});
