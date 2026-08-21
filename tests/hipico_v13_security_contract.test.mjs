import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const workspaceSql = read('supabase/sql/hipico_v13_workspace_sync_security.sql');
const labSql = read('supabase/sql/hipico_v13_lab_channel_bootstrap.sql');

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

test('v1.13 workspace migration is idempotent and never introduces SECURITY DEFINER', () => {
  assert.match(workspaceSql, /create table if not exists public\.hipico_workspaces/i);
  assert.match(workspaceSql, /create table if not exists public\.hipico_profiles/i);
  assert.match(workspaceSql, /create table if not exists public\.hipico_audit_events/i);
  assert.match(workspaceSql, /create index if not exists hipico_audit_owner_time_idx/i);
  assert.ok(countMatches(workspaceSql, /create or replace function public\.hipico_/gi) >= 4);
  assert.ok(countMatches(workspaceSql, /security invoker/gi) >= 4);
  assert.doesNotMatch(workspaceSql, /security\s+definer/i);
  assert.ok(countMatches(workspaceSql, /drop policy if exists/gi) >= 8);
});

test('v1.13 workspace tables enforce owner-scoped RLS', () => {
  for (const table of ['hipico_workspaces', 'hipico_profiles', 'hipico_audit_events']) {
    assert.match(workspaceSql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.ok(countMatches(workspaceSql, /owner_id\s*=\s*\(select auth\.uid\(\)\)/gi) >= 8);
  assert.match(workspaceSql, /HIPICO_AUTH_REQUIRED/);
  assert.match(workspaceSql, /HIPICO_WORKSPACE_FORBIDDEN/);
  assert.match(workspaceSql, /HIPICO_VERSION_CONFLICT/);
});

test('authenticated clients cannot write operational ledger or outbox tables directly', () => {
  assert.match(workspaceSql, /revoke all on table[\s\S]*public\.hipico_outbox[\s\S]*public\.hipico_ledger_entries[\s\S]*from anon, authenticated;/i);
  const grantBlock = workspaceSql.match(/grant select on table([\s\S]*?)to authenticated;/i)?.[1] || '';
  assert.doesNotMatch(grantBlock, /hipico_outbox/i);
  assert.doesNotMatch(grantBlock, /hipico_ledger_entries/i);
  assert.match(grantBlock, /hipico_messages/i);
  assert.match(grantBlock, /hipico_shadow_evaluations/i);
});

test('RPC surface is explicitly revoked from public/anon then granted to authenticated', () => {
  for (const signature of [
    'hipico_get_workspace\\(\\)',
    'hipico_save_workspace\\(text, jsonb, bigint\\)',
    'hipico_get_profile\\(\\)',
    'hipico_append_audit\\(uuid, text, text, text, jsonb\\)'
  ]) {
    assert.match(workspaceSql, new RegExp(`revoke all on function public\\.${signature} from public, anon`, 'i'));
    assert.match(workspaceSql, new RegExp(`grant execute on function public\\.${signature} to authenticated`, 'i'));
  }
});

test('LAB bootstrap is idempotent, unique and fail-safe for money/source writes', () => {
  assert.match(labSql, /create unique index if not exists hipico_single_active_lab_channel_idx/i);
  assert.match(labSql, /where group_key = 'control-hipico-lab'/i);
  assert.match(labSql, /channel_type = 'web_bridge'/i);
  assert.match(labSql, /status = 'active'/i);
  assert.match(labSql, /on conflict\(owner_id, group_key\) do update/i);
  assert.match(labSql, /'source_send_possible', false/i);
  assert.match(labSql, /'monetary_auto_apply', false/i);
  assert.doesNotMatch(labSql, /security\s+definer/i);
});

test('LAB bootstrap documents its single-owner deployment constraint', () => {
  assert.match(labSql, /Personal\/single-owner deployment contract/i);
  assert.match(labSql, /order by updated_at desc\s*limit 1/i);
});
