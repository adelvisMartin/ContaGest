import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requireTenant, requirePermission } from '../../shared/middleware/context.js';
import { ensureAccountMembership } from '../../shared/identity/accountMembership.js';
import { hashLicenseKey, validateUserLicense } from '../../shared/licensing/licenseGuard.js';
import { bootstrapQaLicense } from '../../shared/licensing/qaBootstrap.js';
import { readDeviceCredential, setDeviceCredentialCookie } from '../../shared/auth/sessionCookies.js';

const router = Router();
router.use(requireTenant);

const BUSINESS_SECTORS = [
  'contador', 'comercio', 'servicios', 'restaurante', 'salud', 'veterinaria', 'psicologia', 'odontologia', 'gimnasio', 'nutricion',
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
  subscriptionId: z.string().uuid().optional(),
  notes: z.string().trim().max(1000).optional()
});

const validateSchema = z.object({
  licenseKey: z.string().min(20).max(180).optional(),
  deviceId: z.string().min(8).max(240).optional(),
  deviceLabel: z.string().trim().max(120).optional(),
  route: z.string().max(160).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const permissionByModule: Record<string, string[]> = {
  dashboard: ['reports.view'],
  ventas: ['sales.manage','sales.view'],
  cotizacion: ['sales.manage','sales.view'],
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
  'estados-financieros': ['reports.view'],
  'cierre-contable': ['reports.view'],
  'plan-cuentas': ['reports.view'],
  'libro-ventas': ['taxes.export'],
  'asistente-ia': ['reports.view'],
  bancos: ['banking.manage'],
  nomina: ['payroll.manage'],
  rrhh: ['payroll.manage'],
  tributos: ['taxes.export'],
  salud: ['health.manage'],
  veterinaria: ['health.manage'],
  psicologia: ['health.manage'],
  odontologia: ['health.manage'],
  gimnasio: ['gym.manage'],
  rutinas: ['gym.manage'],
  nutricion: ['gym.manage'],
  mensajes: ['communications.manage']
};

const sectorPrefix: Record<string, string> = {
  contador:'CNT', comercio:'COM', servicios:'SRV', restaurante:'RES', salud:'MED', veterinaria:'VET', psicologia:'PSI', odontologia:'ODO', gimnasio:'GYM', nutricion:'NUT',
  manufactura:'MAN', distribucion:'DIS', profesional:'PRO', otro:'ERP'
};

function generateLicenseKey(sector: string) {
  const token = crypto.randomBytes(24).toString('hex').toUpperCase();
  return `CGVE-${sectorPrefix[sector] || 'ERP'}-${token.slice(0, 8)}-${token.slice(8, 16)}-${token.slice(16, 24)}-${token.slice(24, 32)}`;
}

function generateTemporaryPassword() {
  return `Cg!${crypto.randomBytes(10).toString('base64url')}9a`;
}

function normalizeConfig(value: unknown) {
  if (Array.isArray(value)) return { enabled: value, businessSector: 'comercio', commercialUse: 'evaluacion', qaMode:false };
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    enabled: Array.isArray(data.enabled) ? data.enabled.map(String) : [],
    businessSector: String(data.businessSector || 'comercio'),
    commercialUse: String(data.commercialUse || 'evaluacion'),
    qaMode: data.qaMode === true
  };
}

type LicenseExtension = {
  id:string;
  businessCategory:string|null;
  companyName:string|null;
  companyRif:string|null;
  maxUsers:number|null;
  maxDevices:number|null;
  activationCount:number|null;
  revokedAt:Date|null;
  subscriptionId:string|null;
  issuedForMembershipId:string|null;
};

function publicLicense(record: any, tenant?: any, extension: Partial<LicenseExtension> = {}) {
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
    qaMode: config.qaMode,
    businessSector: extension.businessCategory || config.businessSector,
    commercialUse: config.commercialUse,
    maxUsers: Number(extension.maxUsers || 1),
    maxDevices: Number(extension.maxDevices || 1),
    devicesUsed: Number(extension.activationCount || 0),
    companyName: extension.companyName || tenant?.name,
    companyRif: extension.companyRif || tenant?.rif,
    subscriptionId: extension.subscriptionId || null,
    expiresAt: new Date(record.expiresAt).toISOString(),
    status: record.status,
    lastSeenAt: record.lastSeenAt ? new Date(record.lastSeenAt).toISOString() : null,
    lastRoute: record.lastRoute || null,
    revokedAt: extension.revokedAt ? new Date(extension.revokedAt).toISOString() : null,
    createdAt: new Date(record.createdAt).toISOString()
  };
}

async function extensionByLicenseId(id:string) {
  const rows = await prisma.$queryRaw<LicenseExtension[]>`
    SELECT "id", "businessCategory", "companyName", "companyRif", "maxUsers", "maxDevices", "activationCount", "revokedAt", "subscriptionId", "issuedForMembershipId"
    FROM public."LicenseKey" WHERE "id"=${id} LIMIT 1
  `;
  return rows[0] || null;
}

async function extensionByLicenseIds(ids: string[]) {
  const entries = await Promise.all(ids.map(async (id) => [id, await extensionByLicenseId(id)] as const));
  return new Map(entries.filter(([, value]) => Boolean(value)) as Array<readonly [string, LicenseExtension]>);
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

  const roleName = `Cliente licencia ${userId.slice(0, 8)}`;
  const role = await prisma.role.upsert({
    where: { tenantId_name: { tenantId, name: roleName } },
    update: { description: 'Acceso limitado por módulos y vigencia de licencia.', system: false },
    create: { tenantId, name: roleName, description: 'Acceso limitado por módulos y vigencia de licencia.', system: false }
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

async function assertSubscriptionModules(subscriptionId:string, tenantId:string, modules:string[]) {
  const subscriptionRows = await prisma.$queryRaw<Array<{ status:string; maxUsers:number }>>`
    SELECT s."status", s."maxUsers"
    FROM public."Subscription" s
    JOIN public."SubscriptionTenant" st ON st."subscriptionId"=s."id"
    WHERE s."id"=${subscriptionId} AND st."tenantId"=${tenantId} AND st."status"='active'
    LIMIT 1
  `;
  const subscription = subscriptionRows[0];
  if (!subscription || !['trial','active','past_due'].includes(subscription.status)) {
    throw new HttpError(403, 'La suscripción no habilita esta empresa.');
  }
  const entitlements = await prisma.$queryRaw<Array<{ moduleCode:string }>>`
    SELECT "moduleCode" FROM public."ModuleEntitlement"
    WHERE "subscriptionId"=${subscriptionId} AND "status"='active'
  `;
  const allowed = new Set(entitlements.map((item) => item.moduleCode));
  const unauthorized = modules.filter((module) => !allowed.has(module));
  if (unauthorized.length) {
    throw new HttpError(403, `La suscripción no incluye: ${unauthorized.slice(0, 6).join(', ')}.`);
  }
  return subscription;
}

async function validateFromRequest(req:any, body:z.infer<typeof validateSchema>) {
  const ctx = req.context;
  if (!ctx.email) throw new HttpError(401, 'La sesión no contiene correo de usuario.');

  if (body.licenseKey) {
    await bootstrapQaLicense({
      tenantId:ctx.tenantId,
      userId:ctx.userId || null,
      userEmail:ctx.email,
      licenseKey:body.licenseKey,
      ip:req.ip,
      userAgent:req.headers['user-agent'] || null
    });
  }

  const result = await validateUserLicense({
    tenantId:ctx.tenantId,
    userId:ctx.userId || null,
    userEmail:ctx.email,
    licenseKey:body.licenseKey || null,
    deviceId:body.deviceId || null,
    deviceCredential:readDeviceCredential(req),
    deviceLabel:body.deviceLabel || null,
    route:body.route || null,
    ip:req.ip,
    userAgent:req.headers['user-agent'] || null,
    metadata:body.metadata || {}
  });
  if (result._issuedDeviceCredential) {
    setDeviceCredentialCookie(req.res, result._issuedDeviceCredential, result._issuedDeviceCredentialExpiresAt);
  }
  const { _issuedDeviceCredential, _issuedDeviceCredentialExpiresAt, ...publicResult } = result;
  return publicResult;
}

router.get('/', requirePermission('admin.manage'), asyncHandler(async (req, res) => {
  const ctx = (req as any).context;
  const [tenant, records] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { id: true, name: true, rif: true } }),
    prisma.licenseKey.findMany({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: 'desc' }, take: 500 })
  ]);
  const extensions = await extensionByLicenseIds(records.map((record) => record.id));
  ok(res, records.map((record) => publicLicense(record, tenant, extensions.get(record.id) || undefined)));
}));

router.post('/', requirePermission('admin.manage'), asyncHandler(async (req, res) => {
  const ctx = (req as any).context;
  const body = licenseSchema.parse(req.body || {});
  const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { id: true, name: true, rif: true } });
  if (!tenant) throw new HttpError(404, 'Empresa no encontrada.');

  if (body.subscriptionId) {
    const subscription = await assertSubscriptionModules(body.subscriptionId, ctx.tenantId, body.modules);
    if (body.maxUsers > Number(subscription.maxUsers || body.maxUsers)) {
      throw new HttpError(403, 'La licencia excede el límite de usuarios contratado.');
    }
  }

  const normalizedEmail = body.userEmail.trim().toLowerCase();
  const existingUser = await prisma.userProfile.findUnique({
    where: { tenantId_email: { tenantId: ctx.tenantId, email: normalizedEmail } },
    include: { userRoles: { include: { role: true } } }
  });
  if (existingUser?.userRoles.some((assignment) => assignment.role.system)) {
    throw new HttpError(409, 'No se puede reemplazar la credencial de un usuario administrativo mediante una licencia comercial.');
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  const user = existingUser
    ? await prisma.userProfile.update({
        where: { id: existingUser.id },
        data: { fullName: body.fullName, passwordHash, status: 'active' }
      })
    : await prisma.userProfile.create({
        data: { tenantId: ctx.tenantId, email: normalizedEmail, fullName: body.fullName, passwordHash, status: 'active' }
      });

  const membership = await ensureAccountMembership({
    tenantId:ctx.tenantId,
    userProfileId:user.id,
    email:user.email,
    fullName:user.fullName,
    roleLabel:({ contador:'Contador', comercio:'Operador comercial', salud:'Profesional de salud', veterinaria:'Profesional veterinario', psicologia:'Profesional de psicología', odontologia:'Profesional odontológico', gimnasio:'Operador de gimnasio', nutricion:'Profesional de nutrición' } as Record<string,string>)[body.businessSector] || 'Cliente'
  });

  await assignTrialRole(ctx.tenantId, user.id, body.modules);
  const previous = await prisma.licenseKey.findMany({ where: { tenantId: ctx.tenantId, userEmail: normalizedEmail, status: 'active' }, select: { id:true } });
  if (previous.length) {
    await prisma.licenseKey.updateMany({ where: { id: { in: previous.map((item) => item.id) } }, data: { status: 'revoked' } });
    for (const item of previous) {
      await prisma.$executeRaw`
        UPDATE public."LicenseActivation" SET "status"='revoked', "revokedAt"=now() WHERE "licenseId"=${item.id}
      `;
    }
  }

  const rawKey = generateLicenseKey(body.businessSector);
  const expiresAt = new Date(Date.now() + body.days * 86400000);
  const config = { enabled: body.modules, businessSector: body.businessSector, commercialUse: body.commercialUse };
  const record = await prisma.licenseKey.create({
    data: {
      tenantId: ctx.tenantId,
      userId: user.id,
      userEmail: normalizedEmail,
      plan: body.plan,
      keyHash: hashLicenseKey(rawKey),
      keyPreview: `${rawKey.slice(0, 14)}-••••-${rawKey.slice(-4)}`,
      modules: config as any,
      expiresAt,
      status: 'active'
    }
  });

  await prisma.$executeRaw`
    UPDATE public."LicenseKey"
    SET "businessCategory"=${body.businessSector}, "companyName"=${tenant.name}, "companyRif"=${tenant.rif},
        "maxUsers"=${body.maxUsers}, "maxDevices"=${body.maxDevices}, "activationCount"=0,
        "metadata"=${JSON.stringify({ commercialUse:body.commercialUse, notes:body.notes || '', issuedBy:ctx.userId || null })}::jsonb,
        "subscriptionId"=${body.subscriptionId || null}, "issuedForMembershipId"=${membership?.id || null}, "updatedAt"=now()
    WHERE "id"=${record.id}
  `;

  const extension = await extensionByLicenseId(record.id);
  const publicData = publicLicense(record, tenant, extension || undefined);
  await audit(req, 'license.create', record.id, publicData);

  ok(res, {
    ...publicData,
    licenseKey: rawKey,
    temporaryPassword,
    credentials: {
      tenantRif: tenant.rif,
      companyName: tenant.name,
      businessSector: body.businessSector,
      email: normalizedEmail,
      temporaryPassword,
      licenseKey: rawKey,
      expiresAt: expiresAt.toISOString(),
      modules: body.modules
    },
    warning: 'La licencia y la contraseña se muestran una sola vez. El primer dispositivo autorizado recibirá además una credencial segura del servidor.'
  }, 201);
}));

router.post('/validate', asyncHandler(async (req, res) => {
  ok(res, await validateFromRequest(req, validateSchema.parse(req.body || {})));
}));

router.post('/heartbeat', asyncHandler(async (req, res) => {
  const result = await validateFromRequest(req, validateSchema.parse(req.body || {}));
  ok(res, { accepted: true, license: result, at: new Date().toISOString() });
}));

router.patch('/:id/revoke', requirePermission('admin.manage'), asyncHandler(async (req, res) => {
  const ctx = (req as any).context;
  const record = await prisma.licenseKey.findFirst({ where: { id: req.params.id, tenantId: ctx.tenantId } });
  if (!record) throw new HttpError(404, 'Licencia no encontrada.');
  const updated = await prisma.licenseKey.update({ where: { id: record.id }, data: { status: 'revoked' } });
  await prisma.$executeRaw`UPDATE public."LicenseKey" SET "revokedAt"=now(), "updatedAt"=now() WHERE "id"=${record.id}`;
  await prisma.$executeRaw`UPDATE public."LicenseActivation" SET "status"='revoked', "revokedAt"=now() WHERE "licenseId"=${record.id}`;
  const extension = await extensionByLicenseId(record.id);
  const data = publicLicense(updated, undefined, extension || undefined);
  await audit(req, 'license.revoke', record.id, data);
  ok(res, data);
}));

router.patch('/:id/devices/:activationId/revoke', requirePermission('admin.manage'), asyncHandler(async (req,res) => {
  const ctx=(req as any).context;
  const rows=await prisma.$queryRaw<Array<{ id:string }>>`
    SELECT la."id"
    FROM public."LicenseActivation" la
    JOIN public."LicenseKey" lk ON lk."id"=la."licenseId"
    WHERE la."id"=${req.params.activationId} AND lk."id"=${req.params.id} AND lk."tenantId"=${ctx.tenantId}
    LIMIT 1
  `;
  if(!rows[0]) throw new HttpError(404,'Activación no encontrada.');
  await prisma.$executeRaw`
    UPDATE public."LicenseActivation"
    SET "status"='revoked', "revokedAt"=now(), "credentialHash"=NULL, "credentialExpiresAt"=now(), "lastSeenAt"=now()
    WHERE "id"=${req.params.activationId}
  `;
  await audit(req,'license.device.revoke',req.params.id,{activationId:req.params.activationId});
  ok(res,{id:req.params.activationId,status:'revoked'});
}));

export default router;
