import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const databaseUrl = String(process.env.HIPICO_E2E_DATABASE_URL || '').trim();
const ownerId = String(process.env.HIPICO_E2E_OWNER_ID || '11111111-1111-4111-8111-111111111111').trim();
const otherOwnerId = '22222222-2222-4222-8222-222222222222';
const qaSha = String(process.env.HIPICO_CANDIDATE_SHA || process.env.GITHUB_SHA || process.env.HIPICO_QA_SHA || 'local').trim();
const rbacArtifact = path.resolve('artifacts/qa/hipico-v290/postgres-rbac.json');
const phaseArg = process.argv.find((arg) => arg.startsWith('--phase='));
const phase = phaseArg ? phaseArg.slice('--phase='.length) : 'full';
if (!['full', 'prisma-prereqs', 'final'].includes(phase)) {
  throw new Error(`HIPICO_E2E_PHASE_INVALID:${phase}`);
}
const finalPhase = phase === 'final';

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
  'supabase/sql/hipico_v17_outbox_reconciliation_status.sql',
  'supabase/sql/hipico_v17_provider_evidence.sql',
  'supabase/sql/hipico_v18_documents.sql',
  'supabase/sql/hipico_v18_race_result_stages.sql',
  'supabase/sql/hipico_v19_race_idempotency.sql',
  'supabase/sql/hipico_v20_document_audit.sql',
  'supabase/sql/hipico_v21_race_data_conflicts.sql',
  'supabase/sql/hipico_v22_agent_shadow.sql',
  'supabase/sql/hipico_v23_risk_policy.sql',
  'supabase/sql/hipico_v24_shadow_metrics.sql',
  'supabase/sql/hipico_v25_observability.sql',
  'supabase/sql/hipico_v26_audit_rpc_integrity.sql'
];

const requiredAgentColumns = [
  'policy_disposition',
  'policy_reason',
  'policy_version',
  'policy_evidence_state',
  'abstained',
  'race_context_error',
  'metric_schema_version'
];
const requiredAgentConstraints = [
  'hipico_agent_evaluations_policy_disposition_check',
  'hipico_agent_evaluations_policy_evidence_state_check',
  'hipico_agent_evaluations_metric_schema_version_check'
];
const requiredAuditColumns = ['idempotency_key', 'source', 'authority'];
const requiredAuditConstraints = [
  'hipico_audit_events_source_check',
  'hipico_audit_events_authority_check'
];

function assertSafe(urlText) {
  if (!urlText) throw new Error('HIPICO_E2E_DATABASE_URL is required.');
  const url = new URL(urlText);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname.toLowerCase())) {
    throw new Error(`Refusing non-local E2E database host: ${url.hostname}`);
  }
  const db = url.pathname.replace(/^\//, '');
  if (!/^hipico_e2e_[a-z0-9_]{8,63}$/.test(db)) {
    throw new Error(`Refusing database without hipico_e2e_ run isolation prefix: ${db}`);
  }
  return { url, db };
}

async function withRole(client, role, subject, fn) {
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL ROLE ${role}`);
    if (subject) {
      await client.query(`SELECT set_config('request.jwt.claim.sub',$1,true)`, [subject]);
      await client.query(`SELECT set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ sub: subject, role })]);
    }
    const result = await fn();
    await client.query('ROLLBACK');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  }
}

async function expectPermissionDenied(client, role, subject, sql) {
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL ROLE ${role}`);
    if (subject) {
      await client.query(`SELECT set_config('request.jwt.claim.sub',$1,true)`, [subject]);
      await client.query(`SELECT set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ sub: subject, role })]);
    }
    await client.query(sql);
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    if (error?.code !== '42501') throw error;
    return;
  }
  await client.query('ROLLBACK');
  throw new Error(`RBAC statement unexpectedly succeeded for ${role}: ${sql.slice(0, 120)}`);
}

assertSafe(databaseUrl);
const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  await client.query('BEGIN');
  await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await client.query(`DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await client.query(`DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await client.query(`DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await client.query('CREATE SCHEMA IF NOT EXISTS auth');
  await client.query(`CREATE TABLE IF NOT EXISTS auth.users (
    id uuid PRIMARY KEY,
    email text,
    encrypted_password text,
    raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
  )`);
  await client.query(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$`);
  await client.query(`CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
  $$`);
  await client.query(`CREATE OR REPLACE FUNCTION public.hipico_set_updated_at()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END
  $$`);
  await client.query('GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role');
  await client.query('GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role');
  await client.query('GRANT EXECUTE ON FUNCTION auth.jwt() TO anon, authenticated, service_role');
  await client.query('COMMIT');

  const migrationsToApply = phase === 'prisma-prereqs'
    ? migrations.filter((relative) => !relative.endsWith('hipico_v25_observability.sql') && !relative.endsWith('hipico_v26_audit_rpc_integrity.sql'))
    : migrations;
  for (const relative of migrationsToApply) {
    const sql = await fs.readFile(path.resolve(relative), 'utf8');
    console.log(`[hipico-v290] applying ${relative}`);
    await client.query(sql);
  }

  await client.query(`INSERT INTO auth.users(id,email,encrypted_password,raw_user_meta_data,raw_app_meta_data)
    VALUES
      ($1::uuid,'hipico-owner@e2e.invalid',NULL,'{"name":"Operador E2E"}'::jsonb,'{"app":"hipico-control","role":"admin"}'::jsonb),
      ($2::uuid,'hipico-foreign@e2e.invalid',NULL,'{"name":"Foreign E2E"}'::jsonb,'{"app":"hipico-control","role":"operator"}'::jsonb)
    ON CONFLICT(id) DO NOTHING`, [ownerId, otherOwnerId]);

  await client.query(`INSERT INTO public.hipico_workspaces(owner_id,name,state,version)
    VALUES($1::uuid,'Control Hípico E2E','{}'::jsonb,1)
    ON CONFLICT(owner_id) DO NOTHING`, [ownerId]);
  await client.query(`INSERT INTO public.hipico_profiles(owner_id,display_name,role,preferences)
    VALUES($1::uuid,'Operador E2E','admin','{}'::jsonb)
    ON CONFLICT(owner_id) DO NOTHING`, [ownerId]);
  await client.query(`INSERT INTO public.hipico_workspaces(owner_id,name,state,version)
    VALUES($1::uuid,'Foreign E2E owner','{}'::jsonb,1)
    ON CONFLICT(owner_id) DO NOTHING`, [otherOwnerId]);

  if (phase === 'prisma-prereqs') {
    console.log('[hipico-v290] Prisma prerequisites ready (Supabase Auth compatibility + v12-v24)');
  } else {
  const required = [
    'hipico_workspaces', 'hipico_profiles', 'hipico_audit_events',
    'hipico_bot_channels', 'hipico_messages', 'hipico_operation_events', 'hipico_shadow_evaluations',
    'hipico_outbox', 'hipico_ledger_entries', 'hipico_reconciliations',
    'hipico_domain_aggregates', 'hipico_domain_events',
    'hipico_provider_evidence', 'hipico_meetings', 'hipico_races', 'hipico_race_events',
    'hipico_group_automation', 'hipico_agent_evaluations', 'hipico_automation_transition_events',
    'hipico_documents', 'hipico_document_sources', 'hipico_document_events',
    'hipico_observability_events'
  ];
  const rows = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1::text[])`,
    [required]
  );
  const found = new Set(rows.rows.map((row) => row.tablename));
  const missing = required.filter((name) => !found.has(name));
  if (missing.length) throw new Error(`E2E schema incomplete: ${missing.join(', ')}`);

  const rlsRows = await client.query(`
    SELECT relname, relrowsecurity
    FROM pg_class
    JOIN pg_namespace ON pg_namespace.oid=pg_class.relnamespace
    WHERE pg_namespace.nspname='public' AND relname = ANY($1::text[])
  `, [required]);
  const rlsState = new Map(rlsRows.rows.map((row) => [row.relname, row.relrowsecurity]));
  const rlsMissing = required.filter((name) => rlsState.get(name) !== true);
  if (rlsMissing.length) throw new Error(`RLS is not enabled for: ${rlsMissing.join(', ')}`);

  const requiredTriggers = [
    'hipico_race_events_immutable',
    'hipico_documents_identity_immutable',
    'hipico_document_sources_immutable',
    'hipico_document_events_immutable',
    'hipico_automation_transition_events_append_only',
    'hipico_agent_evaluations_review_once',
    'hipico_observability_no_mutation',
    'hipico_audit_idempotency_guard'
  ];
  const triggerRows = await client.query(`
    SELECT tgname FROM pg_trigger
    WHERE NOT tgisinternal AND tgname = ANY($1::text[])
  `, [requiredTriggers]);
  const triggers = new Set(triggerRows.rows.map((row) => row.tgname));
  const missingTriggers = requiredTriggers.filter((name) => !triggers.has(name));
  if (missingTriggers.length) throw new Error(`Immutable audit trigger missing: ${missingTriggers.join(', ')}`);

  const agentColumnRows = await client.query(`
    SELECT column_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='hipico_agent_evaluations'
      AND column_name = ANY($1::text[])
  `, [requiredAgentColumns]);
  const agentColumns = new Map(agentColumnRows.rows.map((row) => [row.column_name, row.is_nullable]));
  const missingAgentColumns = requiredAgentColumns.filter((name) => !agentColumns.has(name));
  if (missingAgentColumns.length) throw new Error(`Agent policy/metric columns missing: ${missingAgentColumns.join(', ')}`);
  const nullableAgentColumns = requiredAgentColumns.filter((name) => agentColumns.get(name) !== 'NO');
  const agentPolicyColumnsNotNull = nullableAgentColumns.length === 0;
  const agentMetricColumnsNotNull = ['abstained', 'race_context_error', 'metric_schema_version']
    .every((name) => agentColumns.get(name) === 'NO');
  if (!agentPolicyColumnsNotNull || !agentMetricColumnsNotNull) {
    throw new Error(`Agent policy/metric columns must be NOT NULL: ${nullableAgentColumns.join(', ')}`);
  }

  const constraintRows = await client.query(`
    SELECT conname
    FROM pg_constraint
    JOIN pg_class ON pg_class.oid=pg_constraint.conrelid
    JOIN pg_namespace ON pg_namespace.oid=pg_class.relnamespace
    WHERE pg_namespace.nspname='public'
      AND pg_class.relname='hipico_agent_evaluations'
      AND conname = ANY($1::text[])
  `, [requiredAgentConstraints]);
  const agentConstraints = new Set(constraintRows.rows.map((row) => row.conname));
  const missingAgentConstraints = requiredAgentConstraints.filter((name) => !agentConstraints.has(name));
  const agentPolicyConstraintsPresent = missingAgentConstraints.length === 0;
  if (!agentPolicyConstraintsPresent) {
    throw new Error(`Agent policy/metric constraints missing: ${missingAgentConstraints.join(', ')}`);
  }

  const auditColumnRows = await client.query(`
    SELECT column_name, is_nullable
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='hipico_audit_events'
      AND column_name = ANY($1::text[])
  `, [requiredAuditColumns]);
  const auditColumns = new Map(auditColumnRows.rows.map((row) => [row.column_name, row.is_nullable]));
  const missingAuditColumns = requiredAuditColumns.filter((name) => !auditColumns.has(name));
  const auditV26ColumnsPresent = missingAuditColumns.length === 0
    && auditColumns.get('source') === 'NO'
    && auditColumns.get('authority') === 'NO';
  if (!auditV26ColumnsPresent) {
    throw new Error(`Audit v26 columns missing/invalid: ${missingAuditColumns.join(', ')}`);
  }

  const auditConstraintRows = await client.query(`
    SELECT conname
    FROM pg_constraint
    JOIN pg_class ON pg_class.oid=pg_constraint.conrelid
    JOIN pg_namespace ON pg_namespace.oid=pg_class.relnamespace
    WHERE pg_namespace.nspname='public'
      AND pg_class.relname='hipico_audit_events'
      AND conname = ANY($1::text[])
  `, [requiredAuditConstraints]);
  const auditConstraints = new Set(auditConstraintRows.rows.map((row) => row.conname));
  const missingAuditConstraints = requiredAuditConstraints.filter((name) => !auditConstraints.has(name));
  const auditV26ConstraintsPresent = missingAuditConstraints.length === 0;
  if (!auditV26ConstraintsPresent) {
    throw new Error(`Audit v26 constraints missing: ${missingAuditConstraints.join(', ')}`);
  }

  const observabilityAppendOnlyTriggerPresent = triggers.has('hipico_observability_no_mutation');
  const auditIdempotencyTriggerPresent = triggers.has('hipico_audit_idempotency_guard');
  if (!observabilityAppendOnlyTriggerPresent || !auditIdempotencyTriggerPresent) {
    throw new Error('v25/v26 trigger contract incomplete');
  }

  const auditRpcPrivilegeRows = await client.query(`
    SELECT
      has_function_privilege('anon','public.hipico_append_audit(uuid,text,text,text,jsonb)','EXECUTE') AS anon_execute,
      has_function_privilege('authenticated','public.hipico_append_audit(uuid,text,text,text,jsonb)','EXECUTE') AS authenticated_execute,
      has_function_privilege('service_role','public.hipico_append_audit(uuid,text,text,text,jsonb)','EXECUTE') AS service_role_execute
  `);
  const auditRpcPrivileges = auditRpcPrivilegeRows.rows[0] || {};
  const auditRpcAnonExecuteDenied = auditRpcPrivileges.anon_execute === false;
  const auditRpcAuthenticatedExecuteAllowed = auditRpcPrivileges.authenticated_execute === true;
  const auditRpcServiceRoleExecuteAllowed = auditRpcPrivileges.service_role_execute === true;
  if (!auditRpcAnonExecuteDenied || !auditRpcAuthenticatedExecuteAllowed || !auditRpcServiceRoleExecuteAllowed) {
    throw new Error('Audit v26 RPC privilege contract incomplete');
  }

  const ownChannel = await client.query(`INSERT INTO public.hipico_bot_channels(owner_id,group_key,label,channel_type,status,config)
    VALUES($1::uuid,'rbac-own','RBAC own','web_bridge','active','{}'::jsonb)
    ON CONFLICT(owner_id,group_key) DO UPDATE SET label=excluded.label RETURNING id`, [ownerId]);
  const otherChannel = await client.query(`INSERT INTO public.hipico_bot_channels(owner_id,group_key,label,channel_type,status,config)
    VALUES($1::uuid,'rbac-other','RBAC other','web_bridge','active','{}'::jsonb)
    ON CONFLICT(owner_id,group_key) DO UPDATE SET label=excluded.label RETURNING id`, [otherOwnerId]);
  await client.query(`INSERT INTO public.hipico_messages(
    owner_id,channel_id,channel_key,external_message_id,fingerprint,sender_role,raw_text,classification,confidence,processing_status,normalized,metadata)
    VALUES
      ($1::uuid,$2::uuid,'rbac-own','rbac-own-message','rbac-own-fingerprint','system','own','status_non_monetary',1,'processed','{}'::jsonb,'{}'::jsonb),
      ($3::uuid,$4::uuid,'rbac-other','rbac-other-message','rbac-other-fingerprint','system','other','status_non_monetary',1,'processed','{}'::jsonb,'{}'::jsonb)
    ON CONFLICT(owner_id,channel_key,fingerprint) DO NOTHING`,
    [ownerId, ownChannel.rows[0].id, otherOwnerId, otherChannel.rows[0].id]
  );

  const visibleWorkspaces = await withRole(client, 'authenticated', ownerId, () =>
    client.query(`SELECT owner_id::text AS owner_id FROM public.hipico_workspaces ORDER BY owner_id`)
  );
  if (visibleWorkspaces.rows.length !== 1 || visibleWorkspaces.rows[0].owner_id !== ownerId) {
    throw new Error('Workspace RLS owner isolation failed');
  }

  const visibleMessages = await withRole(client, 'authenticated', ownerId, () =>
    client.query(`SELECT owner_id::text AS owner_id,channel_key FROM public.hipico_messages WHERE channel_key IN ('rbac-own','rbac-other') ORDER BY channel_key`)
  );
  if (visibleMessages.rows.length !== 1 || visibleMessages.rows[0].owner_id !== ownerId || visibleMessages.rows[0].channel_key !== 'rbac-own') {
    throw new Error('Message RLS owner isolation failed');
  }

  await expectPermissionDenied(client, 'authenticated', ownerId,
    `INSERT INTO public.hipico_ledger_entries(owner_id,group_key,participant_code,product_type,reference_type,reference_id,entry_type,amount,currency) VALUES('${ownerId}'::uuid,'rbac-own','P1','TEST','e2e','forbidden-ledger','bet',1,'VES')`);
  await expectPermissionDenied(client, 'authenticated', ownerId,
    `INSERT INTO public.hipico_outbox(owner_id,group_key,destination,idempotency_key,payload) VALUES('${ownerId}'::uuid,'rbac-own','test','forbidden-outbox','{}'::jsonb)`);
  await expectPermissionDenied(client, 'authenticated', ownerId,
    `INSERT INTO public.hipico_domain_aggregates(owner_id,group_key,aggregate_kind,aggregate_key,status) VALUES('${ownerId}'::uuid,'rbac-own','race','forbidden-race','OPEN')`);
  await expectPermissionDenied(client, 'authenticated', ownerId,
    `INSERT INTO public.hipico_meetings(owner_id,group_key,venue_code,meeting_date,status) VALUES('${ownerId}'::uuid,'rbac-own','QA','2026-09-13','OPEN')`);
  await expectPermissionDenied(client, 'authenticated', ownerId,
    `INSERT INTO public.hipico_group_automation(owner_id,group_key,group_id,mode) VALUES('${ownerId}'::uuid,'rbac-own','lab-group','SHADOW')`);
  await expectPermissionDenied(client, 'authenticated', ownerId,
    `INSERT INTO public.hipico_provider_evidence(owner_id,group_key,provider_id,capability,source,source_provider,fetched_at,freshness,officiality,payload_hash,normalized,provenance) VALUES('${ownerId}'::uuid,'rbac-own','test-provider','getRace','https://example.invalid','test-provider',now(),'FRESH','observed',repeat('a',64),'{}'::jsonb,'{}'::jsonb)`);
  await expectPermissionDenied(client, 'authenticated', ownerId,
    `SELECT raw_pdf FROM public.hipico_documents LIMIT 1`);
  await expectPermissionDenied(client, 'authenticated', ownerId,
    `INSERT INTO public.hipico_documents(owner_id,group_key,sha256,size_bytes,page_count_estimate,filename,mime,raw_pdf) VALUES('${ownerId}'::uuid,'rbac-own',repeat('a',64),1,1,'x.pdf','application/pdf',decode('00','hex'))`);
  await expectPermissionDenied(client, 'anon', null, `SELECT owner_id FROM public.hipico_workspaces LIMIT 1`);
  await expectPermissionDenied(client, 'anon', null, `SELECT id FROM public.hipico_documents LIMIT 1`);

  await fs.mkdir(path.dirname(rbacArtifact), { recursive: true });
  await fs.writeFile(rbacArtifact, `${JSON.stringify({
    schema: 'hipico-rbac.v290-current',
    sha: qaSha,
    status: 'PASS',
    database: 'isolated-ephemeral',
    checkedAt: new Date().toISOString(),
    migrations,
    assertions: {
      workspaceOwnerIsolation: true,
      messageOwnerIsolation: true,
      authenticatedLedgerWriteDenied: true,
      authenticatedOutboxWriteDenied: true,
      authenticatedCanonicalDomainWriteDenied: true,
      authenticatedRaceWriteDenied: true,
      authenticatedAgentAutomationWriteDenied: true,
      authenticatedProviderEvidenceWriteDenied: true,
      authenticatedRawDocumentReadDenied: true,
      authenticatedDocumentWriteDenied: true,
      anonWorkspaceReadDenied: true,
      anonDocumentReadDenied: true,
      agentPolicyColumnsNotNull,
      agentMetricColumnsNotNull,
      agentPolicyConstraintsPresent,
      agentPolicyConstraints: [...agentConstraints].sort(),
      observabilityAppendOnlyTriggerPresent,
      auditIdempotencyTriggerPresent,
      auditV26ColumnsPresent,
      auditV26ConstraintsPresent,
      auditV26Constraints: [...auditConstraints].sort(),
      auditRpcAnonExecuteDenied,
      auditRpcAuthenticatedExecuteAllowed,
      auditRpcServiceRoleExecuteAllowed,
      immutableAuditTriggers: [...triggers].sort(),
      rlsTables: required
    }
  }, null, 2)}\n`, 'utf8');

  console.log(`[hipico-v290] current schema ready (${required.length} required tables; v12-v26 RLS/RBAC evidence executed; phase=${finalPhase ? 'final' : 'full'})`);
  }
} catch (error) {
  try { await client.query('ROLLBACK'); } catch {}
  throw error;
} finally {
  await client.end();
}
