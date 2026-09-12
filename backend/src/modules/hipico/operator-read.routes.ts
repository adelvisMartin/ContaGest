import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { operatorTokenValid } from '../hipico-bot/hipico-operator-security.js';
import { hipicoError } from './hipico-domain.js';

const router = Router();
const uuid = z.string().uuid();
const groupSchema = z.string().trim().min(3).max(120).regex(/^[A-Za-z0-9._:-]+$/);
const traceSchema = z.string().trim().min(3).max(120).regex(/^[A-Za-z0-9._:-]+$/);
const limitSchema = z.coerce.number().int().min(1).max(200).default(50);
const SSE_POLL_MS = 2_000;
const SSE_MAX_MS = 55_000;

type OperationEventRow = {
  id: string;
  sourceMessageId: string | null;
  eventKey: string;
  eventType: string;
  eventState: string;
  raceKey: string | null;
  participantCode: string | null;
  productType: string | null;
  amount: unknown;
  currency: string | null;
  confidence: unknown;
  payload: unknown;
  createdAt: Date | string;
};

function requestId(req: Request) {
  return String((req as any).requestId || '').trim() || null;
}

function ownerId() {
  const value = String(process.env.HIPICO_OWNER_ID || '').trim();
  if (!uuid.safeParse(value).success) throw Object.assign(new Error('HIPICO_OWNER_NOT_CONFIGURED'), { code: 'HIPICO_OWNER_NOT_CONFIGURED' });
  return value;
}

function groupKey(req: Request) {
  const parsed = groupSchema.safeParse(req.header('x-hipico-group-key') || req.query.groupKey);
  if (!parsed.success) throw Object.assign(new Error('HIPICO_GROUP_INVALID'), { code: 'HIPICO_GROUP_INVALID' });
  return parsed.data;
}

function limit(req: Request) {
  return limitSchema.parse(req.query.limit ?? 50);
}

function dateCursor(raw: unknown, code: string) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) throw Object.assign(new Error(code), { code });
  return date;
}

function before(req: Request) {
  return dateCursor(req.query.before, 'HIPICO_BEFORE_INVALID');
}

function since(req: Request) {
  return dateCursor(req.query.since, 'HIPICO_SINCE_INVALID');
}

function statusFor(code: string) {
  if (code === 'HIPICO_OWNER_NOT_CONFIGURED') return 503;
  if (code.includes('NOT_FOUND')) return 404;
  return 400;
}

function sendError(req: Request, res: Response, error: any) {
  const code = String(error?.code || error?.message || 'HIPICO_OPERATOR_READ_ERROR').slice(0, 120);
  return res.status(statusFor(code)).json(hipicoError({
    code,
    message: 'No se pudo consultar la evidencia operativa de Control Hípico.',
    requestId: requestId(req),
    retryable: code === 'HIPICO_OWNER_NOT_CONFIGURED'
  }));
}

function serializeSse(res: Response, event: string, id: string | null, payload: unknown) {
  if (id) res.write(`id: ${id}\n`);
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function recentEvents(owner: string, group: string, bounded: number, cursor: Date | null) {
  return cursor
    ? prisma.$queryRaw<OperationEventRow[]>`
        SELECT id::text AS id, source_message_id::text AS "sourceMessageId", event_key AS "eventKey",
               event_type AS "eventType", event_state AS "eventState", race_key AS "raceKey",
               participant_code AS "participantCode", product_type AS "productType", amount, currency,
               confidence, payload, created_at AS "createdAt"
        FROM public.hipico_operation_events
        WHERE owner_id=${owner}::uuid AND group_key=${group} AND created_at<${cursor}
        ORDER BY created_at DESC, id DESC LIMIT ${bounded}`
    : prisma.$queryRaw<OperationEventRow[]>`
        SELECT id::text AS id, source_message_id::text AS "sourceMessageId", event_key AS "eventKey",
               event_type AS "eventType", event_state AS "eventState", race_key AS "raceKey",
               participant_code AS "participantCode", product_type AS "productType", amount, currency,
               confidence, payload, created_at AS "createdAt"
        FROM public.hipico_operation_events
        WHERE owner_id=${owner}::uuid AND group_key=${group}
        ORDER BY created_at DESC, id DESC LIMIT ${bounded}`;
}

async function eventsSince(owner: string, group: string, cursor: Date) {
  return prisma.$queryRaw<OperationEventRow[]>`
    SELECT id::text AS id, source_message_id::text AS "sourceMessageId", event_key AS "eventKey",
           event_type AS "eventType", event_state AS "eventState", race_key AS "raceKey",
           participant_code AS "participantCode", product_type AS "productType", amount, currency,
           confidence, payload, created_at AS "createdAt"
    FROM public.hipico_operation_events
    WHERE owner_id=${owner}::uuid AND group_key=${group} AND created_at>=${cursor}
    ORDER BY created_at ASC, id ASC LIMIT 200`;
}

router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (!operatorTokenValid(req.header('x-hipico-operator-token') || undefined)) {
    return res.status(401).json(hipicoError({ code: 'HIPICO_OPERATOR_UNAUTHORIZED', message: 'Operador no autenticado.', requestId: requestId(req) }));
  }
  next();
});

router.get('/groups', async (req, res) => {
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT group_key AS "groupKey", label, channel_type AS "channelType", status,
             config->>'mode' AS mode, config->>'purpose' AS purpose,
             created_at AS "createdAt", updated_at AS "updatedAt"
      FROM public.hipico_bot_channels
      WHERE owner_id=${ownerId()}::uuid
      ORDER BY updated_at DESC, group_key ASC
      LIMIT 200`;
    return res.json({ ok: true, data: rows });
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.get('/messages', async (req, res) => {
  try {
    const owner = ownerId();
    const group = groupKey(req);
    const bounded = limit(req);
    const cursor = before(req);
    const rows = cursor
      ? await prisma.$queryRaw<any[]>`
          SELECT id::text AS id, channel_key AS "groupKey", external_message_id AS "externalMessageId",
                 sender_id AS "senderId", sender_label AS "senderLabel", quoted_external_message_id AS "quotedExternalMessageId",
                 sent_at AS "sentAt", received_at AS "receivedAt", message_type AS "messageType", raw_text AS text,
                 classification, confidence, processing_status AS "processingStatus",
                 jsonb_build_object('channelRole',metadata->'channelRole','historySync',metadata->'historySync','mediaKind',metadata->'mediaKind','risk',metadata->'risk','reason',metadata->'reason') AS metadata
          FROM public.hipico_messages
          WHERE owner_id=${owner}::uuid AND channel_key=${group} AND received_at<${cursor}
          ORDER BY received_at DESC, id DESC LIMIT ${bounded}`
      : await prisma.$queryRaw<any[]>`
          SELECT id::text AS id, channel_key AS "groupKey", external_message_id AS "externalMessageId",
                 sender_id AS "senderId", sender_label AS "senderLabel", quoted_external_message_id AS "quotedExternalMessageId",
                 sent_at AS "sentAt", received_at AS "receivedAt", message_type AS "messageType", raw_text AS text,
                 classification, confidence, processing_status AS "processingStatus",
                 jsonb_build_object('channelRole',metadata->'channelRole','historySync',metadata->'historySync','mediaKind',metadata->'mediaKind','risk',metadata->'risk','reason',metadata->'reason') AS metadata
          FROM public.hipico_messages
          WHERE owner_id=${owner}::uuid AND channel_key=${group}
          ORDER BY received_at DESC, id DESC LIMIT ${bounded}`;
    return res.json({ ok: true, data: rows, nextBefore: rows.length === bounded ? rows.at(-1)?.receivedAt || null : null });
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.get('/events', async (req, res) => {
  try {
    const bounded = limit(req);
    const rows = await recentEvents(ownerId(), groupKey(req), bounded, before(req));
    return res.json({ ok: true, data: rows, nextBefore: rows.length === bounded ? rows.at(-1)?.createdAt || null : null });
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.get('/events/stream', async (req, res) => {
  let timer: NodeJS.Timeout | null = null;
  let endTimer: NodeJS.Timeout | null = null;
  let closed = false;
  try {
    const owner = ownerId();
    const group = groupKey(req);
    let cursor = since(req) || new Date();
    const seen = new Set<string>();

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write(`retry: ${SSE_POLL_MS}\n\n`);
    serializeSse(res, 'ready', null, { ok: true, groupKey: group, connectedAt: new Date().toISOString() });

    const poll = async () => {
      if (closed) return;
      try {
        const rows = await eventsSince(owner, group, cursor);
        for (const row of rows) {
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          if (seen.size > 500) seen.delete(seen.values().next().value as string);
          const createdAt = new Date(row.createdAt);
          if (createdAt.getTime() > cursor.getTime()) cursor = createdAt;
          serializeSse(res, 'operation', row.id, row);
        }
        res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch (error: any) {
        serializeSse(res, 'error', null, {
          ok: false,
          code: String(error?.code || 'HIPICO_EVENT_STREAM_POLL_FAILED').slice(0, 120),
          retryable: true,
          requestId: requestId(req)
        });
      }
    };

    await poll();
    timer = setInterval(() => { void poll(); }, SSE_POLL_MS);
    endTimer = setTimeout(() => {
      if (!closed) {
        serializeSse(res, 'end', null, { reason: 'STREAM_WINDOW_COMPLETE', reconnect: true });
        res.end();
      }
    }, SSE_MAX_MS);

    req.on('close', () => {
      closed = true;
      if (timer) clearInterval(timer);
      if (endTimer) clearTimeout(endTimer);
    });
  } catch (error) {
    if (!res.headersSent) return sendError(req, res, error);
    serializeSse(res, 'error', null, { ok: false, code: 'HIPICO_EVENT_STREAM_FAILED', retryable: true, requestId: requestId(req) });
    res.end();
  }
});

router.get('/trace/:correlationId', async (req, res) => {
  try {
    const owner = ownerId();
    const group = groupKey(req);
    const correlationId = traceSchema.parse(req.params.correlationId);
    const [raceEvents, messages, operationEvents] = await Promise.all([
      prisma.$queryRaw<any[]>`
        SELECT id::text AS id, race_id::text AS "raceId", request_id AS "requestId", command,
               actor_id AS "actorId", actor_type AS "actorType", correlation_id AS "correlationId",
               from_state AS "fromState", to_state AS "toState", disposition, reason, evidence, payload,
               created_at AS "createdAt"
        FROM public.hipico_race_events
        WHERE owner_id=${owner}::uuid AND group_key=${group} AND correlation_id=${correlationId}
        ORDER BY created_at ASC, id ASC`,
      prisma.$queryRaw<any[]>`
        SELECT id::text AS id, external_message_id AS "externalMessageId", sender_id AS "senderId",
               sent_at AS "sentAt", received_at AS "receivedAt", message_type AS "messageType", raw_text AS text,
               classification, confidence, processing_status AS "processingStatus"
        FROM public.hipico_messages
        WHERE owner_id=${owner}::uuid AND channel_key=${group}
          AND (external_message_id=${correlationId} OR metadata->>'transportEventId'=${correlationId} OR metadata->>'correlationId'=${correlationId})
        ORDER BY received_at ASC, id ASC`,
      prisma.$queryRaw<any[]>`
        SELECT event.id::text AS id, event.source_message_id::text AS "sourceMessageId", event.event_key AS "eventKey",
               event.event_type AS "eventType", event.event_state AS "eventState", event.race_key AS "raceKey", event.payload,
               event.created_at AS "createdAt"
        FROM public.hipico_operation_events event
        JOIN public.hipico_messages message ON message.id=event.source_message_id
        WHERE event.owner_id=${owner}::uuid AND event.group_key=${group}
          AND message.owner_id=${owner}::uuid AND message.channel_key=${group}
          AND (message.external_message_id=${correlationId} OR message.metadata->>'transportEventId'=${correlationId} OR message.metadata->>'correlationId'=${correlationId})
        ORDER BY event.created_at ASC, event.id ASC`
    ]);
    return res.json({ ok: true, data: { correlationId, groupKey: group, raceEvents, messages, operationEvents } });
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.use((error: any, req: Request, res: Response, _next: any) => sendError(req, res, error));

export default router;
