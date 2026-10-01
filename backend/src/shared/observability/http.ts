import type { Request, Response, NextFunction } from 'express';
import { createTelemetryContext } from './context.js';
import {
  logger,
  pseudonymizeIdentifier,
  requestRouteTemplate,
  sanitizeLogValue
} from './logger.js';
import { recordHttpRequest, recordImportBatchDuration } from './metrics.js';
import { runWithTelemetryContext } from './store.js';

function durationMs(startedAt: bigint) {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000;
}

export function requestObservability(req: Request, res: Response, next: NextFunction) {
  const startedAt = process.hrtime.bigint();
  const requestId = sanitizeLogValue((req as any).requestId || '', 96);
  const telemetry = createTelemetryContext({
    traceparent: req.header('traceparent'),
    correlationId: req.header('x-correlation-id'),
    requestId
  });
  (req as any).telemetry = telemetry;
  (req as any).correlationId = telemetry.correlationId;
  res.setHeader('x-correlation-id', telemetry.correlationId);
  res.setHeader('traceparent', telemetry.traceparent);

  const requestLog = logger.child({
    requestId: requestId || undefined,
    correlationId: telemetry.correlationId,
    traceId: telemetry.traceId,
    spanId: telemetry.spanId
  });
  (req as any).log = requestLog;

  let recorded = false;
  const record = (aborted = false) => {
    if (recorded) return;
    recorded = true;

    const elapsedMs = durationMs(startedAt);
    const route = requestRouteTemplate(req);
    const status = aborted && !res.writableEnded ? 499 : res.statusCode;
    const method = sanitizeLogValue(req.method || 'UNKNOWN', 12).toUpperCase();
    const tenantId = (req as any).context?.tenantId ?? (req as any).auth?.tenantId;
    const userId = (req as any).auth?.userId ?? (req as any).context?.userId;
    const tenantRef = tenantId ? pseudonymizeIdentifier('tenant', tenantId) : undefined;
    const userRef = userId ? pseudonymizeIdentifier('user', userId) : undefined;

    recordHttpRequest({ method, route, status, durationMs: elapsedMs });
    if (method !== 'GET' && String(req.originalUrl || '').startsWith('/api/v1/imports')) {
      recordImportBatchDuration(elapsedMs);
    }

    const fields = {
      event: aborted ? 'http.request.aborted' : 'http.request',
      requestId: requestId || undefined,
      correlationId: telemetry.correlationId,
      traceId: telemetry.traceId,
      spanId: telemetry.spanId,
      route,
      method,
      status,
      outcome: status >= 500 ? 'error' : status >= 400 ? 'rejected' : 'success',
      durationMs: Number(elapsedMs.toFixed(3)),
      tenantRef,
      userRef
    };

    if (status >= 500) requestLog.error(fields, aborted ? 'request aborted' : 'request completed');
    else if (status >= 400) requestLog.warn(fields, aborted ? 'request aborted' : 'request completed');
    else requestLog.info(fields, aborted ? 'request aborted' : 'request completed');
  };

  res.once('finish', () => record(false));
  res.once('close', () => {
    if (!res.writableEnded) record(true);
  });

  runWithTelemetryContext(telemetry, next);
}
