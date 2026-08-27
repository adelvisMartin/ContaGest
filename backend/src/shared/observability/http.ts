import type { Request, Response, NextFunction } from 'express';
import {
  logger,
  pseudonymizeIdentifier,
  requestRouteTemplate,
  sanitizeLogValue
} from './logger.js';
import { recordHttpRequest, recordImportBatchDuration } from './metrics.js';

function durationMs(startedAt: bigint) {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}

export function requestObservability(req: Request, res: Response, next: NextFunction) {
  const startedAt = process.hrtime.bigint();
  const requestId = sanitizeLogValue((req as any).requestId || '', 96);
  const requestLog = logger.child({ requestId: requestId || undefined });
  (req as any).log = requestLog;

  let recorded = false;
  const record = (aborted = false) => {
    if (recorded) return;
    recorded = true;

    const elapsedMs = durationMs(startedAt);
    const route = requestRouteTemplate(req);
    const status = aborted && !res.writableEnded ? 499 : res.statusCode;
    const method = sanitizeLogValue(req.method || 'UNKNOWN', 12).toUpperCase();
    const tenantId = (req as any).context?.tenantId;
    const tenantRef = tenantId ? pseudonymizeIdentifier('tenant', tenantId) : undefined;

    recordHttpRequest({ method, route, status, durationMs: elapsedMs });
    if (method !== 'GET' && String(req.originalUrl || '').startsWith('/api/v1/imports')) {
      recordImportBatchDuration(elapsedMs);
    }

    const fields = {
      event: aborted ? 'http.request.aborted' : 'http.request',
      requestId: requestId || undefined,
      route,
      method,
      status,
      durationMs: Number(elapsedMs.toFixed(3)),
      tenantRef
    };

    if (status >= 500) requestLog.error(fields, aborted ? 'request aborted' : 'request completed');
    else if (status >= 400) requestLog.warn(fields, aborted ? 'request aborted' : 'request completed');
    else requestLog.info(fields, aborted ? 'request aborted' : 'request completed');
  };

  res.once('finish', () => record(false));
  res.once('close', () => {
    if (!res.writableEnded) record(true);
  });

  next();
}
