import { z } from 'zod';
import { SAFE_DEMO_MODULES } from '../licenses/licenses.contracts.js';

// A commercial prospect record is NOT an entitlement, invitation or
// authenticated licence. Reject unknown/privileged selections nonetheless:
// the UI and future provisioning must never silently promote these labels.
const moduleCode = z.string().refine(
  (value) => SAFE_DEMO_MODULES.has(value),
  'El módulo no está habilitado para demostraciones.'
);

const calendarDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value)=>{
  const timestamp = Date.parse(value + 'T00:00:00.000Z');
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0,10)===value;
}, 'La fecha de vencimiento debe ser una fecha calendario válida.');

export const demoSchema = z.object({
  id: z.string().trim().min(1).max(120).optional(),
  prospect: z.string().trim().min(2).max(160),
  email: z.string().email().max(254).optional(),
  phone: z.string().trim().max(80).optional(),
  enabledModules: z.array(moduleCode).max(SAFE_DEMO_MODULES.size)
    .transform((modules) => [...new Set(modules)]).default([]),
  expiresAt: calendarDay,
  maxUsers: z.coerce.number().int().min(1).max(50).default(3),
  status: z.enum(['active','paused','expired']).default('active'),
  notes: z.string().trim().max(2000).optional()
}).strict();
