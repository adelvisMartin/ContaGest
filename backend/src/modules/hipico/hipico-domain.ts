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
});
export type HipicoVersion = z.infer<typeof hipicoVersionSchema>;

const componentSchema = z.object({
  state: hipicoComponentStateSchema,
  reason: z.string().max(120).nullable().default(null)
});

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
    providers: componentSchema.extend({ financialAuthority: z.literal(false) }),
    documentEngine: componentSchema,
    agent: componentSchema
  })
});
export type HipicoSystemStatus = z.infer<typeof hipicoSystemStatusSchema>;

export const hipicoErrorEnvelopeSchema = z.object({
  ok: z.literal(false),
  code: z.string().min(2).max(120),
  message: z.string().min(1).max(500),
  requestId: z.string().max(120).nullable(),
  retryable: z.boolean()
});
export type HipicoErrorEnvelope = z.infer<typeof hipicoErrorEnvelopeSchema>;

export function hipicoError(input: { code: string; message: string; requestId?: string | null; retryable?: boolean }): HipicoErrorEnvelope {
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
