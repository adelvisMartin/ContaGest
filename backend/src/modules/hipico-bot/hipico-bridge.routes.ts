import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { classify, HipicoBotStore } from './hipico-bot.service.js';

const router = Router();

const bridgeEventSchema = z.object({
  providerMessageId: z.string().min(1).max(320),
  groupId: z.string().min(3).max(220),
  groupName: z.string().trim().min(1).max(220).optional(),
  sender: z.string().min(1).max(220),
  body: z.string().max(4000).default(''),
  messageType: z.string().min(1).max(80).default('chat'),
  sentAt: z.string().datetime({ offset: true }).optional()
});

function bridgeTokenValid(value: string | undefined) {
  const expected = String(process.env.HIPICO_BRIDGE_TOKEN || '');
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
 * This route is deliberately separate from Meta Cloud API. The local Bridge
 * links a dedicated WhatsApp/WhatsApp Business app account through WhatsApp
 * Web, filters one configured group, then forwards normalized events here.
 * The server classifies and deduplicates them but never sends a group reply or
 * applies a monetary/race mutation from this endpoint.
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
  const providerMessageId = `waweb:${input.providerMessageId}`;
  const result = classify(input.body);
  const sender = input.sender.replace(/@.*$/, '').slice(0, 220);

  const event = await HipicoBotStore.saveEvent({
    providerMessageId,
    phoneNumberId: `group:${input.groupId}`,
    sender,
    messageType: input.messageType,
    body: input.body,
    ...result,
    status: 'classified',
    payload: {
      source: 'whatsapp-web-bridge',
      groupId: input.groupId,
      groupName: input.groupName || null,
      senderRaw: input.sender,
      sentAt: input.sentAt || null
    }
  });

  if (event.inserted === false) {
    return res.status(200).json({ ok: true, duplicate: true, mode: 'shadow' });
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
