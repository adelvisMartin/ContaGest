import type { Request, Response, NextFunction } from 'express';
import { buildErrorEnvelope, normalizeOperationalError } from './observability/contract.js';
import { createTelemetryContext, currentCorrelationId } from './observability/context.js';
import { sanitizeLogValue } from './observability/logger.js';

export class HttpError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res, next)).catch(next);
export const ok = (res: Response, data: unknown, metaOrStatus: Record<string, unknown> | number = {}, status = 200) => {
  const meta = typeof metaOrStatus === 'number' ? {} : metaOrStatus;
  const httpStatus = typeof metaOrStatus === 'number' ? metaOrStatus : status;
  return res.status(httpStatus).json({ ok: true, data, meta });
};

export function fail(
  req: Request,
  res: Response,
  status: number,
  message: string,
  options: { code?: string; details?: unknown } = {},
) {
  const requestId = sanitizeLogValue((req as any).requestId || '', 96);
  const correlationId = sanitizeLogValue(
    (req as any).correlationId
      || (req as any).telemetry?.correlationId
      || currentCorrelationId()
      || createTelemetryContext({ requestId }).correlationId,
    96
  );
  const normalized = normalizeOperationalError(Object.assign(new Error(message), {
    status,
    ...(options.code ? { code: options.code } : {}),
    ...(options.details === undefined ? {} : { details: options.details })
  }));

  return res.status(normalized.status).json(buildErrorEnvelope(normalized, { correlationId, requestId }));
}
