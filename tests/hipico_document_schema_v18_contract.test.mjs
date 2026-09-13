import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const baseMigrationPath = new URL('../supabase/sql/hipico_v18_documents.sql', import.meta.url);
const auditMigrationPath = new URL('../supabase/sql/hipico_v20_document_audit.sql', import.meta.url);
const storePath = new URL('../backend/src/modules/hipico/document.store.ts', import.meta.url);

function source(url) {
  return fs.readFileSync(url, 'utf8');
}

function schemaSource() {
  return `${source(baseMigrationPath)}\n${source(auditMigrationPath)}`;
}

test('document migration chain contains every persistence table used by the canonical document store', () => {
  const migrations = schemaSource();
  const store = source(storePath);
  for (const table of ['hipico_documents', 'hipico_document_sources', 'hipico_document_events']) {
    assert.match(store, new RegExp(`public\\.${table}`), `store must use ${table}`);
    assert.match(migrations, new RegExp(`create table if not exists public\\.${table}`), `migration chain must create ${table}`);
  }
  assert.match(source(baseMigrationPath), /create table if not exists public\.hipico_documents/);
  assert.match(source(auditMigrationPath), /create table if not exists public\.hipico_document_events/);
});

test('raw PDF identity and provenance are immutable while derived review state remains append-only', () => {
  const migrations = schemaSource();
  assert.match(migrations, /HIPICO_DOCUMENT_IMMUTABLE_EVIDENCE|HIPICO_DOCUMENT_EVIDENCE_IMMUTABLE/);
  assert.match(migrations, /hipico_document_sources_immutable/);
  assert.match(migrations, /hipico_document_events_immutable/);
  assert.match(migrations, /HIPICO_EVIDENCE_ROW_IMMUTABLE/);
  assert.match(migrations, /foreign key\s*\(document_id,\s*owner_id,\s*group_key\)/i);
});

test('document evidence tables are RLS protected and browser roles cannot mutate raw evidence', () => {
  const migrations = schemaSource();
  for (const table of ['hipico_documents', 'hipico_document_sources', 'hipico_document_events']) {
    assert.match(migrations, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(migrations, new RegExp(`revoke all on public\\.${table} from anon`, 'i'));
    assert.match(migrations, new RegExp(`revoke all on public\\.${table} from authenticated`, 'i'));
  }
  assert.match(migrations, /hipico_documents_select_own/);
  assert.match(migrations, /hipico_document_sources_select_own/);
  assert.match(migrations, /hipico_document_events_select_own/);
});
