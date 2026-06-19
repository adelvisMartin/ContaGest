import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { HttpError } from '../http.js';

export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(new HttpError(422, 'Datos inválidos', parsed.error.flatten()));
    req.body = parsed.data;
    next();
  };
}
