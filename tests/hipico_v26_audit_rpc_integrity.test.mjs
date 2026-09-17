import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), 'utf8');
const EXPECTED_PAIRS = new Set([
  'advanced_created:advanced',
  'advanced_deleted:advanced',
  'advanced_group_cleared:advanced',
  'advanced_imported:advanced',
  'advanced_loaded:race',
  'bet_cancelled:bet',
  'bet_created_multi:bet',
  'bet_duplicated:bet',
  'board_from_whatsapp:race',
  'board_updated:race',
  'day_closed:day',
  'group_created:group',
  'movement_posted:movement',
  'participant_created:participant',
  'participant_updated:participant',
  'polla_created:polla',
  'polla_entry_added:polla',
  'polla_updated:polla',
  'race_closed:race',
  'race_created:race',
  'race_locked:race',
  'race_settled:race',
  'race_unlocked:race',
  'rate_added:rate',
  'settings_updated:workspace',
  'settlement_reopened:race',
  'week_closed:week',
  'whatsapp_imported:race'
]);

function pwaMutationPairs(source) {
  return new Set([...source.matchAll(/mutate\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/g)]
    .map((match) => `${match[1]}:${match[2]}`));
}

function migrationCatalogPairs(source) {
  const start = source.indexOf('-- BEGIN PWA AUDIT CATALOG');
  const end = source.indexOf('-- END PWA AUDIT CATALOG');
  assert.ok(start >= 0 && end > start, 'migration must expose an auditable bounded catalog block');
  return new Set([...source.slice(start, end).matchAll(/\('([^']+)'\s*,\s*'([^']+)'\)/g)]
    .map((match) => `${match[1]}:${match[2]}`));
}

test('v26 audit catalog exactly tracks the current PWA mutation surface', async () => {
  const [app, migration] = await Promise.all([
    read('frontend/public/hipico-control/assets/js/app.js'),
    read('supabase/sql/hipico_v26_audit_rpc_integrity.sql')
  ]);
  const pwa = pwaMutationPairs(app);
  assert.deepEqual([...pwa].sort(), [...EXPECTED_PAIRS].sort());
  assert.deepEqual([...migrationCatalogPairs(migration)].sort(), [...EXPECTED_PAIRS].sort());
});

test('v26 append RPC is a bounded SECURITY DEFINER authority with server-owned audit metadata', async () => {
  const migration = await read('supabase/sql/hipico_v26_audit_rpc_integrity.sql');
  for (const marker of [
    'security definer',
    "set search_path = pg_catalog, public, auth",
    "HIPICO_AUDIT_ROLE_FORBIDDEN",
    "HIPICO_AUDIT_ACTION_FORBIDDEN",
    "HIPICO_AUDIT_ENTITY_MISMATCH",
    "HIPICO_AUDIT_PAYLOAD_TOO_LARGE",
    "HIPICO_AUDIT_ENTITY_ID_INVALID",
    "'client_sync'",
    "'advisory'",
    "'financialAuthority', false",
    "'settlementAuthority', false",
    'octet_length(v_input_payload::text)',
    'revoke insert, update, delete on table public.hipico_audit_events from authenticated',
    'revoke usage, select on sequence public.hipico_audit_events_id_seq from authenticated',
    'grant execute on function public.hipico_append_audit(uuid, text, text, text, jsonb) to authenticated, service_role'
  ]) assert.ok(migration.toLowerCase().includes(marker.toLowerCase()), `missing hardening marker: ${marker}`);
  assert.doesNotMatch(migration, /grant\s+insert\s+on\s+table\s+public\.hipico_audit_events\s+to\s+authenticated/i);
});

test('v26 adds compatible source/authority provenance without rewriting historical semantics', async () => {
  const migration = await read('supabase/sql/hipico_v26_audit_rpc_integrity.sql');
  assert.match(migration, /add column if not exists source text/i);
  assert.match(migration, /add column if not exists authority text/i);
  assert.match(migration, /source\s*=\s*'legacy'/i);
  assert.match(migration, /authority\s*=\s*'legacy'/i);
  assert.match(migration, /alter column source set default 'server'/i);
  assert.match(migration, /alter column authority set default 'authoritative'/i);
});

test('v26 PostgreSQL probe covers role, scope, mismatch, payload and forged metadata negatives', async () => {
  const [probe, workflow] = await Promise.all([
    read('scripts/hipico-audit-rpc-v26-pg.mjs'),
    read('.github/workflows/hipico-audit-rpc-v26.yml')
  ]);
  for (const marker of [
    'viewer', 'auditor', 'HIPICO_AUDIT_ACTION_FORBIDDEN', 'HIPICO_AUDIT_ENTITY_MISMATCH',
    'HIPICO_WORKSPACE_FORBIDDEN', 'HIPICO_AUDIT_PAYLOAD_TOO_LARGE', 'forged-user',
    "source,authority", "financialAuthority", "settlementAuthority", 'ROLLBACK'
  ]) assert.ok(probe.includes(marker), `probe missing ${marker}`);
  assert.match(workflow, /postgres:16/);
  assert.match(workflow, /HIPICO_CANDIDATE_SHA/);
  assert.match(workflow, /git rev-parse HEAD/);
  assert.match(workflow, /hipico-audit-rpc-v26-pg\.mjs/);
});
