import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationDir = '20260917170000_hipico_audit_rpc_integrity';
const migrationPath = `backend/prisma/migrations/${migrationDir}/migration.sql`;
const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), 'utf8');

test('#361 has a deployable audit-integrity migration and reapplies it last in v290', async () => {
  const migrations = await readdir(new URL('../backend/prisma/migrations/', import.meta.url));
  assert.ok(
    migrations.includes(migrationDir),
    `${migrationDir} must harden the live SECURITY DEFINER audit RPC`
  );

  const [sql, schemaProbe] = await Promise.all([
    read(migrationPath),
    read('scripts/hipico-apply-e2e-schema-v290.mjs')
  ]);
  for (const marker of [
    'actor_user_id',
    'actor_role',
    'source',
    'authority',
    'HIPICO_READ_ONLY_ROLE',
    'HIPICO_AUDIT_ACTION_NOT_ALLOWED',
    'HIPICO_AUDIT_ENTITY_MISMATCH',
    'HIPICO_AUDIT_PAYLOAD_TOO_LARGE',
    'client_sync',
    'advisory',
    'financialAuthority',
    'hipico_audit_idempotency_guard'
  ]) assert.ok(sql.includes(marker), `v14 audit migration missing ${marker}`);

  assert.match(sql, /v_role\s+NOT\s+IN\s*\('admin','operator'\)/i);
  assert.match(sql, /octet_length\s*\(v_payload::text\)\s*>\s*32768/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.hipico_append_audit\(uuid, text, text, text, jsonb\) FROM public, anon/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.hipico_append_audit\(uuid, text, text, text, jsonb\) TO authenticated/i);
  assert.match(sql, /'source',\s*'client_sync'/i);
  assert.match(sql, /'authority',\s*'advisory'/i);
  assert.match(sql, /'financialAuthority',\s*false/i);

  const markerIndex = schemaProbe.indexOf(migrationPath);
  const v24Index = schemaProbe.indexOf('hipico_v24_shadow_metrics.sql');
  assert.ok(markerIndex > v24Index, 'v14 hardening must be the final schema authority after historical SQL');
});

test('#361 allowlists the mutation families currently emitted by the PWA', async () => {
  const sql = await read(migrationPath);
  for (const marker of [
    'race_locked', 'race_unlocked', 'race_created', 'race_settled', 'race_closed',
    'bet_created', 'bet_created_multi', 'bet_duplicated', 'bet_cancelled',
    'participant_created', 'participant_updated', 'board_updated',
    'movement_posted', 'settings_updated', 'group_created', 'rate_added',
    'polla_created', 'polla_entry_added', 'polla_updated',
    'whatsapp_imported', 'advanced_created', 'advanced_imported', 'advanced_loaded',
    'day_closed', 'week_closed'
  ]) assert.ok(sql.includes(marker), `v14 action catalog missing ${marker}`);
});

test('#361 preserves the existing PWA RPC signature and server authority boundary', async () => {
  const source = await read('frontend/public/hipico-control/assets/js/supabase.js');
  assert.match(source, /\/rest\/v1\/rpc\/\$\{CLOUD_CONFIG\.appendAuditRpc\}/);
  for (const field of ['p_workspace_id', 'p_action', 'p_entity_type', 'p_entity_id', 'p_payload']) {
    assert.ok(source.includes(field), `audit RPC client contract missing ${field}`);
  }
  assert.doesNotMatch(source, /service[_-]?role|sb_secret_/i);
});
