import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const databaseUrl = String(process.env.HIPICO_E2E_DATABASE_URL || '').trim();
const ownerId = String(process.env.HIPICO_E2E_OWNER_ID || '11111111-1111-4111-8111-111111111111').trim();
const migrations = [
  'supabase/sql/hipico_v12_operations.sql',
  'supabase/sql/hipico_v12_group_bridge.sql',
  'supabase/sql/hipico_v12_shadow_validation.sql',
  'supabase/sql/hipico_v13_lab_channel_bootstrap.sql',
  'supabase/sql/hipico_v14_documents.sql',
  'supabase/sql/hipico_v15_race_lifecycle.sql',
  'supabase/sql/hipico_v16_agent_shadow.sql'
];

function assertSafe(urlText) {
  if (!urlText) throw new Error('HIPICO_E2E_DATABASE_URL is required.');
  const url = new URL(urlText);
  if (!['127.0.0.1', 'localhost', '::1'].includes(url.hostname.toLowerCase())) throw new Error(`Refusing non-local E2E database host: ${url.hostname}`);
  const db = url.pathname.replace(/^\//, '');
  if (!/^hipico_e2e_[a-z0-9_]{8,63}$/.test(db)) throw new Error(`Refusing database without hipico_e2e_ run isolation prefix: ${db}`);
  return { url, db };
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
  await client.query(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$`);
  await client.query(`CREATE TABLE IF NOT EXISTS public.hipico_workspaces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL,
    state jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await client.query(`INSERT INTO public.hipico_workspaces(owner_id,state) SELECT $1::uuid,'{}'::jsonb WHERE NOT EXISTS (SELECT 1 FROM public.hipico_workspaces WHERE owner_id=$1::uuid)`, [ownerId]);
  await client.query('COMMIT');

  for (const relative of migrations) {
    const sql = await fs.readFile(path.resolve(relative), 'utf8');
    console.log(`[hipico-v290] applying ${relative}`);
    await client.query(sql);
  }
  const required = ['hipico_bot_channels','hipico_messages','hipico_operation_events','hipico_shadow_evaluations','hipico_documents','hipico_document_sources','hipico_meetings','hipico_races','hipico_race_events','hipico_group_automation','hipico_agent_evaluations'];
  const rows = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename = ANY($1::text[])`, [required]);
  const found = new Set(rows.rows.map((row) => row.tablename));
  const missing = required.filter((name) => !found.has(name));
  if (missing.length) throw new Error(`E2E schema incomplete: ${missing.join(', ')}`);
  console.log(`[hipico-v290] schema ready (${required.length} required tables)`);
} catch (error) {
  try { await client.query('ROLLBACK'); } catch {}
  throw error;
} finally { await client.end(); }
