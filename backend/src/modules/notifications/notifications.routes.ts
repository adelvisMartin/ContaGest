import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requireTenant, requirePermission } from '../../shared/middleware/context.js';

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
  return { ok: true, provider: 'whatsapp-cloud', data };
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
      status: result.ok ? 'provider_accepted' : 'skipped',
      // Never store phone, arbitrary order fields, message body or raw provider JSON.
      payload: { channel: 'whatsapp', provider: 'whatsapp-cloud', providerAccepted: result.ok, deliveryConfirmed: false }
    }
  });
  ok(res, result.ok ? { ok: true, provider: 'whatsapp-cloud', status: 'provider_accepted', delivered: false } : result);
}));

router.post('/send', requirePermission('sales.manage'), asyncHandler(async (req, res) => {
  messageSchema.parse(req.body || {});
  // No #853 transactional outbox/worker exists behind this endpoint yet.
  // Never report queued=true or echo a private message when nothing was persisted.
  throw new HttpError(503, 'La cola de notificaciones no está disponible; no se programó ningún envío.');
}));

export default router;
