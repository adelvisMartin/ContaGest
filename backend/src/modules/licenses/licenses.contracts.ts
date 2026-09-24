import { z } from 'zod';
import { ACCESS_MANIFEST } from '../../shared/contracts/accessManifest.js';

export const BUSINESS_SECTORS = [
  'contador', 'comercio', 'servicios', 'restaurante', 'salud', 'veterinaria', 'psicologia', 'odontologia', 'gimnasio', 'nutricion',
  'manufactura', 'distribucion', 'profesional', 'otro'
] as const;
export const COMMERCIAL_USES = ['evaluacion', 'demostracion', 'operacion', 'capacitacion', 'soporte'] as const;
export const CANONICAL_LICENSE_MODULES = new Set(ACCESS_MANIFEST.modules.map((item) => item.route));
export const LICENSE_ROUTE_ALLOWLIST = new Set(['login', ...CANONICAL_LICENSE_MODULES]);
export const licenseModuleSchema = z.string().min(1).max(80).refine(
  (value) => CANONICAL_LICENSE_MODULES.has(value),
  'Módulo no reconocido por el manifiesto de acceso.'
);
export const licenseRouteSchema = z.string().max(160).refine(
  (value) => LICENSE_ROUTE_ALLOWLIST.has(value),
  'Ruta no reconocida por el manifiesto de acceso.'
);

export const licenseSchema = z.object({
  userEmail: z.string().email(),
  fullName: z.string().trim().min(2).max(120).default('Cliente de prueba'),
  plan: z.enum(['trial', 'monthly', 'quarterly', 'annual', 'enterprise']).default('trial'),
  days: z.coerce.number().int().min(1).max(3650).default(15),
  modules: z.array(licenseModuleSchema).min(1).max(120).transform((modules) => [...new Set(modules)]),
  businessSector: z.enum(BUSINESS_SECTORS).default('comercio'),
  commercialUse: z.enum(COMMERCIAL_USES).default('evaluacion'),
  maxUsers: z.coerce.number().int().min(1).max(100).default(1),
  maxDevices: z.coerce.number().int().min(1).max(20).default(1),
  subscriptionId: z.string().uuid().optional(),
  notes: z.string().trim().max(1000).optional()
});

export const validateSchema = z.object({
  licenseKey: z.string().min(20).max(180).optional(),
  deviceId: z.string().min(8).max(240).optional(),
  deviceLabel: z.string().trim().max(120).optional(),
  route: licenseRouteSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export type ValidateLicenseInput = z.infer<typeof validateSchema>;
