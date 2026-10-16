import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requireTenant, requirePermission } from '../../shared/middleware/context.js';
import { NotificationTemplateError, renderNotificationTemplate, evaluateNotificationQuietHours, listNotificationTemplateDescriptors } from './notification-template-catalog.js';
import { projectNotificationDeliveryEvidence } from './notification-delivery-evidence.js';
import { classifyWhatsAppProviderAck } from './notification-provider-ack.mjs';

const router = Router();
router.use(requireTenant);

const messageSchema = z.object({
  to: z.string().min(7),
  message: z.string().min(1).max(4000),
  order: z.record(z.string(), z.unknown()).optional()
});

async function sendWhatsAppCloud(to: string, message: string) {
  const token = process.env.WHATSAPP_CLOUD_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const version = process.env.WHATSAPP_GRAPH_VERSION || 'v23.0';
  if (!token || !phoneNumberId) {
    return { ok: false, provider: 'whatsapp-cloud', skipped: true, reason: 'WHATSAPP_CLOUD_TOKEN o WHATSAPP_PHONE_NUMBER_ID no configurado' };
  }
  const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to.replace(/[^\d]/g, ''),
      type: 'text',
      text: { preview_url: false, body: message }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(response.status, 'WhatsApp Cloud API rechazó la solicitud.');
  const acknowledgement=classifyWhatsAppProviderAck(response.ok,data);
  return { ok:acknowledgement.providerAccepted, provider:'whatsapp-cloud', status:acknowledgement.status, delivered:false };
}

router.post('/whatsapp/order', requirePermission('sales.manage'), asyncHandler(async (req, res) => {
  const ctx = (req as any).context;
  const body = z.object({ order: z.record(z.string(), z.unknown()), message: z.string().min(1) }).parse(req.body || {});
  const order: any = body.order || {};
  const result = await sendWhatsAppCloud(String(order.phone || ''), body.message);
  await prisma.moduleRecord.create({
    data: {
      tenantId: ctx.tenantId,
      moduleSlug: 'notification-log',
      title: 'Notificación WhatsApp',
      // A provider HTTP acknowledgement does not prove delivery to the recipient.
      status: result.ok ? 'provider_accepted' : result.status==='provider_unverified' ? 'provider_unverified' : 'skipped',
      // Never store phone, arbitrary order fields, message body or raw provider JSON.
      payload: { channel: 'whatsapp', provider: 'whatsapp-cloud', providerAccepted: result.ok, deliveryConfirmed: false }
    }
  });
  ok(res, result.ok ? { ok: true, provider: 'whatsapp-cloud', status: 'provider_accepted', delivered: false } : result);
}));

// Tenant-scoped, permission-guarded PREVIEW ONLY; never delivers or persists data.
const previewSchema = z.object({
  key: z.enum(['operational.notice', 'sales.order-status']),
  locale: z.string().max(35).optional(),
  values: z.record(z.string(), z.string()).optional(),
  quietHours: z.object({
    timeZone: z.string().min(1).max(120),
    start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    at: z.string().datetime({ offset: true })
  }).strict().optional()
}).strict();

// Tenant + permission gate applies also to catalog metadata. No public or PII data.
router.get('/templates', requirePermission('sales.manage'), asyncHandler(async (_req, res) => {
  ok(res, { templates: listNotificationTemplateDescriptors(), queueReady: false });
}));

router.post('/templates/preview', requirePermission('sales.manage'), asyncHandler(async (req, res) => {
  const payload = previewSchema.parse(req.body || {});
  try {
    const preview = renderNotificationTemplate(payload.key, payload.locale, payload.values);
    const quietHours = payload.quietHours ? evaluateNotificationQuietHours({
      timeZone: payload.quietHours.timeZone,
      start: payload.quietHours.start,
      end: payload.quietHours.end,
      instant: new Date(payload.quietHours.at)
    }) : null;
    ok(res, { preview, quietHours, queued: false, delivered: false });
  } catch (error) {
    if (error instanceof NotificationTemplateError) throw new HttpError(422, error.message);
    throw error;
  }
}));

router.post('/send', requirePermission('sales.manage'), asyncHandler(async (req, res) => {
  messageSchema.parse(req.body || {});
  // No #853 transactional outbox/worker exists behind this endpoint yet.
  // Never report queued=true or echo a private message when nothing was persisted.
  throw new HttpError(503, 'La cola de notificaciones no está disponible; no se programó ningún envío.');
}));


const deliveryWindow = z.object({
  take: z.coerce.number().int().min(1).max(100).default(50),
  skip: z.coerce.number().int().min(0).max(100000).default(0),
}).strict();
// This is NOT a receipt log or provider timeline; it is a safe projection
// of existing internal NotificationLog rows only.
router.get('/delivery-evidence', requirePermission('sales.manage'), asyncHandler(async (req, res) => {
  const { take, skip } = deliveryWindow.parse(req.query);
  const tenantId = (req as any).context.tenantId as string;
  const rows = await prisma.notificationLog.findMany({
    where: { tenantId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, tenantId: true, channel: true, status: true, createdAt: true },
    take: take + 1, skip,
  });
  const hasMore = rows.length > take;
  const evidence = projectNotificationDeliveryEvidence(tenantId, rows.slice(0, take));
  res.setHeader('Cache-Control', 'private, no-store');
  ok(res, { ...evidence, pagination: { take, skip, hasMore } });
}));

export default router;
