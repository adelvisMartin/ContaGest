import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { operatorTokenValid } from '../hipico-bot/hipico-operator-security.js';
import { hipicoError } from './hipico-domain.js';

const router = Router();
const uuid = z.string().uuid();
const groupKeySchema = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._:-]+$/);
const correlationSchema = z.string().trim().min(1).max(320).regex(/^[A-Za-z0-9._:@-]+$/);

function requestId(req: Request) { return String((req as any).requestId || '').trim() || null; }
function configuredOwnerId() {
  const value = String(process.env.HIPICO_OWNER_ID || '').trim();
  if (!uuid.safeParse(value).success) throw Object.assign(new Error('HIPICO_OWNER_NOT_CONFIGURED'), { code: 'HIPICO_OWNER_NOT_CONFIGURED' });
  return value;
}
function requestedGroupKey(req: Request) {
  const parsed = groupKeySchema.safeParse(req.header('x-hipico-group-key') || req.query.groupKey);
  if (!parsed.success) throw Object.assign(new Error('HIPICO_GROUP_INVALID'), { code: 'HIPICO_GROUP_INVALID' });
  return parsed.data;
}
function boundedLimit(value: unknown, fallback = 50) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, Math.trunc(parsed))) : fallback;
}
function errorResponse(req: Request, res: Response, error: any) {
  const code = String(error?.code || error?.message || 'HIPICO_OPERATOR_READ_ERROR').slice(0, 120);
  const status = code === 'HIPICO_OWNER_NOT_CONFIGURED' ? 503 : 400;
  return res.status(status).json(hipicoError({
    code,
    message: 'No se pudo leer el estado operativo solicitado.',
    requestId: requestId(req),
    retryable: status === 503
  }));
}

router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (!operatorTokenValid(req.header('x-hipico-operator-token') || undefined)) {
    return res.status(401).json(hipicoError({
      code: 'HIPICO_OPERATOR_UNAUTHORIZED',
      message: 'Operador no autenticado.',
      requestId: requestId(req)
    }));
  }
  next();
});

router.get('/groups', async (req, res) => {
  try {
    const ownerId = configuredOwnerId();
    const rows = await prisma.$queryRaw<Array<{ id: string; groupKey: string; label: string; channelType: string; status: string; updatedAt: Date | string }>>`
      SELECT id::text,group_key AS "groupKey",label,channel_type AS "channelType",status,updated_at AS "updatedAt"
      FROM public.hipico_bot_channels
      WHERE owner_id=${ownerId}::uuid
      ORDER BY updated_at DESC
      LIMIT 100`;
    return res.status(200).json({ ok: true, data: rows });
  } catch (error) { return errorResponse(req, res, error); }
});

router.get('/messages', async (req, res) => {
  try {
    const ownerId = configuredOwnerId();
    const groupKey = requestedGroupKey(req);
    const limit = boundedLimit(req.query.limit);
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT id::text,external_message_id AS "externalMessageId",sender_label AS "senderLabel",sender_role AS "senderRole",
             sent_at AS "sentAt",received_at AS "receivedAt",message_type AS "messageType",classification,confidence,
             processing_status AS "processingStatus"
      FROM public.hipico_messages
      WHERE owner_id=${ownerId}::uuid AND channel_key=${groupKey}
      ORDER BY received_at DESC,id DESC
      LIMIT ${limit}`;
    return res.status(200).json({ ok: true, data: rows });
  } catch (error) { return errorResponse(req, res, error); }
});

async function eventRows(ownerId: string, groupKey: string, limit = 50) {
  return prisma.$queryRaw<Array<Record<string, any>>>`
    SELECT id,event_type AS "eventType",disposition,aggregate_kind AS "aggregateKind",aggregate_key AS "aggregateKey",
           previous_state AS "previousState",next_state AS "nextState",reason,source_message_id AS "sourceMessageId",
           event_timestamp AS "eventTimestamp",created_at AS "createdAt"
    FROM public.hipico_domain_events
    WHERE owner_id=${ownerId}::uuid AND group_key=${groupKey}
    ORDER BY event_timestamp DESC,id DESC
    LIMIT ${limit}`;
}

router.get('/events', async (req, res) => {
  try {
    const data = await eventRows(configuredOwnerId(), requestedGroupKey(req), boundedLimit(req.query.limit));
    return res.status(200).json({ ok: true, data });
  } catch (error) { return errorResponse(req, res, error); }
});

router.get('/trace/:correlationId', async (req, res) => {
  try {
    const correlation = correlationSchema.safeParse(req.params.correlationId);
    if (!correlation.success) throw Object.assign(new Error('HIPICO_CORRELATION_ID_INVALID'), { code: 'HIPICO_CORRELATION_ID_INVALID' });
    const ownerId = configuredOwnerId();
    const groupKey = requestedGroupKey(req);
    const key = correlation.data;
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT id,event_type AS "eventType",disposition,aggregate_kind AS "aggregateKind",aggregate_key AS "aggregateKey",
             previous_state AS "previousState",next_state AS "nextState",reason,source_message_id AS "sourceMessageId",
             source_message_key AS "sourceMessageKey",event_timestamp AS "eventTimestamp",created_at AS "createdAt"
      FROM public.hipico_domain_events
      WHERE owner_id=${ownerId}::uuid AND group_key=${groupKey}
        AND (id=${key} OR source_message_id=${key} OR source_message_key=${key})
      ORDER BY event_timestamp ASC,id ASC
      LIMIT 100`;
    return res.status(200).json({ ok: true, data: rows });
  } catch (error) { return errorResponse(req, res, error); }
});

router.get('/events/stream', async (req, res) => {
  let ownerId: string;
  let groupKey: string;
  try {
    ownerId = configuredOwnerId();
    groupKey = requestedGroupKey(req);
  } catch (error) { return errorResponse(req, res, error); }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const seen = new Set<string>();
  let stopped = false;
  let busy = false;
  const send = (event: string, data: unknown) => {
    if (stopped || res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const poll = async () => {
    if (stopped || busy) return;
    busy = true;
    try {
      const rows = (await eventRows(ownerId, groupKey, 50)).reverse();
      for (const row of rows) {
        const id = String(row.id || '');
        if (!id || seen.has(id)) continue;
        seen.add(id);
        send('hipico-event', row);
      }
      while (seen.size > 500) {
        const oldest = seen.values().next().value;
        if (!oldest) break;
        seen.delete(oldest);
      }
    } catch {
      send('hipico-status', { state: 'degraded', code: 'EVENT_STREAM_DB_UNAVAILABLE' });
    } finally { busy = false; }
  };

  const pollTimer = setInterval(() => void poll(), 5000);
  const heartbeatTimer = setInterval(() => send('heartbeat', { at: new Date().toISOString() }), 15000);
  const maxLifetimeTimer = setTimeout(() => { send('close', { reason: 'STREAM_LIFETIME_COMPLETE' }); res.end(); }, 10 * 60 * 1000);
  pollTimer.unref?.(); heartbeatTimer.unref?.(); maxLifetimeTimer.unref?.();

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(pollTimer);
    clearInterval(heartbeatTimer);
    clearTimeout(maxLifetimeTimer);
  };
  req.on('close', cleanup);
  res.on('close', cleanup);
  await poll();
});

export default router;
