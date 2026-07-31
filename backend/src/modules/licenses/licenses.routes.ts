import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { env } from '../../config/env.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requireTenant, requirePermission } from '../../shared/middleware/context.js';

const router = Router();
router.use(requireTenant);

const BUSINESS_SECTORS = [
  'contador', 'comercio', 'servicios', 'restaurante', 'salud', 'veterinaria', 'gimnasio',
  'manufactura', 'distribucion', 'profesional', 'otro'
] as const;
const COMMERCIAL_USES = ['evaluacion', 'demostracion', 'operacion', 'capacitacion', 'soporte'] as const;

const licenseSchema = z.object({
  userEmail: z.string().email(),
  fullName: z.string().trim().min(2).max(120).default('Cliente de prueba'),
  plan: z.enum(['trial', 'monthly', 'quarterly', 'annual', 'enterprise']).default('trial'),
  days: z.coerce.number().int().min(1).max(3650).default(15),
  modules: z.array(z.string().min(1).max(80)).min(1).max(120),
  businessSector: z.enum(BUSINESS_SECTORS).default('comercio'),
  commercialUse: z.enum(COMMERCIAL_USES).default('evaluacion'),
  maxUsers: z.coerce.number().int().min(1).max(100).default(1),
  maxDevices: z.coerce.number().int().min(1).max(20).default(1),
  notes: z.string().trim().max(1000).optional()
});

const validateSchema = z.object({
  licenseKey: z.string().min(20).max(180),
  deviceId: z.string().min(8).max(240),
  deviceLabel: z.string().trim().max(120).optional(),
  route: z.string().max(160).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const permissionByModule: Record<string, string[]> = {
  dashboard: ['reports.view'],
  ventas: ['sales.view'],
  cotizacion: ['sales.view'],
  clientes: ['clients.manage'],
  inventario: ['inventory.manage'],
  kardex: ['inventory.manage'],
  compras: ['purchases.manage'],
  proveedores: ['purchases.manage'],
  reportes: ['reports.view'],
  analytics: ['reports.view'],
  contabilidad: ['reports.view'],
  'libro-mayor': ['reports.view'],
  'balance-sumas-saldos': ['reports.view'],
  'hoja-trabajo': ['reports.view'],
  'asistente-ia': ['reports.view'],
  bancos: ['banking.manage'],
  nomina: ['payroll.manage'],
  tributos: ['taxes.export'],
  salud: ['health.manage'],
  veterinaria: ['health.manage'],
  gimnasio: ['gym.manage'],
  rutinas: ['gym.manage'],
  nutricion: ['gym.manage'],
  mensajes: ['communications.manage']
};

const sectorPrefix: Record<string, string> = {
  contador:'CNT', comercio:'COM', servicios:'SRV', restaurante:'RES', salud:'MED', veterinaria:'VET', gimnasio:'GYM',
  manufactura:'MAN', distribucion:'DIS', profesional:'PRO', otro:'ERP'
};

function generateLicenseKey(sector: string) {
  const token = crypto.randomBytes(24).toString('hex').toUpperCase();
  return `CGVE-${sectorPrefix[sector] || 'ERP'}-${token.slice(0, 8)}-${token.slice(8, 16)}-${token.slice(16, 24)}-${token.slice(24, 32)}`;
}

function generateTemporaryPassword() {
  return `Cg!${crypto.randomBytes(10).toString('base64url')}9a`;
}

function hashKey(value: string) {
  return crypto.createHmac('sha256', env.JWT_SECRET).update(value.trim().toUpperCase()).digest('hex');
}

function hashDevice(value: string) {
  return crypto.createHmac('sha256', env.JWT_SECRET).update(value.trim()).digest('hex');
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function normalizeConfig(value: unknown) {
  if (Array.isArray(value)) return { enabled: value, businessSector: 'comercio', commercialUse: 'evaluacion' };
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    enabled: Array.isArray(data.enabled) ? data.enabled.map(String) : [],
    businessSector: String(data.businessSector || 'comercio'),
    commercialUse: String(data.commercialUse || 'evaluacion')
  };
}

function publicLicense(record: any, tenant?: any, extension: any = {}) {
  const config = normalizeConfig(record.modules);
  return {
    id: record.id,
    tenantId: record.tenantId,
    company: tenant ? { id: tenant.id, name: tenant.name, rif: tenant.rif } : undefined,
    userId: record.userId,
    userEmail: record.userEmail,
    plan: record.plan,
    keyPreview: record.keyPreview,
    modules: config.enabled,
    businessSector: extension.businessCategory || config.businessSector,
    commercialUse: config.commercialUse,
    maxUsers: Number(extension.maxUsers || 1),
    maxDevices: Number(extension.maxDevices || 1),
    devicesUsed: Number(extension.activationCount || 0),
    companyName: extension.companyName || tenant?.name,
    companyRif: extension.companyRif || tenant?.rif,
    expiresAt: new Date(record.expiresAt).toISOString(),
    status: record.status,
    lastSeenAt: record.lastSeenAt ? new Date(record.lastSeenAt).toISOString() : null,
    lastRoute: record.lastRoute || null,
    revokedAt: extension.revokedAt ? new Date(extension.revokedAt).toISOString() : null,
    createdAt: new Date(record.createdAt).toISOString()
  };
}

async function extensionByLicenseIds(ids: string[]) {
  if (!ids.length) return new Map<string, any>();
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id", "businessCategory", "companyName", "companyRif", "maxUsers", "maxDevices", "activationCount", "revokedAt"
    FROM public."LicenseKey" WHERE "id" = ANY($1::text[])
  `, ids);
  return new Map(rows.map((row) => [row.id, row]));
}

async function assignTrialRole(tenantId: string, userId: string, modules: string[]) {
  const permissionKeys = [...new Set(['reports.view', ...modules.flatMap((module) => permissionByModule[module] || [])])];
  for (const key of permissionKeys) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, description: `Permiso ${key}` }
    });
  }

  const roleName = `Cliente prueba ${userId.slice(0, 8)}`;
  const role = await prisma.role.upsert({
    where: { tenantId_name: { tenantId, name: roleName } },
    update: { description: 'Acceso limitado por licencia de evaluación.', system: false },
    create: { tenantId, name: roleName, description: 'Acceso limitado por licencia de evaluación.', system: false }
  });

  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  const permissions = await prisma.permission.findMany({ where: { key: { in: permissionKeys } }, select: { id: true } });
  if (permissions.length) {
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      skipDuplicates: true
    });
  }
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    update: {},
    create: { userId, roleId: role.id }
  });
}

async function audit(req: any, action: string, entityId: string, after: unknown) {
  const ctx = req.context;
  await prisma.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      userId: ctx.userId || null,
      action,
      entity: 'LicenseKey',
      entityId,
      after: after as any,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || null
    }
  });
}

async function validateLicense(req: any, body: z.infer<typeof validateSchema>) {
  const ctx = req.context;
  if (!ctx.email) throw new HttpError(401, 'La sesión no contiene correo de usuario.');
  const record = await prisma.licenseKey.findFirst({
    where: { tenantId: ctx.tenantId, userEmail: ctx.email, status: 'active' },
    orderBy: { createdAt: 'desc' }
  });
  if (!record) throw new HttpError(403, 'No existe una licencia activa para este usuario y empresa.');
  if (record.expiresAt.getTime() <= Date.now()) {
    await prisma.licenseKey.update({ where: { id: record.id }, data: { status: 'expired' } });
    throw new HttpError(403, 'La licencia está vencida. Solicita una renovación.');
  }
  if (!secureEqual(record.keyHash, hashKey(body.licenseKey))) throw new HttpError(403, 'La licencia no pertenece a esta empresa o usuario.');

  const extensionRows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT "businessCategory", "companyRif", "maxUsers", "maxDevices", "activationCount"
    FROM public."LicenseKey" WHERE "id" = $1 AND "tenantId" = $2 LIMIT 1
  `, record.id, ctx.tenantId);
  const extension = extensionRows[0] || {};
  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { rif:true } });
  if (extension.companyRif && tenant && extension.companyRif.trim().toUpperCase() !== tenant.rif.trim().toUpperCase()) {
    throw new HttpError(403, 'La licencia está vinculada a otra empresa.');
  }

  const deviceHash = hashDevice(body.deviceId);
  const existing = await prisma.$queryRawUnsafe<any[]>(`
    SELECT "id" FROM public."LicenseActivation" WHERE "licenseId" = $1 AND "deviceHash" = $2 LIMIT 1
  `, record.id, deviceHash);
  if (!existing.length) {
    const countRows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT count(*)::int AS count FROM public."LicenseActivation" WHERE "licenseId" = $1 AND "status" = 'active'
    `, record.id);
    if (Number(countRows[0]?.count || 0) >= Number(extension.maxDevices || 1)) {
      throw new HttpError(403, `La licencia alcanzó el máximo de ${Number(extension.maxDevices || 1)} dispositivo(s).`);
    }
  }

  await prisma.$executeRawUnsafe(`
    INSERT INTO public."LicenseActivation"
      ("id", "tenantId", "licenseId", "userId", "deviceHash", "deviceLabel", "status", "firstSeenAt", "lastSeenAt", "lastIp", "lastUserAgent", "metadata")
    VALUES
      (gen_random_uuid()::text, $1, $2, $3, $4, $5, 'active', now(), now(), $6, $7, $8::jsonb)
    ON CONFLICT ("licenseId", "deviceHash") DO UPDATE SET
      "userId" = EXCLUDED."userId", "deviceLabel" = COALESCE(EXCLUDED."deviceLabel", public."LicenseActivation"."deviceLabel"),
      "status" = 'active', "lastSeenAt" = now(), "lastIp" = EXCLUDED."lastIp", "lastUserAgent" = EXCLUDED."lastUserAgent", "metadata" = EXCLUDED."metadata"
  `, ctx.tenantId, record.id, ctx.userId || null, deviceHash, body.deviceLabel || null, req.ip, req.headers['user-agent'] || null, JSON.stringify(body.metadata || {}));

  const countRows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT count(*)::int AS count FROM public."LicenseActivation" WHERE "licenseId" = $1 AND "status" = 'active'
  `, record.id);
  const activationCount = Number(countRows[0]?.count || 0);
  const updated = await prisma.licenseKey.update({
    where: { id: record.id },
    data: { lastSeenAt: new Date(), lastRoute: body.route || record.lastRoute }
  });
  await prisma.$executeRawUnsafe(`
    UPDATE public."LicenseKey" SET "activationCount" = $2, "lastIp" = $3, "lastUserAgent" = $4, "updatedAt" = now() WHERE "id" = $1
  `, record.id, activationCount, req.ip, req.headers['user-agent'] || null);

  return publicLicense(updated, tenant, { ...extension, activationCount });
}

router.get('/', requirePermission('admin.manage'), asyncHandler(async (req, res) => {
  const ctx = (req as any).context;
  const [tenant, records] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { id: true, name: true, rif: true } }),
    prisma.licenseKey.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: 'desc' }, take: 500 })
  ]);
  const extensions = await extensionByLicenseIds(records.map((record) => record.id));
  ok(res, records.map((record) => publicLicense(record, tenant, extensions.get(record.id))));
}));

router.post('/', requirePermission('admin.manage'), asyncHandler(async (req, res) => {
  const ctx = (req as any).context;
  const body = licenseSchema.parse(req.body || {});
  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { id: true, name: true, rif: true } });
  if (!tenant) throw new HttpError(404, 'Empresa no encontrada.');

  const existingUser = await prisma.userProfile.findUnique({
    where: { tenantId_email: { tenantId: ctx.tenantId, email: body.userEmail } },
    include: { userRoles: { include: { role: true } } }
  });
  if (existingUser?.userRoles.some((assignment) => assignment.role.system)) {
    throw new HttpError(409, 'No se puede reemplazar la credencial de un usuario administrativo mediante una licencia de prueba.');
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  const user = existingUser
    ? await prisma.userProfile.update({
        where: { id: existingUser.id },
        data: { fullName: body.fullName, passwordHash, status: 'active' }
      })
    : await prisma.userProfile.create({
        data: { tenantId: ctx.tenantId, email: body.userEmail, fullName: body.fullName, passwordHash, status: 'active' }
      });

  await assignTrialRole(ctx.tenantId, user.id, body.modules);
  const previous = await prisma.licenseKey.findMany({ where: { tenantId: ctx.tenantId, userEmail: body.userEmail, status: 'active' }, select: { id:true } });
  if (previous.length) {
    await prisma.licenseKey.updateMany({ where: { id: { in: previous.map((item) => item.id) } }, data: { status: 'revoked' } });
    await prisma.$executeRawUnsafe(`UPDATE public."LicenseActivation" SET "status" = 'revoked' WHERE "licenseId" = ANY($1::text[])`, previous.map((item) => item.id));
  }

  const rawKey = generateLicenseKey(body.businessSector);
  const expiresAt = new Date(Date.now() + body.days * 86400000);
  const config = { enabled: body.modules, businessSector: body.businessSector, commercialUse: body.commercialUse };
  const record = await prisma.licenseKey.create({
    data: {
      tenantId: ctx.tenantId,
      userId: user.id,
      userEmail: body.userEmail,
      plan: body.plan,
      keyHash: hashKey(rawKey),
      keyPreview: `${rawKey.slice(0, 14)}-••••-${rawKey.slice(-4)}`,
      modules: config as any,
      expiresAt,
      status: 'active'
    }
  });
  await prisma.$executeRawUnsafe(`
    UPDATE public."LicenseKey" SET "businessCategory" = $2, "companyName" = $3, "companyRif" = $4,
      "maxUsers" = $5, "maxDevices" = $6, "activationCount" = 0, "metadata" = $7::jsonb, "updatedAt" = now()
    WHERE "id" = $1
  `, record.id, body.businessSector, tenant.name, tenant.rif, body.maxUsers, body.maxDevices,
    JSON.stringify({ commercialUse:body.commercialUse, notes:body.notes || '', issuedBy:ctx.userId || null }));

  const publicData = publicLicense(record, tenant, {
    businessCategory: body.businessSector,
    companyName: tenant.name,
    companyRif: tenant.rif,
    maxUsers: body.maxUsers,
    maxDevices: body.maxDevices,
    activationCount: 0
  });
  await audit(req, 'license.create', record.id, publicData);

  ok(res, {
    ...publicData,
    licenseKey: rawKey,
    temporaryPassword,
    credentials: {
      tenantRif: tenant.rif,
      companyName: tenant.name,
      businessSector: body.businessSector,
      email: body.userEmail,
      temporaryPassword,
      licenseKey: rawKey,
      expiresAt: expiresAt.toISOString(),
      modules: body.modules
    },
    warning: 'La licencia y la contraseña se muestran una sola vez. Envíalas por un canal seguro y no publiques capturas.'
  }, 201);
}));

router.post('/validate', asyncHandler(async (req, res) => {
  const result = await validateLicense(req, validateSchema.parse(req.body || {}));
  ok(res, result);
}));

router.post('/heartbeat', asyncHandler(async (req, res) => {
  const result = await validateLicense(req, validateSchema.parse(req.body || {}));
  ok(res, { accepted: true, license: result, at: new Date().toISOString() });
}));

router.patch('/:id/revoke', requirePermission('admin.manage'), asyncHandler(async (req, res) => {
  const ctx = (req as any).context;
  const record = await prisma.licenseKey.findFirst({ where: { id: req.params.id, tenantId: ctx.tenantId } });
  if (!record) throw new HttpError(404, 'Licencia no encontrada.');
  const updated = await prisma.licenseKey.update({ where: { id: record.id }, data: { status: 'revoked' } });
  await prisma.$executeRawUnsafe(`UPDATE public."LicenseKey" SET "revokedAt" = now(), "updatedAt" = now() WHERE "id" = $1`, record.id);
  await prisma.$executeRawUnsafe(`UPDATE public."LicenseActivation" SET "status" = 'revoked' WHERE "licenseId" = $1`, record.id);
  const extension = (await extensionByLicenseIds([record.id])).get(record.id);
  const data = publicLicense(updated, undefined, extension);
  await audit(req, 'license.revoke', record.id, data);
  ok(res, data);
}));

export default router;
