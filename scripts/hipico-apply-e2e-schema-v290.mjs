import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const databaseUrl = String(process.env.HIPICO_E2E_DATABASE_URL || '').trim();
const ownerId = String(process.env.HIPICO_E2E_OWNER_ID || '11111111-1111-4111-8111-111111111111').trim();
const otherOwnerId = '22222222-2222-4222-8222-222222222222';
const qaSha = String(process.env.GITHUB_SHA || process.env.HIPICO_QA_SHA || process.env.HIPICO_CANDIDATE_SHA || 'local').trim();
const rbacArtifact = path.resolve('artifacts/qa/hipico-v290/postgres-rbac.json');
const migrations = [
  'supabase/sql/hipico_v12_operations.sql',
  'supabase/sql/hipico_v12_group_bridge.sql',
  'supabase/sql/hipico_v12_shadow_validation.sql',
  'supabase/sql/hipico_v13_workspace_sync_security.sql',
  'supabase/sql/hipico_v13_audit_idempotency.sql',
  'supabase/sql/hipico_v13_lab_channel_bootstrap.sql',
  'supabase/sql/hipico_v14_canonical_domain.sql',
  'supabase/sql/hipico_v15_domain_integrity_alignment.sql',
  'supabase/sql/hipico_v16_operator_confirmation_audit.sql',
  'supabase/sql/hipico_v17_outbox_reconciliation_status.sql',
  'supabase/sql/hipico_v18_documents.sql'
];

function assertSafe(urlText) {
  if (!urlText) throw new Error('HIPICO_E2E_DATABASE_URL is required.');
  const url = new URL(urlText);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname.toLowerCase())) throw new Error(`Refusing non-local E2E database host: ${url.hostname}`);
  const db = url.pathname.replace(/^\//, '');
  if (!/^hipico_e2e_[a-z0-9_]{8,63}$/.test(db)) throw new Error(`Refusing database without hipico_e2e_ run isolation prefix: ${db}`);
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
  throw new Error(`RBAC statement unexpectedly succeeded for ${role}: ${sql.slice(0, 80)}`);
}

assertSafe(databaseUrl);
const client = new Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await client.query(`DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await client.query(`DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await client.query('CREATE SCHEMA IF NOT EXISTS auth');
  await client.query(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$`);
  await client.query(`CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
  $$`);
  await client.query('COMMIT');

  for (const relative of migrations) {
    const sql = await fs.readFile(path.resolve(relative), 'utf8');
    console.log(`[hipico-v290] applying ${relative}`);
    await client.query(sql);
  }

  await client.query(`INSERT INTO public.hipico_workspaces(owner_id,name,state,version)
    VALUES($1::uuid,'Control Hípico E2E','{}'::jsonb,1)
    ON CONFLICT(owner_id) DO NOTHING`, [ownerId]);
  await client.query(`INSERT INTO public.hipico_profiles(owner_id,display_name,role,preferences)
    VALUES($1::uuid,'Operador E2E','admin','{}'::jsonb)
    ON CONFLICT(owner_id) DO NOTHING`, [ownerId]);

  const required = [
    'hipico_workspaces','hipico_profiles','hipico_audit_events',
    'hipico_bot_channels','hipico_messages','hipico_operation_events','hipico_shadow_evaluations',
    'hipico_outbox','hipico_ledger_entries','hipico_reconciliations',
    'hipico_domain_aggregates','hipico_domain_events',
    'hipico_documents','hipico_document_sources'
  ];
  const rows = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1::text[])`, [required]);
  const found = new Set(rows.rows.map((row) => row.tablename));
  const missing = required.filter((name) => !found.has(name));
  if (missing.length) throw new Error(`E2E schema incomplete: ${missing.join(', ')}`);

  const protectedTables = [...required];
  const rlsRows = await client.query(`
    SELECT relname, relrowsecurity
    FROM pg_class
    JOIN pg_namespace ON pg_namespace.oid=pg_class.relnamespace
    WHERE pg_namespace.nspname='public' AND relname = ANY($1::text[])
  `, [protectedTables]);
  const rlsState = new Map(rlsRows.rows.map((row) => [row.relname, row.relrowsecurity]));
  const rlsMissing = protectedTables.filter((name) => rlsState.get(name) !== true);
  if (rlsMissing.length) throw new Error(`RLS is not enabled for: ${rlsMissing.join(', ')}`);

  await client.query(`INSERT INTO public.hipico_workspaces(owner_id,name,state,version)
    VALUES($1::uuid,'Foreign E2E owner','{}'::jsonb,1) ON CONFLICT(owner_id) DO NOTHING`, [otherOwnerId]);
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
    ON CONFLICT(owner_id,channel_key,fingerprint) DO NOTHING`, [ownerId, ownChannel.rows[0].id, otherOwnerId, otherChannel.rows[0].id]);

  const visibleWorkspaces = await withRole(client, 'authenticated', ownerId, () => client.query(`SELECT owner_id::text AS owner_id FROM public.hipico_workspaces ORDER BY owner_id`));
  if (visibleWorkspaces.rows.length !== 1 || visibleWorkspaces.rows[0].owner_id !== ownerId) throw new Error('Workspace RLS owner isolation failed');
  const visibleMessages = await withRole(client, 'authenticated', ownerId, () => client.query(`SELECT owner_id::text AS owner_id,channel_key FROM public.hipico_messages WHERE channel_key IN ('rbac-own','rbac-other') ORDER BY channel_key`));
  if (visibleMessages.rows.length !== 1 || visibleMessages.rows[0].owner_id !== ownerId || visibleMessages.rows[0].channel_key !== 'rbac-own') throw new Error('Message RLS owner isolation failed');

  await expectPermissionDenied(client, 'authenticated', ownerId, `INSERT INTO public.hipico_ledger_entries(owner_id,group_key,participant_code,product_type,reference_type,reference_id,entry_type,amount,currency) VALUES('${ownerId}'::uuid,'rbac-own','P1','TEST','e2e','forbidden-ledger','bet',1,'VES')`);
  await expectPermissionDenied(client, 'authenticated', ownerId, `INSERT INTO public.hipico_outbox(owner_id,group_key,destination,idempotency_key,payload) VALUES('${ownerId}'::uuid,'rbac-own','test','forbidden-outbox','{}'::jsonb)`);
  await expectPermissionDenied(client, 'authenticated', ownerId, `INSERT INTO public.hipico_domain_aggregates(owner_id,group_key,aggregate_kind,aggregate_key,status) VALUES('${ownerId}'::uuid,'rbac-own','race','forbidden-race','OPEN')`);
  await expectPermissionDenied(client, 'authenticated', ownerId, `SELECT raw_pdf FROM public.hipico_documents LIMIT 1`);
  await expectPermissionDenied(client, 'authenticated', ownerId, `INSERT INTO public.hipico_documents(owner_id,group_key,sha256,size_bytes,page_count_estimate,filename,mime,raw_pdf) VALUES('${ownerId}'::uuid,'rbac-own',repeat('a',64),1,1,'x.pdf','application/pdf',decode('00','hex'))`);
  await expectPermissionDenied(client, 'anon', null, `SELECT owner_id FROM public.hipico_workspaces LIMIT 1`);
  await expectPermissionDenied(client, 'anon', null, `SELECT id FROM public.hipico_documents LIMIT 1`);

  await fs.mkdir(path.dirname(rbacArtifact), { recursive: true });
  await fs.writeFile(rbacArtifact, `${JSON.stringify({
    schema: 'hipico-rbac.v290', sha: qaSha, status: 'PASS', database: 'isolated-ephemeral', checkedAt: new Date().toISOString(),
    migrations,
    assertions: {
      workspaceOwnerIsolation: true,
      messageOwnerIsolation: true,
      authenticatedLedgerWriteDenied: true,
      authenticatedOutboxWriteDenied: true,
      authenticatedCanonicalDomainWriteDenied: true,
      authenticatedRawDocumentReadDenied: true,
      authenticatedDocumentWriteDenied: true,
      anonWorkspaceReadDenied: true,
      anonDocumentReadDenied: true,
      rlsTables: protectedTables
    }
  }, null, 2)}\n`, 'utf8');

  console.log(`[hipico-v290] schema ready (${required.length} required tables, workspace/RLS/RBAC/document evidence executed)`);
} catch (error) {
  try { await client.query('ROLLBACK'); } catch {}
  throw error;
} finally { await client.end(); }
