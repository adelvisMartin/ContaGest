import { createHash } from 'node:crypto';
import { z } from 'zod';

export const HIPICO_API_VERSION = '1' as const;
export const HIPICO_BRIDGE_PROTOCOL_VERSION = '1' as const;

export const hipicoComponentStateSchema = z.enum([
  'ready',
  'degraded',
  'unavailable',
  'not_configured'
]);

export type HipicoComponentState = z.infer<typeof hipicoComponentStateSchema>;

export const hipicoVersionSchema = z.object({
  productVersion: z.string().min(1).max(64),
  buildSha: z.string().min(1).max(64),
  apiVersion: z.literal(HIPICO_API_VERSION),
  bridgeProtocolVersion: z.string().min(1).max(32)
}).strict();

export type HipicoVersion = z.infer<typeof hipicoVersionSchema>;

export const hipicoMediaKindSchema = z.enum([
  'none',
  'image',
  'video',
  'audio',
  'document',
  'unknown'
]);

export const hipicoNormalizedMessageSchema = z.object({
  channel: z.string().trim().min(1).max(80),
  groupId: z.string().trim().min(1).max(220),
  externalMessageId: z.string().trim().min(1).max(320),
  senderId: z.string().trim().min(1).max(220),
  senderLabel: z.string().max(220).optional(),
  sentAt: z.string().datetime({ offset: true }),
  type: z.string().trim().min(1).max(80),
  text: z.string().max(4000),
  quotedExternalMessageId: z.string().max(320).nullable().optional(),
  historySync: z.boolean(),
  fromMe: z.boolean(),
  hasMedia: z.boolean(),
  mediaKind: hipicoMediaKindSchema.default('none')
}).strict();

export type HipicoNormalizedMessage = z.infer<typeof hipicoNormalizedMessageSchema>;

export const hipicoClassificationSchema = z.object({
  intent: z.string().trim().min(1).max(120),
  risk: z.enum(['safe', 'review', 'monetary']),
  confidence: z.number().min(0).max(1),
  suggestion: z.string().max(1200),
  autoEligible: z.boolean(),
  reason: z.string().max(240),
  entities: z.record(z.string(), z.unknown()).optional()
}).strict();

export type HipicoClassification = z.infer<typeof hipicoClassificationSchema>;

export const hipicoRaceContextSchema = z.object({
  racetrack: z.string().trim().min(1).max(120),
  raceNumber: z.number().int().min(1).max(999),
  raceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
}).strict();

export type HipicoRaceContext = z.infer<typeof hipicoRaceContextSchema>;

function gregorianDaysInMonth(year: number, month: number) {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12) return 0;
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function normalizedRaceTrack(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ');
}

export function normalizedRaceDate(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const daysInMonth = gregorianDaysInMonth(year, month);
  if (!daysInMonth || day < 1 || day > daysInMonth) return undefined;
  return raw;
}

/**
 * Deterministic race identity shared by canonical and compatibility consumers.
 * Observation-only callers may omit raceDate; canonical state writers must bind
 * an explicit date rather than infer one from server-local time.
 */
export function operationalRaceContextKey(input: {
  racetrack?: unknown;
  raceNumber?: unknown;
  raceDate?: unknown;
} | null | undefined) {
  const track = normalizedRaceTrack(input?.racetrack);
  const raceNumber = Number(input?.raceNumber);
  const raceDate = normalizedRaceDate(input?.raceDate);
  if (!track || !Number.isInteger(raceNumber) || raceNumber <= 0 || raceNumber > 999 || raceDate === undefined) return null;
  const material = raceDate ? `${raceDate}|${track}|${raceNumber}` : `${track}|${raceNumber}`;
  const digest = createHash('sha256').update(material).digest('hex').slice(0, 24);
  return `racectx_${digest}`;
}

const componentSchema = z.object({
  state: hipicoComponentStateSchema,
  reason: z.string().max(120).nullable().default(null)
}).strict();

export const hipicoSystemStatusSchema = z.object({
  ok: z.boolean(),
  service: z.literal('control-hipico'),
  timestamp: z.string().datetime(),
  version: hipicoVersionSchema,
  components: z.object({
    backend: componentSchema,
    database: componentSchema,
    bridge: componentSchema,
    channel: componentSchema,
    providers: componentSchema.extend({
      financialAuthority: z.literal(false)
    }),
    documentEngine: componentSchema,
    agent: componentSchema
  }).strict()
}).strict();

export type HipicoSystemStatus = z.infer<typeof hipicoSystemStatusSchema>;

export const hipicoErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  code: z.string().min(2).max(120),
  message: z.string().min(1).max(500),
  requestId: z.string().max(120).nullable(),
  retryable: z.boolean()
}).strict();

export type HipicoErrorEnvelope = z.infer<typeof hipicoErrorEnvelopeSchema>;

export function hipicoError(input: {
  code: string;
  message: string;
  requestId?: string | null;
  retryable?: boolean;
}): HipicoErrorEnvelope {
  return hipicoErrorEnvelopeSchema.parse({
    ok: false,
    code: String(input.code || 'HIPICO_ERROR').trim().slice(0, 120) || 'HIPICO_ERROR',
    message: String(input.message || 'Error de Control Hípico.').trim().slice(0, 500) || 'Error de Control Hípico.',
    requestId: input.requestId ? String(input.requestId).trim().slice(0, 120) : null,
    retryable: Boolean(input.retryable)
  });
}

export function componentState(state: HipicoComponentState, reason: string | null = null) {
  return componentSchema.parse({ state, reason });
}
