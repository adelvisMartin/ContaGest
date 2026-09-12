import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { prisma } from '../../database/prisma.js';
import { HipicoBotStore, processIncoming } from './hipico-bot.service.js';
import { persistHipicoDomainEvent, hipicoDomainPersistenceReadiness } from './hipico-domain-event.store.js';
import { readHipicoDomainAggregate } from './hipico-domain-query.store.js';
import { TestChannelAdapter, type NormalizedChannelMessage } from './hipico-test-channel.js';

const OWNER_ID = String(process.env.HIPICO_E2E_OWNER_ID || '11111111-1111-4111-8111-111111111111');
const DATABASE_URL = String(process.env.HIPICO_E2E_DATABASE_URL || process.env.DATABASE_URL || '').trim();
const runKey = `v290-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

function requireIsolatedDatabase() {
  assert.ok(DATABASE_URL, 'HIPICO_E2E_DATABASE_URL is required for production E2E');
  const url = new URL(DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(url.hostname.toLowerCase()), 'E2E PostgreSQL must be loopback-only');
  assert.match(url.pathname.replace(/^\//, ''), /^hipico_e2e_[a-z0-9_]{8,63}$/, 'E2E PostgreSQL must use a hipico_e2e_ database');
}

requireIsolatedDatabase();
after(async () => { await prisma.$disconnect(); });

function botMessage(message: NormalizedChannelMessage) {
  return {
    providerMessageId: message.externalMessageId,
    phoneNumberId: `test-channel:${message.channel}`,
    sender: message.senderId,
    messageType: message.type,
    body: message.text,
    payload: {
      groupId: message.groupId,
      historySync: message.historySync,
      channel: message.channel,
      quotedExternalMessageId: message.quotedExternalMessageId || null,
      sentAt: message.sentAt
    }
  };
}

async function countPrismaTable(table: 'HipicoWebhookEvent' | 'HipicoBotOutbox') {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(`SELECT COUNT(*)::bigint AS count FROM public."${table}"`);
  return Number(rows[0]?.count || 0);
}

function event(type: Parameters<typeof persistHipicoDomainEvent>[0]['event']['type'], key: string, payload: Record<string, unknown> = {}) {
  return {
    type,
    sourceMessageKey: key,
    sourceMessageId: key,
    rawMessage: type,
    normalizedPayload: payload,
    actorRef: 'e2e:operator',
    source: 'production_e2e',
    parserVersion: 'v290',
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    operatorConfirmed: true,
    confirmationReason: 'production e2e lifecycle validation'
  } as const;
}

async function appendRace(groupKey: string, aggregateKey: string, input: ReturnType<typeof event>) {
  return persistHipicoDomainEvent({ ownerId: OWNER_ID, groupKey, aggregateKind: 'race', aggregateKey, event: input });
}

test('TestChannel -> normalization/classification -> PostgreSQL -> response is persistent and replay-safe', async () => {
  assert.equal(await HipicoBotStore.dbReady(true), true, 'persistent PostgreSQL path is mandatory; memory fallback is forbidden');
  const channel = new TestChannelAdapter('production-e2e');
  await channel.connect();
  const beforeEvents = await countPrismaTable('HipicoWebhookEvent');
  const beforeOutbox = await countPrismaTable('HipicoBotOutbox');
  let result: any = null;
  const unsubscribe = channel.receive(async (message) => {
    result = await processIncoming(botMessage(message));
    if (!result?.duplicate && result?.outbox?.message) await channel.send(message.groupId, result.outbox.message);
  });
  const inbound: NormalizedChannelMessage = {
    channel: 'production-e2e',
    groupId: `${runKey}-group-a`,
    externalMessageId: `${runKey}-status`,
    senderId: '584121234567',
    senderLabel: 'Operador E2E',
    sentAt: new Date().toISOString(),
    type: 'text',
    text: 'estatus',
    quotedExternalMessageId: null,
    historySync: false,
    fromMe: false,
    hasMedia: false
  };

  await channel.inject(inbound);
  assert.ok(result && result.duplicate === false);
  assert.equal(await countPrismaTable('HipicoWebhookEvent'), beforeEvents + 1);
  assert.equal(await countPrismaTable('HipicoBotOutbox'), beforeOutbox + 1);
  assert.equal(channel.sent.length, 1);
  assert.equal(channel.sent[0].groupId, inbound.groupId);
  assert.ok(channel.sent[0].text.trim().length > 0);

  await channel.inject(inbound);
  assert.equal(result?.duplicate, true);
  assert.equal(await countPrismaTable('HipicoWebhookEvent'), beforeEvents + 1);
  assert.equal(await countPrismaTable('HipicoBotOutbox'), beforeOutbox + 1);
  assert.equal(channel.sent.length, 1);

  unsubscribe();
  await channel.disconnect();
});

test('canonical persistence is fully hardened in the isolated PostgreSQL database', async () => {
  const readiness = await hipicoDomainPersistenceReadiness();
  assert.deepEqual(readiness, {
    ready: true,
    tablesReady: true,
    confirmationAuditReady: true,
    sourceIdentityReady: true,
    aggregateFkReady: true,
    confirmationConstraintReady: true,
    immutableTriggerReady: true,
    rlsReady: true,
    authenticatedRoleReady: true,
    browserWritesRevoked: true
  });
});

test('race lifecycle reaches the current canonical equivalents of provisional/official result without closing as settlement', async () => {
  const groupKey = `${runKey}-lifecycle`;
  const aggregateKey = `${runKey}-race-1`;
  const opened = event('RACE_OPENED', `${aggregateKey}:open`, { raceKey: aggregateKey });
  const closed = event('RACE_CLOSED', `${aggregateKey}:close`, { raceKey: aggregateKey });
  const result = event('RESULT_RECORDED', `${aggregateKey}:result`, { raceKey: aggregateKey, resultStage: 'provisional' });
  const settlementReady = event('SETTLEMENT_READY', `${aggregateKey}:settlement-ready`, { raceKey: aggregateKey });
  const settled = event('SETTLEMENT_RECORDED', `${aggregateKey}:settled`, { raceKey: aggregateKey });
  const balanced = event('BALANCE_CONFIRMED', `${aggregateKey}:balanced`, { raceKey: aggregateKey });
  const published = event('RACE_PUBLISHED', `${aggregateKey}:official`, { raceKey: aggregateKey, resultStage: 'official' });

  assert.equal((await appendRace(groupKey, aggregateKey, opened)).nextState, 'OPEN');
  assert.equal((await appendRace(groupKey, aggregateKey, closed)).nextState, 'CLOSED');
  assert.equal((await appendRace(groupKey, aggregateKey, result)).nextState, 'RESULT_RECEIVED');
  assert.equal((await appendRace(groupKey, aggregateKey, settlementReady)).nextState, 'SETTLEMENT_READY');
  assert.equal((await appendRace(groupKey, aggregateKey, settled)).nextState, 'SETTLED');
  assert.equal((await appendRace(groupKey, aggregateKey, balanced)).nextState, 'BALANCED');
  assert.equal((await appendRace(groupKey, aggregateKey, published)).nextState, 'PUBLISHED');

  const replay = await appendRace(groupKey, aggregateKey, published);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.stateChanged, false);

  const snapshot = await readHipicoDomainAggregate({ ownerId: OWNER_ID, groupKey, aggregateKind: 'race', aggregateKey, limit: 20 });
  assert.equal(snapshot?.aggregate.status, 'PUBLISHED');
  assert.equal(snapshot?.aggregate.stateVersion, 7);
  assert.equal(snapshot?.events.length, 7);
});

test('simultaneous groups A/B remain isolated even with the same race key and source labels', async () => {
  const groupA = `${runKey}-group-a`;
  const groupB = `${runKey}-group-b`;
  const aggregateKey = `${runKey}-shared-race-key`;
  const openA = event('RACE_OPENED', `${runKey}:A:open`, { marker: 'A' });
  const openB = event('RACE_OPENED', `${runKey}:B:open`, { marker: 'B' });
  await Promise.all([
    appendRace(groupA, aggregateKey, openA),
    appendRace(groupB, aggregateKey, openB)
  ]);

  const [a, b] = await Promise.all([
    readHipicoDomainAggregate({ ownerId: OWNER_ID, groupKey: groupA, aggregateKind: 'race', aggregateKey, limit: 10 }),
    readHipicoDomainAggregate({ ownerId: OWNER_ID, groupKey: groupB, aggregateKind: 'race', aggregateKey, limit: 10 })
  ]);
  assert.equal(a?.aggregate.status, 'OPEN');
  assert.equal(b?.aggregate.status, 'OPEN');
  assert.equal(a?.events.length, 1);
  assert.equal(b?.events.length, 1);
  assert.deepEqual(a?.events[0].normalizedPayload, { marker: 'A' });
  assert.deepEqual(b?.events[0].normalizedPayload, { marker: 'B' });

  const contamination = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM public.hipico_domain_events
    WHERE owner_id=${OWNER_ID}::uuid
      AND aggregate_key=${aggregateKey}
      AND (
        (group_key=${groupA} AND normalized_payload->>'marker' <> 'A')
        OR
        (group_key=${groupB} AND normalized_payload->>'marker' <> 'B')
      )
  `;
  assert.equal(Number(contamination[0]?.count || 0), 0);
});
