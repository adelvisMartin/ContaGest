import { Router, type Request, type Response } from 'express';
import { operatorTokenValid } from '../hipico-bot/hipico-operator-security.js';
import { hipicoError } from './hipico-domain.js';
import { buildHipicoSystemStatus, buildHipicoVersion, hipicoReadinessFromStatus } from './hipico-system.service.js';

const router = Router();

function requestId(req: Request) {
  return String((req as any).requestId || '').trim() || null;
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

function sendError(req: Request, res: Response, error: any) {
  return res.status(503).json(hipicoError({
    code: String(error?.code || error?.message || 'HIPICO_SYSTEM_STATUS_UNAVAILABLE').slice(0, 120),
    message: 'No se pudo verificar el estado de Control Hípico.',
    requestId: requestId(req),
    retryable: true
  }));
}

router.get('/version', (req, res) => {
  try { return res.status(200).json({ ok: true, data: buildHipicoVersion() }); }
  catch (error) { return sendError(req, res, error); }
});

router.get('/status', async (req, res) => {
  try { return res.status(200).json({ ok: true, data: await buildHipicoSystemStatus() }); }
  catch (error) { return sendError(req, res, error); }
});

router.get('/readiness', async (req, res) => {
  try {
    const data = hipicoReadinessFromStatus(await buildHipicoSystemStatus());
    return res.status(data.ready ? 200 : 503).json({ ok: data.ready, data });
  } catch (error) { return sendError(req, res, error); }
});

export default router;
