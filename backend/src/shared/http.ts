import type { Request, Response, NextFunction } from 'express';

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
  const requestId = String((req as any).requestId || '').slice(0, 96);
  return res.status(status).json({
    ok: false,
    message,
    requestId,
    ...(options.code ? { code: String(options.code).slice(0, 80) } : {}),
    ...(options.details === undefined ? {} : { details: options.details }),
  });
}
