import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { buildHipicoCommandCenter } from './command-center.service.js';
import { hipicoError } from './hipico-domain.js';
import { operatorTokenValid } from '../hipico-bot/hipico-operator-security.js';

const router = Router();
const uuid = z.string().uuid();
const groupKeySchema = z.string().trim().min(3).max(120).regex(/^[A-Za-z0-9._:-]+$/);
const groupIdSchema = z.string().trim().min(3).max(220).regex(/^[A-Za-z0-9@._:-]+$/);

function requestId(req: Request) {
  return String((req as any).requestId || '').trim() || null;
}

function ownerId() {
  const value = String(process.env.HIPICO_OWNER_ID || '').trim();
  if (!uuid.safeParse(value).success) throw Object.assign(new Error('HIPICO_OWNER_NOT_CONFIGURED'), { code: 'HIPICO_OWNER_NOT_CONFIGURED' });
  return value;
}

function groupKey(req: Request) {
  const parsed = groupKeySchema.safeParse(req.header('x-hipico-group-key') || req.query.groupKey);
  if (!parsed.success) throw Object.assign(new Error('HIPICO_GROUP_INVALID'), { code: 'HIPICO_GROUP_INVALID' });
  return parsed.data;
}

function groupId(req: Request) {
  const raw = String(req.query.groupId || '').trim();
  if (!raw) return null;
  const parsed = groupIdSchema.safeParse(raw);
  if (!parsed.success) throw Object.assign(new Error('HIPICO_AUTOMATION_GROUP_ID_INVALID'), { code: 'HIPICO_AUTOMATION_GROUP_ID_INVALID' });
  return parsed.data;
}

function sendError(req: Request, res: Response, error: any) {
  const code = String(error?.code || error?.message || 'HIPICO_COMMAND_CENTER_ERROR').slice(0, 120);
  const status = code === 'HIPICO_OWNER_NOT_CONFIGURED' ? 503 : 400;
  return res.status(status).json(hipicoError({
    code,
    message: 'No se pudo construir el Command Center de Control Hípico.',
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

router.get('/command-center', async (req, res) => {
  try {
    const data = await buildHipicoCommandCenter({ ownerId: ownerId(), groupKey: groupKey(req), groupId: groupId(req) });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return sendError(req, res, error);
  }
});

router.use((error: any, req: Request, res: Response, _next: any) => sendError(req, res, error));

export default router;
