import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { prisma } from '../../database/prisma.js';
import { HipicoBotStore, processIncoming } from './hipico-bot.service.js';
import { hipicoDomainPersistenceReadiness } from './hipico-domain-event.store.js';
import { TestChannelAdapter, type NormalizedChannelMessage } from './hipico-test-channel.js';

const OWNER_ID = String(process.env.HIPICO_E2E_OWNER_ID || '11111111-1111-4111-8111-111111111111');
const DATABASE_URL = String(process.env.HIPICO_E2E_DATABASE_URL || process.env.DATABASE_URL || '').trim();
const runKey = `v290-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

function requireIsolatedDatabase() {
  assert.ok(DATABASE_URL, 'HIPICO_E2E_DATABASE_URL is required for production E2E');
  const url = new URL(DATABASE_URL);
  assert.ok(
    ['127.0.0.1', 'localhost', '::1'].includes(url.hostname.toLowerCase()),
    'E2E PostgreSQL must be loopback-only'
  );
  assert.match(
    url.pathname.replace(/^\//, ''),
    /^hipico_e2e_[a-z0-9_]{8,63}$/,
    'E2E PostgreSQL must use a hipico_e2e_ database'
  );
}

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
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint AS count FROM public."${table}"`
  );
  return Number(rows[0]?.count || 0);
}

requireIsolatedDatabase();
after(async () => { await prisma.$disconnect(); });

test('TestChannel -> classification -> PostgreSQL -> simulated response is persistent and replay-safe', async () => {
  assert.equal(
    await HipicoBotStore.dbReady(true),
    true,
    'persistent PostgreSQL path is mandatory; memory fallback is forbidden'
  );

  const channel = new TestChannelAdapter('production-e2e');
  await channel.connect();
  const beforeEvents = await countPrismaTable('HipicoWebhookEvent');
  const beforeOutbox = await countPrismaTable('HipicoBotOutbox');
  let result: any = null;

  const unsubscribe = channel.receive(async (message) => {
    result = await processIncoming(botMessage(message));
    if (!result?.duplicate && result?.outbox?.message) {
      await channel.send(message.groupId, result.outbox.message);
    }
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
  assert.equal(result?.duplicate, false);
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

test('canonical domain persistence readiness is fully hardened in isolated PostgreSQL', async () => {
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
