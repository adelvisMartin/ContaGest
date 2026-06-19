import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import bwipjs from 'bwip-js';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, ok } from '../../shared/http.js';
import { requireTenant, requirePermission } from '../../shared/middleware/context.js';

const router = Router();
router.use(requireTenant);

const qrSchema = z.object({ payload: z.string().min(1).max(3000), format: z.enum(['png','svg','dataurl']).optional(), errorCorrectionLevel: z.enum(['L','M','Q','H']).optional() });
const barcodeSchema = z.object({ text: z.string().min(1).max(120), format: z.string().default('code128'), scale: z.coerce.number().min(1).max(5).optional() });

router.post('/generate', asyncHandler(async (req, res) => {
  const body = qrSchema.parse(req.body || {});
  if (body.format === 'svg') {
    const svg = await QRCode.toString(body.payload, { type: 'svg', errorCorrectionLevel: body.errorCorrectionLevel || 'M', margin: 2 });
    res.setHeader('content-type', 'image/svg+xml');
    return res.send(svg);
  }
  const buffer = await QRCode.toBuffer(body.payload, { type: 'png', errorCorrectionLevel: body.errorCorrectionLevel || 'M', margin: 2, width: 512 });
  res.setHeader('content-type', 'image/png');
  res.setHeader('cache-control', 'no-store');
  return res.send(buffer);
}));

router.post('/barcode', asyncHandler(async (req, res) => {
  const body = barcodeSchema.parse(req.body || {});
  const svg = await bwipjs.toSVG({ bcid: body.format, text: body.text, scale: body.scale || 3, height: 12, includetext: true, textxalign: 'center' });
  res.setHeader('content-type', 'image/svg+xml');
  res.setHeader('cache-control', 'no-store');
  return res.send(svg);
}));

router.get('/product/:code', requirePermission('inventory.view'), asyncHandler(async (req, res) => {
  const ctx = (req as any).context;
  const code = String(req.params.code || '');
  const product = await prisma.product.findFirst({
    where: { tenantId: ctx.tenantId, OR: [{ sku: code }, { barcode: code }, { qrCode: code }, { productCodes: { some: { value: code, active: true } } }] },
    include: { productCodes: true }
  });
  ok(res, product);
}));

export default router;
