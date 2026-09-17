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

async function expectDbError(client, { role = 'authenticated', subject = ownerId, code, marker }, fn) {
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
  // The complete probe is transactional: fixture + v25/v26 DDL + all assertions are rolled back.
  await client.query('BEGIN');

  const ownerWorkspace = await client.query(
    `SELECT id FROM public.hipico_workspaces WHERE owner_id=$1::uuid LIMIT 1`,
    [ownerId]
  );
  assert.equal(ownerWorkspace.rows.length, 1, 'v290 base schema must seed the primary QA workspace');
  const workspaceId = ownerWorkspace.rows[0].id;

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

  await client.query(`
    INSERT INTO public.hipico_workspaces(owner_id,name,state,version)
    VALUES
      ($1::uuid,'Other owner','{}'::jsonb,1),
      ($2::uuid,'Viewer owner','{}'::jsonb,1),
      ($3::uuid,'Auditor owner','{}'::jsonb,1)
    ON CONFLICT(owner_id) DO NOTHING`, [otherOwnerId, viewerId, auditorId]);

  // Simulate future/read-only roles only inside this rolled-back transaction. v26 must deny any role
  // outside admin/operator even if the profile enum evolves later.
  await client.query('ALTER TABLE public.hipico_profiles DROP CONSTRAINT IF EXISTS hipico_profiles_role_check');
  await client.query(`
    INSERT INTO public.hipico_profiles(owner_id,display_name,role,preferences)
    VALUES
      ($1::uuid,'QA operator','operator','{}'::jsonb),
      ($2::uuid,'QA viewer','viewer','{}'::jsonb),
      ($3::uuid,'QA auditor','auditor','{}'::jsonb)
    ON CONFLICT(owner_id) DO UPDATE SET role=excluded.role`, [ownerId, viewerId, auditorId]);

  const otherWorkspace = await client.query(`SELECT id FROM public.hipico_workspaces WHERE owner_id=$1::uuid`, [otherOwnerId]);
  const viewerWorkspace = await client.query(`SELECT id FROM public.hipico_workspaces WHERE owner_id=$1::uuid`, [viewerId]);
  const auditorWorkspace = await client.query(`SELECT id FROM public.hipico_workspaces WHERE owner_id=$1::uuid`, [auditorId]);

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
  const inserted = await runAs(client, 'authenticated', ownerId, () => client.query(
    `SELECT public.hipico_append_audit($1::uuid,$2,$3,$4,$5::jsonb) AS id`,
    [workspaceId, 'race_created', 'race', 'race-qa-1', JSON.stringify(forged)]
  ));
  const auditId = inserted.rows[0].id;
  assert.ok(auditId);

  const row = await client.query(`
    SELECT owner_id::text,workspace_id::text,action,entity_type,entity_id,source,authority,payload
    FROM public.hipico_audit_events WHERE id=$1`, [auditId]);
  assert.equal(row.rows[0].owner_id, ownerId);
  assert.equal(row.rows[0].workspace_id, String(workspaceId));
  assert.equal(row.rows[0].source, 'client_sync');
  assert.equal(row.rows[0].authority, 'advisory');
  assert.equal(row.rows[0].payload.actorUserId, ownerId);
  assert.equal(row.rows[0].payload.actorRole, 'operator');
  assert.equal(row.rows[0].payload.source, 'client_sync');
  assert.equal(row.rows[0].payload.authority, 'advisory');
  assert.equal(row.rows[0].payload.financialAuthority, false);
  assert.equal(row.rows[0].payload.settlementAuthority, false);
  assert.equal(row.rows[0].payload.payload.note, 'kept');
  assert.equal(row.rows[0].payload.payload.actorUserId, undefined);

  const replay = await runAs(client, 'authenticated', ownerId, () => client.query(
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
      [viewerWorkspace.rows[0].id, 'race_created', 'race', 'race-viewer', JSON.stringify(validEvent())])
  );
  await expectDbError(client, { subject: auditorId, code: '42501', marker: 'HIPICO_AUDIT_ROLE_FORBIDDEN' }, () =>
    client.query(`SELECT public.hipico_append_audit($1::uuid,$2,$3,$4,$5::jsonb)`,
      [auditorWorkspace.rows[0].id, 'race_created', 'race', 'race-auditor', JSON.stringify(validEvent())])
  );
  await expectDbError(client, { role: 'anon', subject: null, code: '42501', marker: 'HIPICO_AUTH_REQUIRED' }, () =>
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
      operatorAppendAllowed: true,
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
