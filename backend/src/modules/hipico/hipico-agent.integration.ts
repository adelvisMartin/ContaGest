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