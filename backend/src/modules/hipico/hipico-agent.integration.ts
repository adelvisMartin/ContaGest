import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { after, before, test } from 'node:test';
import pg from 'pg';
import { prisma } from '../../database/prisma.js';
import { AutomationStore } from './automation.store.js';

const { Client } = pg;
const OWNER = '11111111-1111-4111-8111-111111111111';
const GROUP_KEY_A = 'agent-e2e-a';
const GROUP_KEY_B = 'agent-e2e-b';
const GROUP_ID_A = 'group-a@g.us';
const GROUP_ID_B = 'group-b@g.us';
const READ_ONLY_KEY = 'agent-read-only';
const READ_ONLY_ID = 'group-read-only@g.us';
const METRICS_KEY = 'agent-metrics-v7';
const METRICS_ID = 'group-metrics-v7@g.us';
const CONTEXT_KEY = 'agent-context-v7';
const CONTEXT_ID = 'group-context-v7@g.us';
const PROVIDER_KEY = 'agent-provider-v14';
const PROVIDER_ID = 'group-provider-v14@g.us';
const databaseUrl = String(process.env.HIPICO_E2E_DATABASE_URL || '').trim();
let admin: pg.Client;

function requireIsolatedDatabase() {
  assert.ok(databaseUrl, 'HIPICO_E2E_DATABASE_URL is required');
  assert.equal(String(process.env.DATABASE_URL || '').trim(), databaseUrl, 'DATABASE_URL must equal the isolated E2E URL');
  const url = new URL(databaseUrl);
  const database = url.pathname.replace(/^\//, '');
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(url.hostname.toLowerCase()), 'agent E2E database must be local/ephemeral');
  assert.match(database, /^hipico_agent_e2e_[a-z0-9_]{8,63}$/, 'agent E2E database must be isolated per run');
}

requireIsolatedDatabase();

async function applySql(file: string) {
  const sql = await fs.readFile(path.resolve(process.cwd(), '../supabase/sql', file), 'utf8');
  await admin.query(sql);
}

async function seedReviewedRows(input: {
  groupKey: string;
  groupId: string;
  count: number;
  seed: string;
  daysAgo: number;
  metricSchemaVersion: 'legacy-v6' | 'v7';
  raceContextErrors?: number;
}) {
  if (input.count <= 0) return;
  await admin.query(`
    insert into public.hipico_agent_evaluations(
      id, owner_id, group_key, group_id, message_hash, expected_intent, predicted_intent, actual_intent,
      confidence, risk, tool, can_act, model_version, matched,
      high_risk_false_positive, unauthorized_action, conflict, evidence, created_at, reviewed_at, reviewed_by,
      policy_disposition, policy_reason, policy_version, policy_evidence_state,
      abstained, race_context_error, metric_schema_version
    )
    select
      gen_random_uuid(), $1::uuid, $2, $3,
      encode(digest($4 || ':' || gs::text, 'sha256'), 'hex'),
      'query:NEXT_RACE', 'query:NEXT_RACE', 'query:NEXT_RACE',
      0.9900, 'safe', 'queryNextRace', false, 'e2e-seed', true,
      false, false, false, '{}'::jsonb,
      now() - make_interval(days => $5::int), now() - make_interval(days => $5::int), 'operator-token:e2e-seed',
      'HUMAN_REQUIRED', 'E2E_SEED', 'hipico-risk-policy-v1', 'FRESH',
      false, (gs <= $6::int), $7
    from generate_series(1, $8::int) as gs
  `, [
    OWNER,
    input.groupKey,
    input.groupId,
    input.seed,
    input.daysAgo,
    input.raceContextErrors || 0,
    input.metricSchemaVersion,
    input.count
  ]);
}

before(async () => {
  admin = new Client({ connectionString: databaseUrl });
  await admin.connect();
  await admin.query(`
    create schema if not exists auth;
    do $$ begin create role anon; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
    create or replace function auth.uid() returns uuid language sql stable as 'select null::uuid';
  `);
  await applySql('hipico_v22_agent_shadow.sql');
  await applySql('hipico_v23_risk_policy.sql');
  await applySql('hipico_v24_shadow_metrics.sql');
});

after(async () => {
  try { await prisma.$disconnect(); } catch {}
  if (admin) await admin.end();
});

void test('SOURCE defaults to SHADOW while unrelated groups default DISABLED', async () => {
  process.env.HIPICO_SOURCE_GROUP_ID = GROUP_ID_A;
  const store = new AutomationStore();
  const source = await store.get(OWNER, GROUP_KEY_A, GROUP_ID_A);
  const unrelated = await store.get(OWNER, GROUP_KEY_B, GROUP_ID_B);
  assert.equal(source.mode, 'SHADOW');
  assert.equal(unrelated.mode, 'DISABLED');
});

void test('read-only automation lookup returns policy defaults without creating a persistent group identity', async () => {
  const store = new AutomationStore();
  const beforeRows = await admin.query('select count(*)::int as count from public.hipico_group_automation where owner_id=$1::uuid and group_key=$2 and group_id=$3', [OWNER, READ_ONLY_KEY, READ_ONLY_ID]);
  assert.equal(beforeRows.rows[0].count, 0);
  const view = await store.read(OWNER, READ_ONLY_KEY, READ_ONLY_ID);
  assert.equal(view.mode, 'DISABLED');
  assert.equal(view.persisted, false);
  const afterRows = await admin.query('select count(*)::int as count from public.hipico_group_automation where owner_id=$1::uuid and group_key=$2 and group_id=$3', [OWNER, READ_ONLY_KEY, READ_ONLY_ID]);
  assert.equal(afterRows.rows[0].count, 0);
});

void test('SOURCE cannot be promoted above SHADOW even through the operator transition API', async () => {
  process.env.HIPICO_SOURCE_GROUP_ID = GROUP_ID_A;
  const store = new AutomationStore();
  const attempt = await store.setMode({
    ownerId: OWNER,
    groupKey: GROUP_KEY_A,
    groupId: GROUP_ID_A,
    target: 'ASSISTED',
    actorRef: 'operator-token:e2e-agent',
    ownerApproved: true,
    idempotencyKey: 'source-assisted-0001'
  });
  assert.equal(attempt.disposition, 'rejected');
  assert.equal(attempt.decision.allowed, false);
  assert.equal(attempt.decision.reason, 'SOURCE_SHADOW_ONLY');
  assert.equal(attempt.current, 'SHADOW');
  assert.equal((await store.get(OWNER, GROUP_KEY_A, GROUP_ID_A)).mode, 'SHADOW');
});

void test('automation transition replay has zero additional effects and idempotency mismatch fails closed', async () => {
  const store = new AutomationStore();
  const first = await store.setMode({ ownerId: OWNER, groupKey: GROUP_KEY_B, groupId: GROUP_ID_B, target: 'SHADOW', actorRef: 'operator-token:e2e-agent', ownerApproved: false, idempotencyKey: 'agent-shadow-0001' });
  assert.equal(first.disposition, 'applied');
  assert.equal(first.current, 'SHADOW');
  assert.equal(first.duplicate, false);
  const replay = await store.setMode({ ownerId: OWNER, groupKey: GROUP_KEY_B, groupId: GROUP_ID_B, target: 'SHADOW', actorRef: 'operator-token:e2e-agent', ownerApproved: false, idempotencyKey: 'agent-shadow-0001' });
  assert.equal(replay.duplicate, true);
  assert.equal(replay.eventId, first.eventId);
  assert.equal((await store.transitionEvents(OWNER, GROUP_KEY_B, GROUP_ID_B)).length, 1);
  await assert.rejects(store.setMode({ ownerId: OWNER, groupKey: GROUP_KEY_B, groupId: GROUP_ID_B, target: 'ASSISTED', actorRef: 'operator-token:e2e-agent', ownerApproved: false, idempotencyKey: 'agent-shadow-0001' }), /HIPICO_AUTOMATION_IDEMPOTENCY_MISMATCH/);
  assert.equal((await store.transitionEvents(OWNER, GROUP_KEY_B, GROUP_ID_B)).length, 1);
});

void test('automation transition audit is append-only even for direct database writes', async () => {
  const store = new AutomationStore();
  const events = await store.transitionEvents(OWNER, GROUP_KEY_B, GROUP_ID_B);
  const eventId = String(events[0]?.id || '');
  assert.match(eventId, /^[0-9a-f-]{36}$/i);

  await assert.rejects(
    admin.query('update public.hipico_automation_transition_events set reason = $1 where id = $2::uuid', ['tamper-attempt', eventId]),
    /HIPICO_AUTOMATION_TRANSITION_APPEND_ONLY/
  );
  await assert.rejects(
    admin.query('delete from public.hipico_automation_transition_events where id = $1::uuid', [eventId]),
    /HIPICO_AUTOMATION_TRANSITION_APPEND_ONLY/
  );

  const persisted = await store.transitionEvents(OWNER, GROUP_KEY_B, GROUP_ID_B);
  assert.ok(persisted.some((event: any) => event.id === eventId));
});

void test('reviewed agent evidence preserves deterministic risk policy and becomes immutable', async () => {
  const store = new AutomationStore();
  const riskPolicy = {
    version: 'hipico-risk-policy-v1' as const,
    disposition: 'HUMAN_REQUIRED' as const,
    reason: 'EVIDENCE_MISSING',
    autonomousSendAllowed: false,
    requiresHuman: true,
    toolExecutable: false,
    evidenceState: 'MISSING' as const,
    financialAuthority: false as const
  };
  const receipt = await store.recordEvaluation({
    ownerId: OWNER,
    groupKey: GROUP_KEY_B,
    groupId: GROUP_ID_B,
    text: '¿Cuál es la próxima carrera?',
    expectedIntent: 'query:NEXT_RACE',
    candidate: {
      intent: 'query:NEXT_RACE',
      confidence: .995,
      tool: 'queryNextRace',
      arguments: { text: '¿Cuál es la próxima carrera?' },
      risk: 'safe',
      source: 'deterministic',
      modelVersion: 'e2e'
    },
    canAct: false,
    riskPolicy,
    evidence: { source: 'e2e-review' }
  });

  await store.review({
    ownerId: OWNER,
    groupKey: GROUP_KEY_B,
    groupId: GROUP_ID_B,
    id: receipt.id,
    actualIntent: 'query:NEXT_RACE',
    actorRef: 'operator-token:e2e-agent',
    raceContextError: true
  });

  await assert.rejects(
    admin.query('update public.hipico_agent_evaluations set actual_intent=$1 where id=$2::uuid', ['query:LAST_RESULT', receipt.id]),
    /HIPICO_AGENT_EVALUATION_IMMUTABLE/
  );
  await assert.rejects(
    admin.query('update public.hipico_agent_evaluations set policy_disposition=$1 where id=$2::uuid', ['AUTO', receipt.id]),
    /HIPICO_AGENT_EVALUATION_IMMUTABLE/
  );
  await assert.rejects(
    admin.query('update public.hipico_agent_evaluations set race_context_error=false where id=$1::uuid', [receipt.id]),
    /HIPICO_AGENT_EVALUATION_IMMUTABLE/
  );
  await assert.rejects(
    admin.query('delete from public.hipico_agent_evaluations where id=$1::uuid', [receipt.id]),
    /HIPICO_AGENT_EVALUATION_IMMUTABLE/
  );
  const rows = await store.evaluations(OWNER, GROUP_KEY_B, GROUP_ID_B, 50);
  const persisted = rows.find((row: any) => row.id === receipt.id);
  assert.equal(persisted?.actualIntent, 'query:NEXT_RACE');
  assert.equal(persisted?.reviewedBy, 'operator-token:e2e-agent');
  assert.equal(persisted?.policyDisposition, 'HUMAN_REQUIRED');
  assert.equal(persisted?.policyReason, 'EVIDENCE_MISSING');
  assert.equal(persisted?.policyVersion, 'hipico-risk-policy-v1');
  assert.equal(persisted?.policyEvidenceState, 'MISSING');
  assert.equal(persisted?.raceContextError, true);
  assert.equal(persisted?.metricSchemaVersion, 'v7');
});

void test('rejected promotion is audited without changing mode and group scopes never cross', async () => {
  const store = new AutomationStore();
  const rejected = await store.setMode({ ownerId: OWNER, groupKey: GROUP_KEY_B, groupId: GROUP_ID_B, target: 'ASSISTED', actorRef: 'operator-token:e2e-agent', ownerApproved: false, idempotencyKey: 'agent-assisted-0001' });
  assert.equal(rejected.disposition, 'rejected');
  assert.equal(rejected.decision.allowed, false);
  assert.equal(rejected.current, 'SHADOW');
  assert.equal((await store.get(OWNER, GROUP_KEY_B, GROUP_ID_B)).mode, 'SHADOW');
  const eventsB = await store.transitionEvents(OWNER, GROUP_KEY_B, GROUP_ID_B);
  const eventsA = await store.transitionEvents(OWNER, GROUP_KEY_A, GROUP_ID_A);
  assert.equal(eventsB.length, 2);
  assert.ok(eventsA.length >= 1);
  assert.ok(eventsA.some((event: any) => event.disposition === 'rejected' && event.reason === 'SOURCE_SHADOW_ONLY'));
  assert.ok(eventsB.some((event: any) => event.disposition === 'rejected' && event.reason === 'SHADOW_METRICS_INSUFFICIENT'));
});

void test('historical pass cannot promote when recent v7 sample is insufficient, and replay keeps original snapshot', async () => {
  const store = new AutomationStore();
  await store.get(OWNER, METRICS_KEY, METRICS_ID);
  const shadow = await store.setMode({
    ownerId: OWNER,
    groupKey: METRICS_KEY,
    groupId: METRICS_ID,
    target: 'SHADOW',
    actorRef: 'operator-token:e2e-agent',
    ownerApproved: false,
    idempotencyKey: 'metrics-shadow-0001'
  });
  assert.equal(shadow.current, 'SHADOW');

  await seedReviewedRows({ groupKey: METRICS_KEY, groupId: METRICS_ID, count: 126, seed: 'legacy-clean', daysAgo: 45, metricSchemaVersion: 'legacy-v6' });
  await seedReviewedRows({ groupKey: METRICS_KEY, groupId: METRICS_ID, count: 74, seed: 'recent-clean', daysAgo: 1, metricSchemaVersion: 'v7' });

  const rejected = await store.setMode({
    ownerId: OWNER,
    groupKey: METRICS_KEY,
    groupId: METRICS_ID,
    target: 'ASSISTED',
    actorRef: 'operator-token:e2e-agent',
    ownerApproved: false,
    idempotencyKey: 'metrics-assisted-snapshot-0001'
  });
  assert.equal(rejected.disposition, 'rejected');
  assert.equal(rejected.decision.reason, 'RECENT_METRICS_INSUFFICIENT');
  assert.equal(rejected.metrics.reviewed, 200);
  assert.equal(rejected.metrics.recent?.reviewed, 74);
  assert.match(String(rejected.metrics.metricsSignature), /^[a-f0-9]{64}$/);
  const originalSignature = rejected.metrics.metricsSignature;

  await seedReviewedRows({ groupKey: METRICS_KEY, groupId: METRICS_ID, count: 1, seed: 'recent-clean-75', daysAgo: 1, metricSchemaVersion: 'v7' });
  const replay = await store.setMode({
    ownerId: OWNER,
    groupKey: METRICS_KEY,
    groupId: METRICS_ID,
    target: 'ASSISTED',
    actorRef: 'operator-token:e2e-agent',
    ownerApproved: false,
    idempotencyKey: 'metrics-assisted-snapshot-0001'
  });
  assert.equal(replay.duplicate, true);
  assert.equal(replay.disposition, 'rejected');
  assert.equal(replay.decision.reason, 'RECENT_METRICS_INSUFFICIENT');
  assert.equal(replay.metrics.recent?.reviewed, 74);
  assert.equal(replay.metrics.metricsSignature, originalSignature);

  const promoted = await store.setMode({
    ownerId: OWNER,
    groupKey: METRICS_KEY,
    groupId: METRICS_ID,
    target: 'ASSISTED',
    actorRef: 'operator-token:e2e-agent',
    ownerApproved: false,
    idempotencyKey: 'metrics-assisted-pass-0002'
  });
  assert.equal(promoted.disposition, 'applied');
  assert.equal(promoted.decision.reason, 'SHADOW_GATE_PASSED');
  assert.equal(promoted.metrics.reviewed, 201);
  assert.equal(promoted.metrics.recent?.reviewed, 75);
  assert.equal((await store.get(OWNER, METRICS_KEY, METRICS_ID)).mode, 'ASSISTED');
});

void test('recent race-context degradation blocks promotion even when lifetime metrics pass', async () => {
  const store = new AutomationStore();
  await store.get(OWNER, CONTEXT_KEY, CONTEXT_ID);
  const shadow = await store.setMode({
    ownerId: OWNER,
    groupKey: CONTEXT_KEY,
    groupId: CONTEXT_ID,
    target: 'SHADOW',
    actorRef: 'operator-token:e2e-agent',
    ownerApproved: false,
    idempotencyKey: 'context-shadow-0001'
  });
  assert.equal(shadow.current, 'SHADOW');

  await seedReviewedRows({ groupKey: CONTEXT_KEY, groupId: CONTEXT_ID, count: 125, seed: 'context-legacy', daysAgo: 45, metricSchemaVersion: 'legacy-v6' });
  await seedReviewedRows({ groupKey: CONTEXT_KEY, groupId: CONTEXT_ID, count: 75, seed: 'context-recent', daysAgo: 1, metricSchemaVersion: 'v7', raceContextErrors: 2 });

  const metrics = await store.metrics(OWNER, CONTEXT_KEY, CONTEXT_ID);
  assert.equal(metrics.reviewed, 200);
  assert.equal(metrics.raceContextErrors, 2);
  assert.equal(metrics.recent?.reviewed, 75);
  assert.equal(metrics.recent?.raceContextErrors, 2);

  const rejected = await store.setMode({
    ownerId: OWNER,
    groupKey: CONTEXT_KEY,
    groupId: CONTEXT_ID,
    target: 'ASSISTED',
    actorRef: 'operator-token:e2e-agent',
    ownerApproved: false,
    idempotencyKey: 'context-assisted-0001'
  });
  assert.equal(rejected.disposition, 'rejected');
  assert.equal(rejected.decision.reason, 'RECENT_METRICS_INSUFFICIENT');
  assert.equal(rejected.decision.metrics.accuracy, 1);
  assert.ok((rejected.decision.metrics.recent?.raceContextErrorRate || 0) > .02);
  assert.equal((await store.get(OWNER, CONTEXT_KEY, CONTEXT_ID)).mode, 'SHADOW');
});


void test('Jev shadow metrics are derived from immutable PostgreSQL evidence and flag safety disagreement', async () => {
  const store = new AutomationStore();
  await store.get(OWNER, PROVIDER_KEY, PROVIDER_ID);

  const rows = [
    {
      seed: 'provider-next',
      predicted: 'query:NEXT_RACE',
      actual: 'query:NEXT_RACE',
      risk: 'safe',
      disposition: 'SUGGEST',
      status: 'OBSERVED',
      intentClass: 'query_next_race',
      humanReviewProbability: .02,
      matched: true
    },
    {
      seed: 'provider-money',
      predicted: 'betting_or_balance',
      actual: 'betting_or_balance',
      risk: 'monetary',
      disposition: 'DENY',
      status: 'OBSERVED',
      intentClass: 'monetary',
      humanReviewProbability: .97,
      matched: true
    },
    {
      seed: 'provider-lifecycle-low-review',
      predicted: 'race_open',
      actual: 'race_open',
      risk: 'review',
      disposition: 'HUMAN_REQUIRED',
      status: 'OBSERVED',
      intentClass: 'lifecycle',
      humanReviewProbability: .10,
      matched: true
    },
    {
      seed: 'provider-unavailable',
      predicted: 'query:SCHEDULE',
      actual: null,
      risk: 'safe',
      disposition: 'SUGGEST',
      status: 'UNAVAILABLE',
      intentClass: null,
      humanReviewProbability: null,
      matched: null
    }
  ];

  for (const row of rows) {
    const evidence = {
      decisionProvider: {
        providerId: 'typesafe-jev',
        mode: 'SHADOW',
        status: row.status,
        authoritative: false,
        canAuthorize: false,
        model: row.status === 'OBSERVED' ? 'jev-test' : null,
        latencyMs: 5,
        failureCode: row.status === 'UNAVAILABLE' ? 'JEV_PROVIDER_UNAVAILABLE' : null,
        decision: row.intentClass ? {
          intentClass: row.intentClass,
          intentConfidence: .99,
          intentProbabilities: { [row.intentClass]: .99 },
          humanReviewProbability: row.humanReviewProbability,
          candidateAgreementProbability: .99
        } : null,
        usage: row.status === 'OBSERVED' ? { inputUnits: 10, outputUnits: 2 } : null
      }
    };
    await admin.query(`
      insert into public.hipico_agent_evaluations(
        id, owner_id, group_key, group_id, message_hash, expected_intent, predicted_intent, actual_intent,
        confidence, risk, tool, can_act, model_version, matched,
        high_risk_false_positive, unauthorized_action, conflict, evidence, created_at, reviewed_at, reviewed_by,
        policy_disposition, policy_reason, policy_version, policy_evidence_state,
        abstained, race_context_error, metric_schema_version
      ) values(
        gen_random_uuid(), $1::uuid, $2, $3, encode(digest($4, 'sha256'), 'hex'), $5, $5, $6,
        .9900, $7, null, false, 'e2e-provider-v14', $8,
        false, false, false, $9::jsonb, now() - interval '1 day',
        case when $6::text is null then null else now() - interval '1 day' end,
        case when $6::text is null then null else 'operator-token:e2e-provider' end,
        $10, 'E2E_PROVIDER', 'hipico-risk-policy-v1', 'FRESH',
        false, false, 'v7'
      )
    `, [
      OWNER,
      PROVIDER_KEY,
      PROVIDER_ID,
      row.seed,
      row.predicted,
      row.actual,
      row.risk,
      row.matched,
      JSON.stringify(evidence),
      row.disposition
    ]);
  }

  const metrics = await store.decisionProviderMetrics(OWNER, PROVIDER_KEY, PROVIDER_ID);
  assert.equal(metrics.historical.evaluations, 4);
  assert.equal(metrics.historical.observed, 3);
  assert.equal(metrics.historical.unavailable, 1);
  assert.equal(metrics.historical.reviewedObserved, 3);
  assert.equal(metrics.historical.intentClassMatched, 3);
  assert.equal(metrics.historical.safetyDisagreements, 1);
  assert.equal(metrics.recent.evaluations, 4);
  assert.equal(metrics.recent.safetyDisagreements, 1);
  assert.equal(metrics.byIntentClass.query_next_race.reviewedObserved, 1);
  assert.equal(metrics.byIntentClass.monetary.intentClassMatched, 1);
  assert.equal(metrics.byIntentClass.lifecycle.intentClassMatched, 1);
  assert.match(metrics.metricsSignature, /^[a-f0-9]{64}$/);
});
