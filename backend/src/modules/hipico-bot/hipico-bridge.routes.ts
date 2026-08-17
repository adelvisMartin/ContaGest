import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { classify, HipicoBotStore } from './hipico-bot.service.js';

const router = Router();

// Contract emitted by tools/hipico-whatsapp-bridge. Keep this endpoint isolated
// from the Meta Cloud API webhook: this is a normal WhatsApp Web group session.
const bridgeEventSchema = z.object({
  bridgeVersion: z.string().min(1).max(40),
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
  quotedExternalMessageId: z.string().max(320).nullable().default(null)
});

function bridgeTokenValid(value: string | undefined) {
  // HIPICO_GROUP_BRIDGE_TOKEN is the canonical name used by the desktop bridge.
  // HIPICO_BRIDGE_TOKEN is accepted as a short-lived compatibility alias.
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
 * The linked WhatsApp account filters a configured group and forwards only a
 * normalized event. This endpoint may classify/deduplicate/persist, but it
 * never sends a group reply and never mutates race state, balances, results or
 * settlements. Returning actions:[] also prevents the desktop Bridge from
 * publishing anything during this first laboratory gate.
 */
router.post('/bridge/events', async (req, res) => {
  if (!bridgeTokenValid(req.header('x-hipico-bridge-token') || undefined)) {
    return res.status(401).json({ ok: false, error: 'Token del Bridge Hípico inválido.' });
  }

  const parsed = bridgeEventSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: 'Evento del Bridge inválido.' });
  }

  const input = parsed.data;
  const providerMessageId = `waweb:${input.externalMessageId}`;
  const result = classify(input.text);
  const sender = input.senderId.replace(/@.*$/, '').slice(0, 220);

  const event = await HipicoBotStore.saveEvent({
    providerMessageId,
    phoneNumberId: `group:${input.groupId}`,
    sender,
    messageType: input.type,
    body: input.text,
    ...result,
    status: 'classified',
    payload: {
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
      hasMedia: input.hasMedia,
      quotedExternalMessageId: input.quotedExternalMessageId
    }
  });

  if (event.inserted === false) {
    return res.status(200).json({
      ok: true,
      duplicate: true,
      mode: 'shadow',
      classification: result.intent,
      actions: []
    });
  }

  const outbox = await HipicoBotStore.queue({
    eventId: event.id,
    recipient: input.groupId,
    targetType: 'group_bridge',
    message: result.suggestion,
    intent: result.intent,
    risk: result.risk,
    status: 'shadow'
  });

  return res.status(202).json({
    ok: true,
    duplicate: false,
    mode: 'shadow',
    classification: result.intent,
    actions: [],
    data: {
      eventId: event.id,
      outboxId: outbox.id,
      intent: result.intent,
      risk: result.risk,
      autoEligible: false
    }
  });
});

export default router;
