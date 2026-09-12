import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const databaseUrl = String(process.env.HIPICO_E2E_DATABASE_URL || '').trim();
const OWNER_ID = String(process.env.HIPICO_E2E_OWNER_ID || '11111111-1111-4111-8111-111111111111').trim();
const OTHER_OWNER_ID = '22222222-2222-4222-8222-222222222222';
const SHA = String(process.env.GITHUB_SHA || process.env.HIPICO_QA_SHA || 'local').trim();
const artifact = path.resolve(process.env.HIPICO_RBAC_ARTIFACT || '../artifacts/qa/hipico-v290/postgres-rbac.json');

function requireIsolatedDatabase() {
  assert.ok(databaseUrl, 'HIPICO_E2E_DATABASE_URL is required');
  const url = new URL(databaseUrl);
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(url.hostname.toLowerCase()), 'RBAC gate refuses non-local DB');
  assert.match(url.pathname.replace(/^\//, ''), /^hipico_e2e_[a-z0-9_]{8,63}$/, 'RBAC gate requires run-isolated database');
}

async function expectPermissionDenied(client: pg.Client, sql: string) {
  try {
    await client.query(sql);
  } catch (error: any) {
    assert.equal(error?.code, '42501', `expected permission denied (42501), got ${error?.code || error}`);
    return;
  }
  assert.fail(`statement unexpectedly succeeded: ${sql}`);
}

requireIsolatedDatabase();
const admin = new Client({ connectionString: databaseUrl });
await admin.connect();
try {
  await admin.query(`INSERT INTO public.hipico_workspaces(owner_id,name,state,version)
    VALUES($1::uuid,'Other owner','{}'::jsonb,1) ON CONFLICT(owner_id) DO NOTHING`, [OTHER_OWNER_ID]);

  const ownChannel = await admin.query(`INSERT INTO public.hipico_bot_channels(owner_id,group_key,label,channel_type,status,config)
    VALUES($1::uuid,'rbac-own','RBAC own','web_bridge','active','{}'::jsonb)
    ON CONFLICT(owner_id,group_key) DO UPDATE SET label=excluded.label RETURNING id`, [OWNER_ID]);
  const otherChannel = await admin.query(`INSERT INTO public.hipico_bot_channels(owner_id,group_key,label,channel_type,status,config)
    VALUES($1::uuid,'rbac-other','RBAC other','web_bridge','active','{}'::jsonb)
    ON CONFLICT(owner_id,group_key) DO UPDATE SET label=excluded.label RETURNING id`, [OTHER_OWNER_ID]);
  await admin.query(`INSERT INTO public.hipico_messages(
    owner_id,channel_id,channel_key,external_message_id,fingerprint,sender_role,raw_text,classification,confidence,processing_status,normalized,metadata)
    VALUES
      ($1::uuid,$2::uuid,'rbac-own','rbac-own-message','rbac-own-fingerprint','system','own','status_non_monetary',1,'processed','{}'::jsonb,'{}'::jsonb),
      ($3::uuid,$4::uuid,'rbac-other','rbac-other-message','rbac-other-fingerprint','system','other','status_non_monetary',1,'processed','{}'::jsonb,'{}'::jsonb)
    ON CONFLICT(owner_id,channel_key,fingerprint) DO NOTHING`, [OWNER_ID, ownChannel.rows[0].id, OTHER_OWNER_ID, otherChannel.rows[0].id]);
} finally {
  await admin.end();
}

const client = new Client({ connectionString: databaseUrl });
await client.connect();
const evidence: Record<string, unknown> = { schema: 'hipico-rbac.v290', sha: SHA, database: 'isolated-ephemeral' };
try {
  await client.query('BEGIN');
  await client.query('SET LOCAL ROLE authenticated');
  await client.query(`SELECT set_config('request.jwt.claim.sub',$1,true)`, [OWNER_ID]);
  await client.query(`SELECT set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ sub: OWNER_ID, role: 'authenticated' })]);

  const workspaceRows = await client.query(`SELECT owner_id::text AS owner_id FROM public.hipico_workspaces ORDER BY owner_id`);
  assert.deepEqual(workspaceRows.rows.map((row) => row.owner_id), [OWNER_ID], 'workspace RLS must hide foreign owner');

  const messageRows = await client.query(`SELECT owner_id::text AS owner_id,channel_key FROM public.hipico_messages WHERE channel_key IN ('rbac-own','rbac-other') ORDER BY channel_key`);
  assert.deepEqual(messageRows.rows, [{ owner_id: OWNER_ID, channel_key: 'rbac-own' }], 'message RLS must hide foreign group/owner rows');

  await expectPermissionDenied(client, `INSERT INTO public.hipico_ledger_entries(owner_id,group_key,participant_code,product_type,reference_type,reference_id,entry_type,amount,currency)
    VALUES('${OWNER_ID}'::uuid,'rbac-own','P1','TEST','e2e','forbidden-ledger','bet',1,'VES')`);
  await client.query('ROLLBACK');

  await client.query('BEGIN');
  await client.query('SET LOCAL ROLE authenticated');
  await client.query(`SELECT set_config('request.jwt.claim.sub',$1,true)`, [OWNER_ID]);
  await expectPermissionDenied(client, `INSERT INTO public.hipico_outbox(owner_id,group_key,destination,idempotency_key,payload)
    VALUES('${OWNER_ID}'::uuid,'rbac-own','test','forbidden-outbox','{}'::jsonb)`);
  await client.query('ROLLBACK');

  await client.query('BEGIN');
  await client.query('SET LOCAL ROLE anon');
  await expectPermissionDenied(client, `SELECT owner_id FROM public.hipico_workspaces LIMIT 1`);
  await client.query('ROLLBACK');

  Object.assign(evidence, {
    status: 'PASS',
    checkedAt: new Date().toISOString(),
    assertions: {
      authenticatedWorkspaceOwnerIsolation: true,
      authenticatedMessageOwnerIsolation: true,
      authenticatedLedgerWriteDenied: true,
      authenticatedOutboxWriteDenied: true,
      anonWorkspaceReadDenied: true
    }
  });
  await fs.mkdir(path.dirname(artifact), { recursive: true });
  await fs.writeFile(artifact, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  console.log(`[hipico-v290] PostgreSQL RLS/RBAC PASS sha=${SHA}`);
} finally {
  try { await client.query('ROLLBACK'); } catch {}
  await client.end();
}
