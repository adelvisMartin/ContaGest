import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { HttpError } from '../../shared/http.js';
import type { OptionalPackRequestContext } from '../../shared/contracts/optional-pack.js';

export const optionalText = z.string().trim().max(2000).optional().nullable();
export const dateText = z.string().min(8).max(40);
export const jsonRecord = z.record(z.string(), z.unknown()).default({});
export const jsonArray = z.array(z.unknown()).default([]);
export type VerticalTransaction = Prisma.TransactionClient;

export const ctx = (req: any) => req.context as OptionalPackRequestContext;
export const one = <T>(rows: T[], message = 'Registro no encontrado.') => {
  if (!rows.length) throw new HttpError(404, message);
  return rows[0];
};
export const num = (value: unknown) => Number(value || 0);
