import crypto from 'node:crypto';
import { z } from 'zod';

export const reportGroupKey = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._:-]+$/);
export const reportParticipantCode = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._:-]+$/);
export const reportDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(value + 'T12:00:00.000Z');
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}, 'Fecha calendario inválida');
export const createShareSchema = z.object({
  groupKey: reportGroupKey,
  audience: z.enum(['participant', 'group']),
  participantCode: reportParticipantCode.optional(),
  hours: z.number().int().min(1).max(24 * 7)
}).strict().superRefine((value, ctx) => {
  if ((value.audience === 'participant') !== Boolean(value.participantCode)) {
    ctx.addIssue({ code: 'custom', path: ['participantCode'], message: 'El participante debe existir solamente en un enlace personal.' });
  }
});
const tokenRegex = /^[A-Za-z0-9_-]{43}$/;
const TOKEN_PREFIX = 'hipico:report-link:v1\0';
export function createReportToken() { return crypto.randomBytes(32).toString('base64url'); }
export function validateReportToken(value: unknown) {
  if (typeof value !== 'string' || !tokenRegex.test(value)) return null;
  return value;
}
export function hashReportToken(token: string) {
  if (!validateReportToken(token)) throw new Error('HIPICO_REPORT_TOKEN_INVALID');
  return crypto.createHash('sha256').update(TOKEN_PREFIX).update(token).digest('hex');
}
export function dateWindowUtc(date: string) {
  const day = reportDate.parse(date);
  const start = new Date(day + 'T00:00:00.000Z');
  const end = new Date(start.valueOf() + 24 * 60 * 60 * 1000);
  return { from: start, until: end };
}
export function expiryDate(hours: number, now = new Date()) {
  if (!Number.isInteger(hours) || hours < 1 || hours > 168) throw new Error('HIPICO_REPORT_TTL_INVALID');
  return new Date(now.valueOf() + hours * 3600_000);
}
export function shareAllowed(share: { expiresAt: Date | string; revokedAt: Date | string | null }, now = new Date()) {
  return !share.revokedAt && new Date(share.expiresAt).valueOf() > now.valueOf();
}
