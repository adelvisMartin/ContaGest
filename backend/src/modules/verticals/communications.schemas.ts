import { z } from 'zod';

/**
 * Validation authority for cross-vertical communications requests.
 *
 * Keep HTTP handlers focused on authorization, persistence and rendering while
 * request-shape semantics remain centralized and reusable.
 */
export const communicationTemplateSchema = z.object({
  channel: z.enum(['whatsapp','email','sms']).default('whatsapp'),
  vertical: z.enum(['general','health','veterinary','gym']).default('general'),
  event: z.string().trim().min(2).max(100),
  name: z.string().trim().min(2).max(160),
  body: z.string().trim().min(2).max(4000),
  variables: z.array(z.string().max(80)).default([]),
  active: z.boolean().default(true)
});

export const communicationRenderSchema = z.object({
  vertical: z.string(),
  event: z.string(),
  values: z.record(z.string(),z.union([z.string(),z.number(),z.boolean(),z.null()])).default({})
});
