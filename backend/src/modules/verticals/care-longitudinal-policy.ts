import { createHash } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from '../../shared/http.js';

const dateTime = z.string().datetime().refine(
  (value) => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value,
  'La fecha clínica no es válida.'
);

export const careClinicalFactSchema = z.object({
  idempotencyKey: z.string().uuid(),
  patientId: z.string().trim().min(10).max(200),
  encounterId: z.string().trim().min(10).max(200).optional().nullable(),
  kind: z.enum(['problem', 'allergy', 'medication', 'diagnosis', 'procedure']),
  detail: z.record(z.string(), z.unknown()).refine(
    (value) => Object.keys(value).length > 0 && JSON.stringify(value).length <= 16_384,
    'Se requiere contenido clínico acotado.'
  ),
  effectiveAt: dateTime,
  // External provenance is assigned only by a future authenticated import adapter.
  provenance: z.literal('clinician').default('clinician')
}).strict();

export const careClinicalFactAmendmentSchema = careClinicalFactSchema.omit({ patientId: true, idempotencyKey: true }).extend({
  reason: z.string().trim().min(10).max(500)
}).strict();

export function assertCareFactReviewable(status: string): void {
  if (status !== 'draft') throw new HttpError(409, 'Solo se puede revisar un hecho clínico en borrador.');
}

export function assertCareFactAmendable(status: string): void {
  if (status !== 'reviewed') throw new HttpError(409, 'Solo se puede enmendar un hecho clínico revisado.');
}

export type CareFactSnapshot = {
  tenantId: string;
  patientId: string;
  kind: string;
  detail: Record<string, unknown>;
  effectiveAt: string;
  encounterId?: string | null;
  provenance?: string;
  supersedesId?: string | null;
  amendmentReason?: string | null;
};

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(
      ([key, entry]) => [key, canonicalJson(entry)]
    ));
  }
  return value;
}

export function fingerprintCareFact(value: CareFactSnapshot): string {
  return createHash('sha256').update(JSON.stringify({
    tenantId: value.tenantId,
    patientId: value.patientId,
    kind: value.kind,
    detail: canonicalJson(value.detail),
    effectiveAt: new Date(value.effectiveAt).toISOString(),
    encounterId: value.encounterId ?? null,
    provenance: value.provenance ?? 'clinician',
    supersedesId: value.supersedesId ?? null,
    amendmentReason: value.amendmentReason ?? null
  })).digest('hex');
}

const timelineItemSchema = z.object({
  effectiveAt: z.string().datetime().refine(v => new Date(v).toISOString() === v),
  sourceType: z.enum(['fact', 'encounter', 'measurement', 'prescription', 'lab_order', 'lab_result', 'study', 'hospitalization', 'procedure', 'immunization']),
  sourceId: z.string().min(1).max(200)
}).strict();

export type CareTimelineCursor = z.infer<typeof timelineItemSchema>;

export function encodeCareTimelineCursor(value: CareTimelineCursor): string {
  return Buffer.from(JSON.stringify(timelineItemSchema.parse(value))).toString('base64url');
}

export function decodeCareTimelineCursor(value: unknown): CareTimelineCursor | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new HttpError(422, 'Cursor clínico inválido.');
  }
  try {
    return timelineItemSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
  } catch {
    throw new HttpError(422, 'Cursor clínico inválido.');
  }
}
