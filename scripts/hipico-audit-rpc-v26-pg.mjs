import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const databaseUrl = String(process.env.HIPICO_E2E_DATABASE_URL || '').trim();
const ownerId = String(process.env.HIPICO_E2E_OWNER_ID || '11111111-1111-4111-8111-111111111111').trim();
const otherOwnerId = '22222222-2222-4222-8222-222222222222';
const viewerId = '33333333-3333-4333-8333-333333333333';
const auditorId = '44444444-4444-4444-8444-444444444444';
const operatorId = '55555555-5555-4555-8555-555555555555';

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
  return db;
}

async function readSql(relative) {
  return fs.readFile(path.resolve(relative), 'utf8');
}

let savepointIndex = 0;
async function runAs(client, role, subject, fn) {
  const savepoint = `hipico_v26_sp_${++savepointIndex}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  try {
    await client.query(`SET LOCAL ROLE ${role}`);
    await client.query(`SELECT set_config('request.jwt.claim.sub',$1,true)`, [subject || '']);
    await client.query(`SELECT set_config('request.jwt.claims',$1,true)`, [JSON.stringify(subject ? { sub: subject, role } : { role })]);
    const value = await fn();
    await client.query('RESET ROLE');
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    return value;
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    throw error;
  }
}

async function expectDbError(client, { role = 'authenticated', subject = operatorId, code, marker }, fn) {
  let observed = null;
  try {
    await runAs(client, role, subject, fn);
  } catch (error) {
    observed = error;
  }
  assert.ok(observed, `Expected ${marker || code || 'database error'}`);
  if (code) assert.equal(observed.code, code, `${marker || code}: unexpected SQLSTATE ${observed.code}`);
  if (marker) assert.match(String(observed.message || observed), new RegExp(marker));
}

function validEvent(overrides = {}) {
  return {
    id: `audit-${crypto.randomUUID()}`,
    groupId: 'group-qa',
    action: 'race_created',
    entityType: 'race',
    entityId: 'race-qa-1',
    message: 'QA audit event',
    payload: { note: 'bounded' },
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

assertSafe(databaseUrl);
const client = new Client({ connectionString: databaseUrl });
await client.connect();

try {
  // The complete probe is transactional: fixtures + helper shims + v25/v26 DDL + assertions are rolled back.
  await client.query('BEGIN');

  const ownerWorkspace = await client.query(
    `SELECT id FROM public.hipico_workspaces WHERE owner_id=$1::uuid LIMIT 1`,
    [ownerId]
  );
  assert.equal(ownerWorkspace.rows.length, 1, 'v290 base schema must seed the primary QA workspace');
  const workspaceId = ownerWorkspace.rows[0].id;

  await client.query(`
    INSERT INTO public.hipico_workspaces(owner_id,name,state,version)
    VALUES($1::uuid,'Other owner','{}'::jsonb,1)
    ON CONFLICT(owner_id) DO NOTHING`, [otherOwnerId]);
  const otherWorkspace = await client.query(`SELECT id FROM public.hipico_workspaces WHERE owner_id=$1::uuid`, [otherOwnerId]);

  // Reproduce the deployed delegated-access contract inside this rolled-back transaction.
  // The real project resolves user -> workspace_owner_id + access role through these helpers.
  await client.query(`
    CREATE TABLE public.hipico_v26_access_fixture(
      user_id uuid primary key,
      workspace_owner_id uuid not null,
      role text not null,
      status text not null default 'active'
    );
    INSERT INTO public.hipico_v26_access_fixture(user_id,workspace_owner_id,role,status) VALUES
      ('${operatorId}'::uuid,'${ownerId}'::uuid,'operator','active'),
      ('${viewerId}'::uuid,'${ownerId}'::uuid,'viewer','active'),
      ('${auditorId}'::uuid,'${ownerId}'::uuid,'auditor','active');

    CREATE OR REPLACE FUNCTION public.hipico_workspace_owner()
    RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
      SELECT fixture.workspace_owner_id
      FROM public.hipico_v26_access_fixture fixture
      WHERE fixture.user_id=auth.uid() AND fixture.status='active'
      LIMIT 1
    $$;
    CREATE OR REPLACE FUNCTION public.hipico_access_role()
    RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
      SELECT fixture.role
      FROM public.hipico_v26_access_fixture fixture
      WHERE fixture.user_id=auth.uid() AND fixture.status='active'
      LIMIT 1
    $$;
  `);

  const legacy = await client.query(`
    INSERT INTO public.hipico_audit_events(owner_id,workspace_id,action,entity_type,entity_id,payload)
    VALUES($1::uuid,$2::uuid,'legacy_before_v26','legacy','legacy-1','{}'::jsonb)
    RETURNING id`, [ownerId, workspaceId]);

  await client.query(await readSql('supabase/sql/hipico_v25_observability.sql'));
  await client.query(await readSql('supabase/sql/hipico_v26_audit_rpc_integrity.sql'));

  const legacyAfter = await client.query(
    `SELECT source,authority FROM public.hipico_audit_events WHERE id=$1`,
    [legacy.rows[0].id]
  );
  assert.deepEqual(legacyAfter.rows[0], { source: 'legacy', authority: 'legacy' });

  await expectDbError(client, { code: '42501', marker: 'permission denied' }, async () => {
    await client.query(`INSERT INTO public.hipico_audit_events(owner_id,action,entity_type,payload) VALUES($1::uuid,'x','x','{}'::jsonb)`, [ownerId]);
  });

  const forged = validEvent({
    actorUserId: 'forged-user',
    actorRole: 'admin',
    source: 'server',
    authority: 'authoritative',
    financialAuthority: true,
    settlementAuthority: true,
    payload: {
      actorUserId: 'forged-user', actorRole: 'admin', source: 'server', authority: 'authoritative',
      financialAuthority: true, settlementAuthority: true, note: 'kept'
    }
  });
  const inserted = await runAs(client, 'authenticated', operatorId, () => client.query(
    `SELECT public.hipico_append_audit($1::uuid,$2,$3,$4,$5::jsonb) AS id`,
    [workspaceId, 'race_created', 'race', 'race-qa-1', JSON.stringify(forged)]
  ));
  const auditId = inserted.rows[0].id;
  assert.ok(auditId);

  const row = await client.query(`
    SELECT owner_id::text,workspace_id::text,action,entity_type,entity_id,source,authority,payload
    FROM public.hipico_audit_events WHERE id=$1`, [auditId]);
  assert.equal(row.rows[0].owner_id, ownerId, 'delegated operator must not become workspace owner');
  assert.equal(row.rows[0].workspace_id, String(workspaceId));
  assert.equal(row.rows[0].source, 'client_sync');
  assert.equal(row.rows[0].authority, 'advisory');
  assert.equal(row.rows[0].payload.actorUserId, operatorId, 'actor identity must remain the authenticated operator');
  assert.equal(row.rows[0].payload.actorRole, 'operator');
  assert.equal(row.rows[0].payload.source, 'client_sync');
  assert.equal(row.rows[0].payload.authority, 'advisory');
  assert.equal(row.rows[0].payload.financialAuthority, false);
  assert.equal(row.rows[0].payload.settlementAuthority, false);
  assert.equal(row.rows[0].payload.payload.note, 'kept');
  assert.equal(row.rows[0].payload.payload.actorUserId, undefined);

  const replay = await runAs(client, 'authenticated', operatorId, () => client.query(
    `SELECT public.hipico_append_audit($1::uuid,$2,$3,$4,$5::jsonb) AS id`,
    [workspaceId, 'race_created', 'race', 'race-qa-1', JSON.stringify(forged)]
  ));
  assert.equal(String(replay.rows[0].id), String(auditId));

  await expectDbError(client, { code: '23505', marker: 'HIPICO_AUDIT_REPLAY_MISMATCH' }, () =>
    client.query(`SELECT public.hipico_append_audit($1::uuid,$2,$3,$4,$5::jsonb)`,
      [workspaceId, 'race_created', 'race', 'race-qa-1', JSON.stringify({ ...forged, message: 'different' })])
  );
  await expectDbError(client, { code: '22023', marker: 'HIPICO_AUDIT_ACTION_FORBIDDEN' }, () =>
    client.query(`SELECT public.hipico_append_audit($1::uuid,$2,$3,$4,$5::jsonb)`,
      [workspaceId, 'made_up_action', 'race', 'race-qa-2', JSON.stringify(validEvent())])
  );
  await expectDbError(client, { code: '22023', marker: 'HIPICO_AUDIT_ENTITY_MISMATCH' }, () =>
    client.query(`SELECT public.hipico_append_audit($1::uuid,$2,$3,$4,$5::jsonb)`,
      [workspaceId, 'race_created', 'bet', 'race-qa-2', JSON.stringify(validEvent())])
  );
  await expectDbError(client, { code: '42501', marker: 'HIPICO_WORKSPACE_FORBIDDEN' }, () =>
    client.query(`SELECT public.hipico_append_audit($1::uuid,$2,$3,$4,$5::jsonb)`,
      [otherWorkspace.rows[0].id, 'race_created', 'race', 'race-qa-2', JSON.stringify(validEvent())])
  );
  await expectDbError(client, { code: '22023', marker: 'HIPICO_AUDIT_PAYLOAD_TOO_LARGE' }, () =>
    client.query(`SELECT public.hipico_append_audit($1::uuid,$2,$3,$4,$5::jsonb)`,
      [workspaceId, 'race_created', 'race', 'race-qa-2', JSON.stringify(validEvent({ payload: { blob: 'x'.repeat(70_000) } }))])
  );
  await expectDbError(client, { subject: viewerId, code: '42501', marker: 'HIPICO_AUDIT_ROLE_FORBIDDEN' }, () =>
    client.query(`SELECT public.hipico_append_audit($1::uuid,$2,$3,$4,$5::jsonb)`,
      [workspaceId, 'race_created', 'race', 'race-viewer', JSON.stringify(validEvent())])
  );
  await expectDbError(client, { subject: auditorId, code: '42501', marker: 'HIPICO_AUDIT_ROLE_FORBIDDEN' }, () =>
    client.query(`SELECT public.hipico_append_audit($1::uuid,$2,$3,$4,$5::jsonb)`,
      [workspaceId, 'race_created', 'race', 'race-auditor', JSON.stringify(validEvent())])
  );
  await expectDbError(client, { role: 'anon', subject: null, code: '42501', marker: 'HIPICO_ACCESS_REQUIRED' }, () =>
    client.query(`SELECT public.hipico_append_audit($1::uuid,$2,$3,$4,$5::jsonb)`,
      [workspaceId, 'race_created', 'race', 'race-anon', JSON.stringify(validEvent())])
  );

  console.log(JSON.stringify({
    schema: 'hipico-audit-rpc-integrity.v26',
    status: 'PASS',
    transaction: 'ROLLBACK',
    assertions: {
      historicalRowsRemainLegacy: true,
      directAuthenticatedInsertDenied: true,
      delegatedOperatorAppendAllowed: true,
      delegatedOwnerPreserved: true,
      viewerDenied: true,
      auditorDenied: true,
      crossWorkspaceDenied: true,
      unknownActionDenied: true,
      actionEntityMismatchDenied: true,
      oversizedPayloadDenied: true,
      serverOwnedActorAndProvenance: true,
      financialAuthority: false,
      settlementAuthority: false,
      idempotentReplay: true,
      replayMismatchDenied: true
    }
  }, null, 2));
} finally {
  try { await client.query('ROLLBACK'); } catch {}
  await client.end();
}
