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

test('TestChannel adapter and production PostgreSQL replay E2E are present and fail closed', () => {
  assert.equal(exists('backend/src/modules/hipico-bot/hipico-test-channel.ts'), true, 'TestChannel adapter missing');
  assert.equal(exists('backend/src/modules/hipico-bot/hipico-test-channel.test.ts'), true, 'TestChannel unit contract missing');
  assert.equal(exists('backend/src/modules/hipico-bot/production-e2e-v290.ts'), true, 'TestChannel production E2E missing');
  const adapter = read('backend/src/modules/hipico-bot/hipico-test-channel.ts');
  const production = read('backend/src/modules/hipico-bot/production-e2e-v290.ts');
  assert.match(adapter, /TEST_CHANNEL_NOT_CONNECTED/);
  assert.match(adapter, /TEST_CHANNEL_IDENTITY_MISMATCH/);
  assert.match(production, /HipicoBotStore\.dbReady\(true\)/);
  assert.match(production, /result\?\.duplicate, true/);
  assert.match(production, /HipicoWebhookEvent/);
  assert.match(production, /HipicoBotOutbox/);
  assert.match(production, /hipicoDomainPersistenceReadiness/);
});

test('load profile measures 100/500/2000 with isolated PostgreSQL and canonical provider normalization', () => {
  assert.equal(exists('backend/scripts/hipico-load-profile-v290.ts'), true, 'load profile script missing');
  const profile = read('backend/scripts/hipico-load-profile-v290.ts');
  assert.match(profile, /\[100, 500, 2000\]/);
  assert.match(profile, /performance profile refuses non-local DB/);
  assert.match(profile, /normalizeSportradarStage/);
  assert.match(profile, /financialAuthority:\s*false/);
  assert.match(profile, /postgres-performance\.json/);
  assert.match(profile, /acceptance:\s*'NOT_EXECUTED'/);
});

test('Hípico data workflow executes full schema, TestChannel, restart, profile and focused data integration, then always cleans up', () => {
  const workflow = read('.github/workflows/hipico-data-engines.yml');
  assert.match(workflow, /HIPICO_E2E_ADMIN_URL:/);
  assert.match(workflow, /npm --workspace backend run prisma:deploy/);
  assert.match(workflow, /node scripts\/hipico-ephemeral-db-v290\.mjs create/);
  assert.match(workflow, /node scripts\/hipico-apply-e2e-schema-v290\.mjs/);
  assert.match(workflow, /tsx --test src\/modules\/hipico-bot\/production-e2e-v290\.ts/);
  assert.match(workflow, /npm --workspace backend exec -- tsx scripts\/hipico-restart-recovery-v290\.ts prepare/);
  assert.match(workflow, /npm --workspace backend exec -- tsx scripts\/hipico-restart-recovery-v290\.ts verify/);
  assert.match(workflow, /npm --workspace backend exec -- tsx scripts\/hipico-load-profile-v290\.ts/);
  assert.match(workflow, /npm --workspace backend run test:hipico:data/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /node scripts\/hipico-ephemeral-db-v290\.mjs drop/);
  assert.match(workflow, /artifacts\/qa\/hipico-v290\//);
});
