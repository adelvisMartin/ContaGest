import { Router, type Request } from 'express';
import { buildHipicoSystemStatus, buildHipicoVersion, hipicoReadinessFromStatus } from './hipico-system.service.js';
import { hipicoError } from './hipico-domain.js';

function requestId(req: Request) {
  const value = String((req as any).requestId || '').trim();
  return value || null;
}

export function createHipicoSystemRouter() {
  const router = Router();

  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    next();
  });

  router.get('/version', (_req, res) => {
    return res.status(200).json({ ok: true, data: buildHipicoVersion() });
  });

  router.get('/status', async (req, res) => {
    try {
      const status = await buildHipicoSystemStatus();
      return res.status(200).json({ ok: true, data: status });
    } catch {
      return res.status(503).json(hipicoError({
        code: 'HIPICO_SYSTEM_STATUS_UNAVAILABLE',
        message: 'No se pudo determinar el estado de Control Hípico.',
        requestId: requestId(req),
        retryable: true
      }));
    }
  });

  router.get('/readiness', async (req, res) => {
    try {
      const status = await buildHipicoSystemStatus();
      const readiness = hipicoReadinessFromStatus(status);
      return res.status(readiness.ready ? 200 : 503).json({
        ok: readiness.ready,
        data: readiness
      });
    } catch {
      return res.status(503).json(hipicoError({
        code: 'HIPICO_SYSTEM_NOT_READY',
        message: 'Control Hípico no está listo para atender tráfico.',
        requestId: requestId(req),
        retryable: true
      }));
    }
  });

  return router;
}

export default createHipicoSystemRouter();
