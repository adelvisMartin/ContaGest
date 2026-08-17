import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { classify } from './hipico-operational-classifier.js';
import { persistCanonicalShadow } from './hipico-canonical-shadow.store.js';
import { ensureGroupShadowOutbox, persistBridgeTransportEvent } from './hipico-bridge-transport.store.js';

const router = Router();

const bridgeEventSchema = z.object({
  bridgeVersion: z.string().min(1).max(80),
  externalMessageId: z.string().min(1).max(320),
  groupId: z.string().min(3).max(220),
  groupName: z.string().trim().min(1).max(220),
  channelKey: z.string().trim().min(3).max(120).optional(),
  labChannelKey: z.string().trim().min(3).max(120).optional(),
  channelRole: z.enum(['source', 'lab']),
  shadowMode: z.boolean(),
  senderId: z.string().min(1).max(220),
  senderLabel: z.string().max(220).default(''),
  fromMe: z.boolean().default(false),
  timestamp: z.string().datetime({ offset: true }),
  type: z.string().min(1).max(80).default('chat'),
  mediaKind: z.enum(['none', 'image', 'video', 'audio', 'document', 'unknown']).default('none'),
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

function shadowTag(value: string) {
  return `[SHADOW:${crypto.createHash('sha256').update(value).digest('hex').slice(0, 10)}]`;
}

function buildLabSimulation(input: z.infer<typeof bridgeEventSchema>, result: ReturnType<typeof classify>, canonical: any) {
  if (input.channelRole !== 'source') return null;
  const mirrorTag = shadowTag(input.externalMessageId);
  const entities = result.entities || {};
  const details: string[] = [];
  if (entities.role) details.push(`Rol: ${entities.role === 'player' ? 'JUEGA' : 'CONSIGUE'}`);
  if (entities.play) details.push(`Jugada: ${entities.play}`);
  if (entities.horse) details.push(`Caballo: ${entities.horse}`);
  if (Number.isFinite(Number(entities.amount))) details.push(`Monto: ${Number(entities.amount)}`);
  if (Number.isFinite(Number(entities.raceNumber))) details.push(`Carrera: ${Number(entities.raceNumber)}`);
  if (Array.isArray(entities.board) && entities.board.length) details.push(`Pizarra: ${entities.board.join('-')}`);
  if (Array.isArray(entities.balances) && entities.balances.length) details.push(`Disponibles: ${entities.balances.length} fila(s)`);
  if (Array.isArray(entities.settlementRows) && entities.settlementRows.length) details.push(`Liquidación: ${entities.settlementRows.length} fila(s)`);

  const visibleMessage = input.text.trim() || `[${input.mediaKind || 'media'} sin texto extraíble]`;
  const lines = [
    mirrorTag,
    '🧪 CONTROL HÍPICO · SIMULACIÓN SHADOW',
    `Fuente: ${input.groupName}`,
    `Remitente: ${input.senderLabel || 'participante'}`,
    `Mensaje: ${visibleMessage.slice(0, 1200)}`,
    `Lectura: ${result.intent} · riesgo ${result.risk} · confianza ${(Number(result.confidence || 0) * 100).toFixed(1)}%`,
    ...details,
    `Propuesta del bot: ${result.suggestion}`,
    '⚠️ SOLO LABORATORIO: no registró jugada, cierre, resultado, saldo ni liquidación real.'
  ];

  return {
    mirrorTag,
    sourceExternalMessageId: input.externalMessageId,
    sourceGroupKey: canonical?.groupKey || input.channelKey || null,
    labGroupKey: input.labChannelKey || null,
    text: lines.join('\n').slice(0, 3900)
  };
}

router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  next();
});

/**
 * Shadow-only ingestion endpoint for WhatsApp Web observation.
 *
 * channelRole=source is the official operations group and is observation-only.
 * The response may contain a labSimulation payload for the desktop Bridge to
 * mirror into a separate QA group. actions is always empty; this endpoint never
 * sends to WhatsApp and never mutates live race state, balances, bets, results,
 * ledger entries or settlements.
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
    channelKey: input.channelKey || null,
    labChannelKey: input.labChannelKey || null,
    channelRole: input.channelRole,
    bridgeShadowMode: input.shadowMode,
    senderRaw: input.senderId,
    senderLabel: input.senderLabel,
    fromMe: input.fromMe,
    sentAt: input.timestamp,
    rawMeta: input.rawMeta,
    hasMedia: input.hasMedia,
    mediaKind: input.mediaKind,
    quotedExternalMessageId: input.quotedExternalMessageId,
    operational: result.entities || null
  };

  try {
    const event = await persistBridgeTransportEvent({
      providerMessageId,
      phoneNumberId: `group:${input.groupId}`,
      sender,
      messageType: input.type,
      body: input.text,
      result,
      payload: transportPayload
    });

    const canonical = await persistCanonicalShadow({
      groupName: input.groupName,
      channelKey: input.channelKey,
      labChannelKey: input.labChannelKey,
      channelRole: input.channelRole,
      providerMessageId,
      sender,
      senderLabel: input.senderLabel,
      fromMe: input.fromMe,
      sentAt: input.timestamp,
      messageType: input.type,
      mediaKind: input.mediaKind,
      body: input.text,
      quotedExternalMessageId: input.quotedExternalMessageId,
      bridgeVersion: input.bridgeVersion,
      rawMeta: input.rawMeta,
      transportEventId: event.id,
      result
    });

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
      labSimulation: buildLabSimulation(input, result, canonical),
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
      channelKey: input.channelKey || null,
      channelRole: input.channelRole,
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
