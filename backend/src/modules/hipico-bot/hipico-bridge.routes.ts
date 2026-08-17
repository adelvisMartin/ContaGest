import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { classify } from './hipico-operational-classifier.js';
import { persistCanonicalShadow } from './hipico-canonical-shadow.store.js';
import { ensureGroupShadowOutbox, persistBridgeTransportEvent } from './hipico-bridge-transport.store.js';

const router = Router();

// Contract emitted by the Control Hipico desktop Bridge. Keep this endpoint
// isolated from the Meta Cloud API webhook: this is a normal WhatsApp Web
// group observation channel used for shadow QA.
const bridgeEventSchema = z.object({
  bridgeVersion: z.string().min(1).max(80),
  externalMessageId: z.string().min(1).max(320),
  groupId: z.string().min(3).max(220),
  groupName: z.string().trim().min(1).max(220),
  channelRole: z.enum(['source', 'lab']),
  shadowMode: z.boolean(),
  senderId: z.string().min(1).max(220),
  senderLabel: z.string().max(220).default(''),
  fromMe: z.boolean().default(false),
  timestamp: z.string().datetime({ offset: true }),
  type: z.string().min(1).max(80).default('chat'),
  text: z.string().max(4000).default(''),
  hasMedia: z.boolean().default(false),
  quotedExternalMessageId: z.string().max(320).nullable().default(null),
  rawMeta: z.string().max(500).default('')
});

function bridgeTokenValid(value: string | undefined) {
  const expected = String(process.env.HIPICO_GROUP_BRIDGE_TOKEN || process.env.HIPICO_BRIDGE_TOKEN || '');
  if (!expected || !value) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(value));
  } catch {
    return false;
  }
}

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  next();
});

/**
 * Shadow-only ingestion endpoint for the normal WhatsApp group Bridge.
 *
 * A successful response requires PostgreSQL persistence in both the transport
 * audit layer and the canonical Hípico shadow schema. Any partial failure is
 * returned as 503 so the desktop Bridge keeps the original event in its spool
 * and retries. All writes are idempotent by provider/external message ID.
 *
 * This route NEVER sends a group reply and NEVER mutates live race state,
 * balances, results, bets, ledger entries or settlements.
 */
router.post('/bridge/events', async (req, res) => {
  if (!bridgeTokenValid(req.header('x-hipico-bridge-token') || undefined)) {
    return res.status(401).json({ ok: false, error: 'Token del Bridge Hipico invalido.' });
  }

  const parsed = bridgeEventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Evento del Bridge invalido.' });
  }

  const input = parsed.data;
  const providerMessageId = `waweb:${input.externalMessageId}`;
  const result = classify(input.text);
  const sender = input.senderId.replace(/@.*$/, '').slice(0, 220);
  const transportPayload = {
    source: 'whatsapp-web-bridge',
    bridgeVersion: input.bridgeVersion,
    groupId: input.groupId,
    groupName: input.groupName,
    channelRole: input.channelRole,
    bridgeShadowMode: input.shadowMode,
    senderRaw: input.senderId,
    senderLabel: input.senderLabel,
    fromMe: input.fromMe,
    sentAt: input.timestamp,
    rawMeta: input.rawMeta,
    hasMedia: input.hasMedia,
    quotedExternalMessageId: input.quotedExternalMessageId,
    operational: result.entities || null
  };

  try {
    // No serverless-memory fallback is allowed for the real group gate.
    const event = await persistBridgeTransportEvent({
      providerMessageId,
      phoneNumberId: `group:${input.groupId}`,
      sender,
      messageType: input.type,
      body: input.text,
      result,
      payload: transportPayload
    });

    // Canonical shadow writes are idempotent, therefore a retry can repair a
    // previous partial failure even when the transport event already exists.
    const canonical = await persistCanonicalShadow({
      groupName: input.groupName,
      providerMessageId,
      sender,
      senderLabel: input.senderLabel,
      fromMe: input.fromMe,
      sentAt: input.timestamp,
      messageType: input.type,
      body: input.text,
      quotedExternalMessageId: input.quotedExternalMessageId,
      bridgeVersion: input.bridgeVersion,
      rawMeta: input.rawMeta,
      transportEventId: event.id,
      result
    });

    // Compatibility outbox is also an idempotent upsert. It remains shadow
    // evidence only and is not the operational sending outbox.
    const outbox = await ensureGroupShadowOutbox({
      eventId: event.id,
      recipient: input.groupId,
      result
    });

    const responseBody = {
      ok: true,
      duplicate: !event.inserted,
      mode: 'shadow',
      classification: result.intent,
      actions: [] as never[],
      data: {
        eventId: event.id,
        outboxId: outbox.id,
        canonical,
        intent: result.intent,
        risk: result.risk,
        entities: result.entities || null,
        autoEligible: false
      }
    };

    return res.status(event.inserted ? 202 : 200).json(responseBody);
  } catch (error: any) {
    console.error('[hipico-bridge] persistent shadow ingestion failed', {
      providerMessageId,
      groupName: input.groupName,
      error: error?.message || String(error)
    });
    return res.status(503).json({
      ok: false,
      retryable: true,
      error: 'Persistencia shadow de Control Hipico no disponible. El Bridge debe reintentar.'
    });
  }
});

export default router;
