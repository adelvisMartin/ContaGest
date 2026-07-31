import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requireTenant, requirePermission } from '../../shared/middleware/context.js';

const router = Router();
router.use(requireTenant);

const BUSINESS_SECTORS = ['comercio', 'servicios', 'restaurante', 'manufactura', 'distribucion', 'profesional', 'otro'] as const;
const COMMERCIAL_USES = ['evaluacion', 'demostracion', 'operacion', 'capacitacion', 'soporte'] as const;

const licenseSchema = z.object({
  userEmail: z.string().email(),
  fullName: z.string().trim().min(2).max(120).default('Cliente de prueba'),
  plan: z.enum(['trial', 'monthly', 'quarterly', 'annual']).default('trial'),
  days: z.coerce.number().int().min(1).max(3650).default(15),
  modules: z.array(z.string().min(1).max(80)).min(1).max(80),
  businessSector: z.enum(BUSINESS_SECTORS).default('comercio'),
  commercialUse: z.enum(COMMERCIAL_USES).default('evaluacion'),
  maxDevices: z.coerce.number().int().min(1).max(5).default(1)
});

const validateSchema = z.object({
  licenseKey: z.string().min(20).max(160),
  deviceId: z.string().min(8).max(160),
  route: z.string().max(120).optional()
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
  tributos: ['taxes.export']
};

function generateLicenseKey() {
  const token = crypto.randomBytes(24).toString('hex').toUpperCase();
  return `CGVE-${token.slice(0, 8)}-${token.slice(8, 16)}-${token.slice(16, 24)}-${token.slice(24, 32)}`;
}

function generateTemporaryPassword() {
  return `Cg!${crypto.randomBytes(9).toString('base64url')}9a`;
}

function hashKey(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function normalizeConfig(value: unknown) {
  if (Array.isArray(value)) return { enabled: value, businessSector: 'comercio', commercialUse: 'evaluacion', maxDevices: 1, devices: [] as string[] };
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    enabled: Array.isArray(data.enabled) ? data.enabled.map(String) : [],
    businessSector: String(data.businessSector || 'comercio'),
    commercialUse: String(data.commercialUse || 'evaluacion'),
    maxDevices: Math.max(1, Math.min(5, Number(data.maxDevices || 1))),
    devices: Array.isArray(data.devices) ? data.devices.map(String).slice(0, 5) : []
  };
}

function publicLicense(record: any, tenant?: any) {
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
    businessSector: config.businessSector,
    commercialUse: config.commercialUse,
    maxDevices: config.maxDevices,
    devicesUsed: config.devices.length,
    expiresAt: record.expiresAt.toISOString(),
    status: record.status,
    lastSeenAt: record.lastSeenAt?.toISOString() || null,
    lastRoute: record.lastRoute || null,
    createdAt: record.createdAt.toISOString()
  };
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

async function validateLicense(tenantId: string, userEmail: string, body: z.infer<typeof validateSchema>) {
  const record = await prisma.licenseKey.findFirst({
    where: { tenantId, userEmail, status: 'active' },
    orderBy: { createdAt: 'desc' }
  });
  if (!record) throw new HttpError(403, 'No existe una licencia activa para este usuario y empresa.');
  if (record.expiresAt.getTime() <= Date.now()) {
    await prisma.licenseKey.update({ where: { id: record.id }, data: { status: 'expired' } });
    throw new HttpError(403, 'La licencia está vencida. Solicita una renovación.');
  }
  if (!secureEqual(record.keyHash, hashKey(body.licenseKey))) throw new HttpError(403, 'La licencia no pertenece a esta empresa o usuario.');

  const config = normalizeConfig(record.modules);
  if (!config.devices.includes(body.deviceId)) {
    if (config.devices.length >= config.maxDevices) throw new HttpError(403, `La licencia alcanzó el máximo de ${config.maxDevices} dispositivo(s).`);
    config.devices.push(body.deviceId);
  }

  const updated = await prisma.licenseKey.update({
    where: { id: record.id },
    data: {
      modules: config as any,
      lastSeenAt: new Date(),
      lastRoute: body.route || record.lastRoute
    }
  });
  return publicLicense(updated);
}

router.get('/', requirePermission('admin.manage'), asyncHandler(async (req, res) => {
  const ctx = (req as any).context;
  const [tenant, records] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { id: true, name: true, rif: true } }),
    prisma.licenseKey.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: 'desc' }, take: 500 })
  ]);
  ok(res, records.map((record) => publicLicense(record, tenant)));
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
  await prisma.licenseKey.updateMany({
    where: { tenantId: ctx.tenantId, userEmail: body.userEmail, status: 'active' },
    data: { status: 'revoked' }
  });

  const rawKey = generateLicenseKey();
  const expiresAt = new Date(Date.now() + body.days * 86400000);
  const config = {
    enabled: body.modules,
    businessSector: body.businessSector,
    commercialUse: body.commercialUse,
    maxDevices: body.maxDevices,
    devices: []
  };
  const record = await prisma.licenseKey.create({
    data: {
      tenantId: ctx.tenantId,
      userId: user.id,
      userEmail: body.userEmail,
      plan: body.plan,
      keyHash: hashKey(rawKey),
      keyPreview: `${rawKey.slice(0, 10)}••••${rawKey.slice(-4)}`,
      modules: config as any,
      expiresAt,
      status: 'active'
    }
  });

  ok(res, {
    ...publicLicense(record, tenant),
    licenseKey: rawKey,
    temporaryPassword,
    credentials: {
      tenantRif: tenant.rif,
      email: body.userEmail,
      temporaryPassword,
      licenseKey: rawKey
    },
    warning: 'La clave y contraseña se muestran una sola vez. Guárdalas en un canal seguro.'
  }, 201);
}));

router.post('/validate', asyncHandler(async (req, res) => {
  const ctx = (req as any).context;
  if (!ctx.email) throw new HttpError(401, 'La sesión no contiene correo de usuario.');
  const result = await validateLicense(ctx.tenantId, ctx.email, validateSchema.parse(req.body || {}));
  ok(res, result);
}));

router.post('/heartbeat', asyncHandler(async (req, res) => {
  const ctx = (req as any).context;
  if (!ctx.email) throw new HttpError(401, 'La sesión no contiene correo de usuario.');
  const result = await validateLicense(ctx.tenantId, ctx.email, validateSchema.parse(req.body || {}));
  ok(res, { accepted: true, license: result, at: new Date().toISOString() });
}));

router.patch('/:id/revoke', requirePermission('admin.manage'), asyncHandler(async (req, res) => {
  const ctx = (req as any).context;
  const record = await prisma.licenseKey.findFirst({ where: { id: req.params.id, tenantId: ctx.tenantId } });
  if (!record) throw new HttpError(404, 'Licencia no encontrada.');
  const updated = await prisma.licenseKey.update({ where: { id: record.id }, data: { status: 'revoked' } });
  ok(res, publicLicense(updated));
}));

export default router;
