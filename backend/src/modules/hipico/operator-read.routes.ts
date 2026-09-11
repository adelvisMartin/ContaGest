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

function before(req: Request) {
  const raw = String(req.query.before || '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) throw Object.assign(new Error('HIPICO_BEFORE_INVALID'), { code: 'HIPICO_BEFORE_INVALID' });
  return date;
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
    const select = cursor
      ? prisma.$queryRaw<any[]>`
          SELECT id::text AS id, channel_key AS "groupKey", external_message_id AS "externalMessageId",
                 sender_id AS "senderId", sender_label AS "senderLabel", quoted_external_message_id AS "quotedExternalMessageId",
                 sent_at AS "sentAt", received_at AS "receivedAt", message_type AS "messageType", raw_text AS text,
                 classification, confidence, processing_status AS "processingStatus",
                 jsonb_build_object('channelRole',metadata->'channelRole','historySync',metadata->'historySync','mediaKind',metadata->'mediaKind','risk',metadata->'risk','reason',metadata->'reason') AS metadata
          FROM public.hipico_messages
          WHERE owner_id=${owner}::uuid AND channel_key=${group} AND received_at<${cursor}
          ORDER BY received_at DESC, id DESC LIMIT ${bounded}`
      : prisma.$queryRaw<any[]>`
          SELECT id::text AS id, channel_key AS "groupKey", external_message_id AS "externalMessageId",
                 sender_id AS "senderId", sender_label AS "senderLabel", quoted_external_message_id AS "quotedExternalMessageId",
                 sent_at AS "sentAt", received_at AS "receivedAt", message_type AS "messageType", raw_text AS text,
                 classification, confidence, processing_status AS "processingStatus",
                 jsonb_build_object('channelRole',metadata->'channelRole','historySync',metadata->'historySync','mediaKind',metadata->'mediaKind','risk',metadata->'risk','reason',metadata->'reason') AS metadata
          FROM public.hipico_messages
          WHERE owner_id=${owner}::uuid AND channel_key=${group}
          ORDER BY received_at DESC, id DESC LIMIT ${bounded}`;
    const rows = await select;
    return res.json({ ok: true, data: rows, nextBefore: rows.length === bounded ? rows.at(-1)?.receivedAt || null : null });
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.get('/events/stream', async (req, res) => {
  try {
    const owner = ownerId();
    const group = groupKey(req);
    const bounded = limit(req);
    const cursor = before(req);
    const rows = cursor
      ? await prisma.$queryRaw<any[]>`
          SELECT id::text AS id, source_message_id::text AS "sourceMessageId", event_key AS "eventKey",
                 event_type AS "eventType", event_state AS "eventState", race_key AS "raceKey",
                 participant_code AS "participantCode", product_type AS "productType", amount, currency,
                 confidence, payload, created_at AS "createdAt"
          FROM public.hipico_operation_events
          WHERE owner_id=${owner}::uuid AND group_key=${group} AND created_at<${cursor}
          ORDER BY created_at DESC, id DESC LIMIT ${bounded}`
      : await prisma.$queryRaw<any[]>`
          SELECT id::text AS id, source_message_id::text AS "sourceMessageId", event_key AS "eventKey",
                 event_type AS "eventType", event_state AS "eventState", race_key AS "raceKey",
                 participant_code AS "participantCode", product_type AS "productType", amount, currency,
                 confidence, payload, created_at AS "createdAt"
          FROM public.hipico_operation_events
          WHERE owner_id=${owner}::uuid AND group_key=${group}
          ORDER BY created_at DESC, id DESC LIMIT ${bounded}`;
    return res.json({ ok: true, data: rows, nextBefore: rows.length === bounded ? rows.at(-1)?.createdAt || null : null });
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.get('/trace/:correlationId', async (req, res) => {
  try {
    const owner = ownerId();
    const group = groupKey(req);
    const correlationId = traceSchema.parse(req.params.correlationId);
    const [raceEvents, messages] = await Promise.all([
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
        ORDER BY received_at ASC, id ASC`
    ]);
    const messageIds = messages.map((row) => String(row.id));
    const operationEvents = messageIds.length
      ? await prisma.$queryRaw<any[]>`
          SELECT id::text AS id, source_message_id::text AS "sourceMessageId", event_key AS "eventKey",
                 event_type AS "eventType", event_state AS "eventState", race_key AS "raceKey", payload,
                 created_at AS "createdAt"
          FROM public.hipico_operation_events
          WHERE owner_id=${owner}::uuid AND group_key=${group} AND source_message_id::text=ANY(${messageIds}::text[])
          ORDER BY created_at ASC, id ASC`
      : [];
    return res.json({ ok: true, data: { correlationId, groupKey: group, raceEvents, messages, operationEvents } });
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.use((error: any, req: Request, res: Response, _next: any) => sendError(req, res, error));

export default router;
