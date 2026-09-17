import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;
const databaseUrl = String(process.env.HIPICO_E2E_DATABASE_URL || '').trim();
const migrationPath = path.resolve('supabase/sql/hipico_v26_audit_rpc_integrity.sql');

function assertSafeLocalDatabase(value) {
  if (!value) throw new Error('HIPICO_E2E_DATABASE_URL is required.');
  const url = new URL(value);
  if (!['127.0.0.1','localhost','::1'].includes(url.hostname.toLowerCase())) {
    throw new Error(`Refusing non-local audit RPC probe host: ${url.hostname}`);
  }
  const database = url.pathname.replace(/^\//,'');
  if (!/^hipico_e2e_[a-z0-9_]{8,63}$/.test(database)) {
    throw new Error(`Refusing database without hipico_e2e_ run-isolation prefix: ${database}`);
  }
  return { database };
}

const PROBE_SQL = String.raw`
DO $probe$
DECLARE
  v_user uuid;
  v_owner uuid;
  v_workspace uuid;
  v_other_owner uuid;
  v_other_workspace uuid;
  v_id bigint;
  v_replay bigint;
  v_payload jsonb;
  v_source text;
  v_authority text;
  v_row_owner uuid;
BEGIN
  SELECT hu.user_id,hu.workspace_owner_id
    INTO v_user,v_owner
  FROM public.hipico_users hu
  WHERE hu.status='active'
  ORDER BY CASE WHEN hu.role='admin' THEN 0 ELSE 1 END,hu.user_id
  LIMIT 1;
  IF v_user IS NULL THEN RAISE EXCEPTION 'V26_PROBE_NO_ACTIVE_USER'; END IF;

  SELECT w.id INTO v_workspace
  FROM public.hipico_workspaces w
  WHERE w.owner_id=v_owner
  LIMIT 1;
  IF v_workspace IS NULL THEN RAISE EXCEPTION 'V26_PROBE_NO_WORKSPACE'; END IF;

  SELECT u.id INTO v_other_owner FROM auth.users u WHERE u.id<>v_owner LIMIT 1;
  IF v_other_owner IS NOT NULL THEN
    INSERT INTO public.hipico_workspaces(owner_id,name,state,version)
    VALUES(v_other_owner,'v26-probe-other','{}'::jsonb,1)
    ON CONFLICT(owner_id) DO UPDATE SET name=excluded.name
    RETURNING id INTO v_other_workspace;
  END IF;

  UPDATE public.hipico_users SET role='admin' WHERE user_id=v_user;
  PERFORM set_config('request.jwt.claim.sub',v_user::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',v_user::text,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  v_id:=public.hipico_append_audit(
    v_workspace,'settings_updated','workspace','v26-entity',
    jsonb_build_object(
      'id','v26-probe-admin','actorUserId','forged','actorRole','auditor',
      'source','forged','authority','system','financialAuthority',true,'settlementAuthority',true,
      'nested',jsonb_build_object('authority','forged','ownerId','forged'),'message','probe'
    )
  );
  EXECUTE 'RESET ROLE';

  SELECT a.payload,a.source,a.authority,a.owner_id
    INTO v_payload,v_source,v_authority,v_row_owner
  FROM public.hipico_audit_events a
  WHERE a.id=v_id;

  IF v_row_owner<>v_owner THEN RAISE EXCEPTION 'V26_PROBE_OWNER_NOT_SERVER_DERIVED'; END IF;
  IF v_source<>'client_sync' OR v_authority<>'advisory' THEN RAISE EXCEPTION 'V26_PROBE_PROVENANCE_INVALID'; END IF;
  IF v_payload->>'actorUserId'<>v_user::text OR v_payload->>'actorRole'<>'admin' THEN
    RAISE EXCEPTION 'V26_PROBE_ACTOR_SPOOFED';
  END IF;
  IF (v_payload->>'financialAuthority')::boolean<>false OR (v_payload->>'settlementAuthority')::boolean<>false THEN
    RAISE EXCEPTION 'V26_PROBE_AUTHORITY_ESCALATED';
  END IF;
  IF (v_payload->'nested') ? 'authority' OR (v_payload->'nested') ? 'ownerId' THEN
    RAISE EXCEPTION 'V26_PROBE_RESERVED_NESTED_KEY_SURVIVED';
  END IF;

  PERFORM set_config('request.jwt.claim.sub',v_user::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  v_replay:=public.hipico_append_audit(
    v_workspace,'settings_updated','workspace','v26-entity',
    jsonb_build_object(
      'id','v26-probe-admin','actorUserId','another-forgery','actorRole','viewer',
      'source','evil','authority','evil','financialAuthority',true,'settlementAuthority',true,
      'nested',jsonb_build_object('authority','other','ownerId','other'),'message','probe'
    )
  );
  IF v_replay<>v_id THEN RAISE EXCEPTION 'V26_PROBE_REPLAY_NOT_IDEMPOTENT'; END IF;

  BEGIN
    PERFORM public.hipico_append_audit(v_workspace,'settings_updated','workspace','changed','{"id":"v26-probe-admin","message":"probe"}'::jsonb);
    RAISE EXCEPTION 'V26_EXPECTED_REPLAY_MISMATCH_MISSING';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%HIPICO_AUDIT_REPLAY_MISMATCH%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.hipico_append_audit(v_workspace,'unknown_action','workspace','x','{"id":"v26-unknown"}'::jsonb);
    RAISE EXCEPTION 'V26_EXPECTED_ACTION_REJECTION_MISSING';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%HIPICO_AUDIT_ACTION_INVALID%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.hipico_append_audit(v_workspace,'race_locked','bet','x','{"id":"v26-mismatch"}'::jsonb);
    RAISE EXCEPTION 'V26_EXPECTED_ENTITY_REJECTION_MISSING';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%HIPICO_AUDIT_ENTITY_MISMATCH%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.hipico_append_audit(
      v_workspace,'settings_updated','workspace','x',
      jsonb_build_object('id','v26-large','blob',repeat('x',17000))
    );
    RAISE EXCEPTION 'V26_EXPECTED_PAYLOAD_REJECTION_MISSING';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%HIPICO_AUDIT_PAYLOAD_TOO_LARGE%' THEN RAISE; END IF;
  END;

  IF v_other_owner IS NOT NULL THEN
    BEGIN
      PERFORM public.hipico_append_audit(v_other_workspace,'settings_updated','workspace','x','{"id":"v26-cross"}'::jsonb);
      RAISE EXCEPTION 'V26_EXPECTED_CROSS_WORKSPACE_REJECTION_MISSING';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%HIPICO_WORKSPACE_FORBIDDEN%' THEN RAISE; END IF;
    END;
  END IF;
  EXECUTE 'RESET ROLE';

  UPDATE public.hipico_users SET role='operator' WHERE user_id=v_user;
  PERFORM set_config('request.jwt.claim.sub',v_user::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.hipico_append_audit(v_workspace,'settings_updated','workspace','v26-operator','{"id":"v26-operator"}'::jsonb);
  EXECUTE 'RESET ROLE';

  UPDATE public.hipico_users SET role='viewer' WHERE user_id=v_user;
  PERFORM set_config('request.jwt.claim.sub',v_user::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.hipico_append_audit(v_workspace,'settings_updated','workspace','v26-viewer','{"id":"v26-viewer"}'::jsonb);
    RAISE EXCEPTION 'V26_EXPECTED_VIEWER_REJECTION_MISSING';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%HIPICO_AUDIT_ROLE_FORBIDDEN%' THEN RAISE; END IF;
  END;
  EXECUTE 'RESET ROLE';

  UPDATE public.hipico_users SET role='auditor' WHERE user_id=v_user;
  PERFORM set_config('request.jwt.claim.sub',v_user::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.hipico_append_audit(v_workspace,'settings_updated','workspace','v26-auditor','{"id":"v26-auditor"}'::jsonb);
    RAISE EXCEPTION 'V26_EXPECTED_AUDITOR_REJECTION_MISSING';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%HIPICO_AUDIT_ROLE_FORBIDDEN%' THEN RAISE; END IF;
  END;
  EXECUTE 'RESET ROLE';

  IF has_function_privilege('anon','public.hipico_append_audit(uuid,text,text,text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'V26_PROBE_ANON_EXECUTE_PRESENT';
  END IF;
  IF NOT has_function_privilege('authenticated','public.hipico_append_audit(uuid,text,text,text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'V26_PROBE_AUTH_EXECUTE_MISSING';
  END IF;
  IF NOT has_function_privilege('service_role','public.hipico_append_audit(uuid,text,text,text,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'V26_PROBE_SERVICE_EXECUTE_MISSING';
  END IF;
END
$probe$;
`;

assertSafeLocalDatabase(databaseUrl);
const migration=await fs.readFile(migrationPath,'utf8');
const client=new Client({connectionString:databaseUrl});
await client.connect();

try {
  await client.query('BEGIN');
  await client.query(migration);
  await client.query(PROBE_SQL);
  console.log(JSON.stringify({
    schema:'hipico-audit-rpc-integrity.v14',
    status:'PASS',
    database:'isolated-local-postgresql',
    migration:'hipico_v26_audit_rpc_integrity.sql'
  }));
} finally {
  try { await client.query('ROLLBACK'); } catch {}
  await client.end();
}
