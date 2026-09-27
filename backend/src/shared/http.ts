import type { Request, Response, NextFunction } from 'express';

type HttpErrorOptions = {
  code?: string;
  retryable?: boolean;
};

export class HttpError extends Error {
  status: number;
  details?: unknown;
  code?: string;
  retryable?: boolean;
  constructor(status: number, message: string, details?: unknown, options: HttpErrorOptions = {}) {
    super(message);
    this.status = status;
    this.details = details;
    const detailRecord = details && typeof details === 'object' && !Array.isArray(details)
      ? details as Record<string, unknown>
      : null;
    this.code = options.code
      || (typeof detailRecord?.code === 'string' ? detailRecord.code : undefined)
      || `HTTP_${status}`;
    this.retryable = options.retryable
      ?? (typeof detailRecord?.retryable === 'boolean' ? detailRecord.retryable : undefined)
      ?? [429, 502, 503, 504].includes(status);
  }
}

export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => Promise.resolve(fn(req, res, next)).catch(next);
export const ok = (res: Response, data: unknown, metaOrStatus: Record<string, unknown> | number = {}, status = 200) => {
  const meta = typeof metaOrStatus === 'number' ? {} : metaOrStatus;
  const httpStatus = typeof metaOrStatus === 'number' ? metaOrStatus : status;
  return res.status(httpStatus).json({ ok: true, data, meta });
};
