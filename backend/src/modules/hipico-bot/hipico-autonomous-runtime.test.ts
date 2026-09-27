import assert from 'node:assert/strict';
import { test } from 'node:test';
import { executeAutonomousLabReply, type AutonomousLabReplyInput } from './hipico-autonomous-runtime.js';
import type { WhatsAppTransport } from './hipico-whatsapp-transport.js';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'hsr-test-1',
    eventId: 'hwe-test-1',
    recipient: '120363111111111111@g.us',
    message: 'Respuesta segura',
    intent: 'query:NEXT_RACE',
    risk: 'safe',
    status: 'planned',
    providerMessageId: null,
    error: null,
    sentAt: null,
    ...overrides
  } as any;
}

function memoryStore() {
  let current = row();
  let exists = false;
  const deps = {
    ensure: async (input: any) => {
      if (!exists) {
        current = row({
          eventId: input.eventId,
          recipient: input.recipient,
          message: input.message,
          intent: input.intent,
          risk: input.risk
        });
        exists = true;
        return { row: structuredClone(current), inserted: true };
      }
      return { row: structuredClone(current), inserted: false };
    },
    claim: async (id: string) => {
      if (current.id !== id || current.status !== 'planned') return null;
      current = { ...current, status: 'sending' };
      return structuredClone(current);
    },
    get: async () => structuredClone(current),
    sent: async (_id: string, providerMessageId: string) => {
      if (current.status !== 'sending') return null;
      current = { ...current, status: 'sent', providerMessageId, sentAt: new Date().toISOString() };
      return structuredClone(current);
    },
    ambiguous: async (_id: string, reason: unknown) => {
      if (current.status !== 'sending') return null;
      current = { ...current, status: 'ambiguous', error: String(reason) };
      return structuredClone(current);
    },
    hold: async (_id: string, reason: unknown) => {
      if (!['planned', 'sending'].includes(current.status)) return null;
      current = { ...current, status: 'held', error: String(reason) };
      return structuredClone(current);
    },
    cancel: async (_id: string, reason: unknown) => {
      if (!['planned', 'sending'].includes(current.status)) return null;
      current = { ...current, status: 'cancelled', error: String(reason) };
      return structuredClone(current);
    },
    deadLetter: async (_id: string, reason: unknown) => {
      if (!['planned', 'sending', 'ambiguous'].includes(current.status)) return null;
      current = { ...current, status: 'dead_letter', error: String(reason) };
      return structuredClone(current);
    }
  };
  return { deps, current: () => structuredClone(current) };
}

function transport(handler?: () => Promise<any>) {
  let sends = 0;
  const adapter: WhatsAppTransport = {
    name: 'lab-test',
    capability: 'lab-only',
    async send() {
      sends += 1;
      if (handler) return handler();
      return { accepted: true, transport: 'lab-test', providerMessageId: `lab-${sends}`, reason: 'LAB_ONLY' };
    }
  };
  return { adapter, sends: () => sends };
}

function input(adapter: WhatsAppTransport, policy: AutonomousLabReplyInput['policy'] = () => 'AUTO'):
AutonomousLabReplyInput {
  return {
    eventId: 'hwe-test-1',
    sourceMessageId: 'waweb:test-1',
    groupId: '120363111111111111@g.us',
    groupRole: 'LAB',
    text: 'Respuesta segura',
    intent: 'query:NEXT_RACE',
    risk: 'safe',
    financialAuthority: false,
    policy,
    transport: adapter
  };
}

test('duplicate delivery and concurrent workers produce one logical LAB send', async () => {
  const store = memoryStore();
  const tx = transport();
  const [left, right] = await Promise.all([
    executeAutonomousLabReply(input(tx.adapter), store.deps as any),
    executeAutonomousLabReply(input(tx.adapter), store.deps as any)
  ]);
  assert.equal(tx.sends(), 1);
  assert.equal(store.current().status, 'sent');
  assert.ok([left.status, right.status].includes('sent'));

  const replay = await executeAutonomousLabReply(input(tx.adapter), store.deps as any);
  assert.equal(replay.status, 'duplicate');
  assert.equal(tx.sends(), 1);
});

test('late policy change AUTO -> DENY cancels after claim and before transport I/O', async () => {
  const store = memoryStore();
  const tx = transport();
  let reads = 0;
  const result = await executeAutonomousLabReply(
    input(tx.adapter, () => (++reads === 1 ? 'AUTO' : 'DENY')),
    store.deps as any
  );
  assert.equal(result.status, 'denied');
  assert.equal(store.current().status, 'cancelled');
  assert.equal(tx.sends(), 0);
});

test('HUMAN_REQUIRED is an explicit policy hold, not a generic retry fallback', async () => {
  const store = memoryStore();
  const tx = transport();
  const result = await executeAutonomousLabReply(input(tx.adapter, () => 'HUMAN_REQUIRED'), store.deps as any);
  assert.equal(result.status, 'human_required');
  assert.equal(store.current().status, 'held');
  assert.equal(tx.sends(), 0);
});

test('SOURCE is read-only and financial authority is forbidden', async () => {
  const store = memoryStore();
  const tx = transport();
  await assert.rejects(
    executeAutonomousLabReply({ ...input(tx.adapter), groupRole: 'SOURCE' }, store.deps as any),
    (error: any) => error?.code === 'HIPICO_SOURCE_READ_ONLY'
  );
  await assert.rejects(
    executeAutonomousLabReply({ ...input(tx.adapter), financialAuthority: true } as any, store.deps as any),
    (error: any) => error?.code === 'HIPICO_AUTONOMOUS_FINANCIAL_AUTHORITY_FORBIDDEN'
  );
  assert.equal(tx.sends(), 0);
});

test('network/ACK ambiguity is held for reconciliation and never automatically resent', async () => {
  const store = memoryStore();
  const tx = transport(async () => { throw Object.assign(new Error('socket closed after write'), { code: 'ACK_LOST' }); });
  const first = await executeAutonomousLabReply(input(tx.adapter), store.deps as any);
  assert.equal(first.status, 'reconciliation_required');
  assert.equal(store.current().status, 'ambiguous');
  assert.equal(tx.sends(), 1);

  const replay = await executeAutonomousLabReply(input(tx.adapter), store.deps as any);
  assert.equal(replay.status, 'reconciliation_required');
  assert.equal(tx.sends(), 1);
});

test('deterministic provider rejection becomes visible dead-letter and does not block replay', async () => {
  const store = memoryStore();
  const tx = transport(async () => ({
    accepted: false,
    transport: 'lab-test',
    providerMessageId: null,
    reason: 'POISON_PAYLOAD'
  }));
  const first = await executeAutonomousLabReply(input(tx.adapter), store.deps as any);
  assert.equal(first.status, 'dead_letter');
  assert.equal(store.current().status, 'dead_letter');
  assert.equal(tx.sends(), 1);

  const replay = await executeAutonomousLabReply(input(tx.adapter), store.deps as any);
  assert.equal(replay.status, 'dead_letter');
  assert.equal(tx.sends(), 1);
});
