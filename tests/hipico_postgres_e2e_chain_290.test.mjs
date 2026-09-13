import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (relative) => fs.readFileSync(new URL(relative, root), 'utf8');
const exists = (relative) => fs.existsSync(new URL(relative, root));

const migrations = [
  'supabase/sql/hipico_v12_operations.sql',
  'supabase/sql/hipico_v12_group_bridge.sql',
  'supabase/sql/hipico_v12_shadow_validation.sql',
  'supabase/sql/hipico_v13_workspace_sync_security.sql',
  'supabase/sql/hipico_v13_audit_idempotency.sql',
  'supabase/sql/hipico_v13_lab_channel_bootstrap.sql',
  'supabase/sql/hipico_v14_canonical_domain.sql',
  'supabase/sql/hipico_v14_documents.sql',
  'supabase/sql/hipico_v15_domain_integrity_alignment.sql',
  'supabase/sql/hipico_v15_race_lifecycle.sql',
  'supabase/sql/hipico_v16_operator_confirmation_audit.sql',
  'supabase/sql/hipico_v16_agent_shadow.sql',
  'supabase/sql/hipico_v17_outbox_reconciliation_status.sql',
  'supabase/sql/hipico_v17_provider_evidence.sql',
  'supabase/sql/hipico_v18_documents.sql',
  'supabase/sql/hipico_v18_race_result_stages.sql',
  'supabase/sql/hipico_v19_race_idempotency.sql',
  'supabase/sql/hipico_v20_document_audit.sql',
  'supabase/sql/hipico_v21_race_data_conflicts.sql'
];

test('PostgreSQL E2E scripts exist and rebuild the complete current Hípico migration chain', () => {
  assert.equal(exists('scripts/hipico-ephemeral-db-v290.mjs'), true, 'ephemeral DB lifecycle script missing');
  assert.equal(exists('scripts/hipico-apply-e2e-schema-v290.mjs'), true, 'schema application script missing');
  const schema = read('scripts/hipico-apply-e2e-schema-v290.mjs');
  for (const migration of migrations) {
    assert.ok(schema.includes(`'${migration}'`), `E2E schema missing ${migration}`);
  }
});

test('PostgreSQL E2E verifies current canonical tables, RLS and least-privilege denial paths', () => {
  const schema = read('scripts/hipico-apply-e2e-schema-v290.mjs');
  for (const table of [
    'hipico_workspaces',
    'hipico_bot_channels',
    'hipico_messages',
    'hipico_outbox',
    'hipico_provider_evidence',
    'hipico_meetings',
    'hipico_races',
    'hipico_race_events',
    'hipico_group_automation',
    'hipico_agent_evaluations',
    'hipico_documents',
    'hipico_document_sources',
    'hipico_document_events'
  ]) {
    assert.ok(schema.includes(`'${table}'`), `E2E schema does not require ${table}`);
  }
  assert.match(schema, /SET LOCAL ROLE/);
  assert.match(schema, /Workspace RLS owner isolation failed/);
  assert.match(schema, /Message RLS owner isolation failed/);
  assert.match(schema, /authenticatedDocumentWriteDenied/);
  assert.match(schema, /authenticatedAgentAutomationWriteDenied/);
  assert.match(schema, /authenticatedRaceWriteDenied/);
  assert.match(schema, /authenticatedProviderEvidenceWriteDenied/);
});

test('ephemeral DB lifecycle refuses non-local and non-ephemeral database targets', () => {
  const lifecycle = read('scripts/hipico-ephemeral-db-v290.mjs');
  assert.match(lifecycle, /127\.0\.0\.1/);
  assert.match(lifecycle, /localhost/);
  assert.match(lifecycle, /hipico_e2e_/);
  assert.match(lifecycle, /Refusing non-local PostgreSQL host/);
  assert.match(lifecycle, /DROP DATABASE IF EXISTS/);
});

test('restart recovery persists state in one process and verifies/replays it in a fresh process with SHA-bound evidence', () => {
  assert.equal(exists('backend/scripts/hipico-restart-recovery-v290.ts'), true, 'restart recovery script missing');
  const restart = read('backend/scripts/hipico-restart-recovery-v290.ts');
  assert.match(restart, /phase === 'prepare'/);
  assert.match(restart, /phase === 'verify'/);
  assert.match(restart, /replay\.duplicate, true/);
  assert.match(restart, /stateVersion, 2/);
  assert.match(restart, /restart recovery refuses non-local PostgreSQL/);
  assert.match(restart, /candidateSha/);
  assert.match(restart, /sha:\s*candidateSha/);
});

test('Hípico data workflow executes full schema, restart recovery and focused data integration, then always cleans up', () => {
  const workflow = read('.github/workflows/hipico-data-engines.yml');
  assert.match(workflow, /HIPICO_E2E_ADMIN_URL:/);
  assert.match(workflow, /node scripts\/hipico-ephemeral-db-v290\.mjs create/);
  assert.match(workflow, /node scripts\/hipico-apply-e2e-schema-v290\.mjs/);
  assert.match(workflow, /npm --workspace backend exec -- tsx scripts\/hipico-restart-recovery-v290\.ts prepare/);
  assert.match(workflow, /npm --workspace backend exec -- tsx scripts\/hipico-restart-recovery-v290\.ts verify/);
  assert.match(workflow, /npm --workspace backend run test:hipico:data/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /node scripts\/hipico-ephemeral-db-v290\.mjs drop/);
  assert.match(workflow, /artifacts\/qa\/hipico-v290\//);
});
