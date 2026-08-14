import crypto from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import { env } from '../../config/env.js';
import { HttpError } from '../http.js';

const QA_BOOTSTRAP_SHA256 = '76ea41b2358934dffe36b089ead0e56cc5873b73e6c8100b0e040fd7389da2ba';
const QA_DURATION_DAYS = 180;

export const QA_ALL_MODULES = Object.freeze([
  'dashboard','cotizacion','clientes','ventas','inventario','tributos','normativa','historial','reportes',
  'contabilidad','libro-mayor','balance-sumas-saldos','hoja-trabajo','estados-financieros','cierre-contable',
  'bancos','nomina','proveedores','compras','auditoria','configuracion','ayuda','tasks','profile','mobile',
  'libro-ventas','marca','admin','backend','vistas','plan-cuentas','rrhh','analytics','qr','inventario-scan',
  'pedidos','pos-sede','tracking-pedidos','delivery-mapa','asistente-ia','soporte','demo-control',
  'modulos-madurez','reglas-negocio','licencias','importacion-data','kardex','normativa-contable','pretesting',
  'salud','veterinaria','psicologia','gimnasio','rutinas','nutricion','mensajes'
]);

const QA_PERMISSION_KEYS = Object.freeze([
  'reports.view','sales.manage','sales.view','clients.manage','inventory.manage','purchases.manage',
  'banking.manage','payroll.manage','taxes.export','health.manage','gym.manage','communications.manage',
  'audit.view','modules.manage','config.manage','users.manage','roles.manage','integrations.manage','admin.manage'
]);

function digest(value: string) {
  return crypto.createHash('sha256').update(value.trim().toUpperCase()).digest('hex');
}

function licenseKeyHash(value: string) {
  return crypto.createHmac('sha256', env.LICENSE_HASH_SECRET).update(value.trim().toUpperCase()).digest('hex');
}

function secureHexEqual(left: string, right: string) {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function isQaBootstrapKey(value?: string | null) {
  if (!value) return false;
  return secureHexEqual(digest(value), QA_BOOTSTRAP_SHA256);
}

async function assignQaRole(tenantId: string, userId: string) {
  for (const key of QA_PERMISSION_KEYS) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, description: `Permiso ${key}` }
    });
  }

  const role = await prisma.role.upsert({
    where: { tenantId_name: { tenantId, name: 'QA integral' } },
    update: {
      description: 'Acceso integral de QA, auditable y limitado por una licencia de evaluación.',
      system: false
    },
    create: {
      tenantId,
      name: 'QA integral',
      description: 'Acceso integral de QA, auditable y limitado por una licencia de evaluación.',
      system: false
    }
  });

  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  const permissions = await prisma.permission.findMany({
    where: { key: { in: [...QA_PERMISSION_KEYS] } },
    select: { id: true }
  });
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

export async function bootstrapQaLicense(input: {
  tenantId: string;
  userId?: string | null;
  userEmail?: string | null;
  licenseKey?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  if (!isQaBootstrapKey(input.licenseKey)) return false;
  if (!input.userId || !input.userEmail) throw new HttpError(401, 'La licencia QA requiere una sesión autenticada.');

  const tenant = await prisma.tenant.findUnique({
    where: { id: input.tenantId },
    select: { id: true, name: true, rif: true }
  });
  if (!tenant) throw new HttpError(404, 'Empresa no encontrada.');

  const normalizedEmail = input.userEmail.trim().toLowerCase();
  const keyHash = licenseKeyHash(input.licenseKey!);
  const existingByKey = await prisma.licenseKey.findFirst({ where: { keyHash } });
  if (existingByKey && (existingByKey.tenantId !== input.tenantId || existingByKey.userId !== input.userId)) {
    throw new HttpError(409, 'Esta licencia QA ya fue vinculada a otra sesión de prueba.');
  }

  await assignQaRole(input.tenantId, input.userId);
  const expiresAt = new Date(Date.now() + QA_DURATION_DAYS * 86400000);
  const modules = {
    enabled: [...QA_ALL_MODULES],
    businessSector: 'otro',
    commercialUse: 'evaluacion',
    qaMode: true
  };

  const record = existingByKey
    ? await prisma.licenseKey.update({
        where: { id: existingByKey.id },
        data: {
          userId: input.userId,
          userEmail: normalizedEmail,
          plan: 'enterprise',
          modules: modules as any,
          expiresAt,
          status: 'active'
        }
      })
    : await prisma.licenseKey.create({
        data: {
          tenantId: input.tenantId,
          userId: input.userId,
          userEmail: normalizedEmail,
          plan: 'enterprise',
          keyHash,
          keyPreview: `${input.licenseKey!.slice(0, 12)}…${input.licenseKey!.slice(-6)}`,
          modules: modules as any,
          expiresAt,
          status: 'active'
        }
      });

  await prisma.$executeRaw`
    UPDATE public."LicenseKey"
    SET "businessCategory"='otro', "companyName"=${tenant.name}, "companyRif"=${tenant.rif},
        "maxUsers"=1, "maxDevices"=6, "revokedAt"=NULL,
        "metadata"=${JSON.stringify({ qaMode:true, bootstrap:'v11.23', purpose:'integral-module-testing' })}::jsonb,
        "subscriptionId"=NULL, "updatedAt"=now()
    WHERE "id"=${record.id}
  `;

  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      action: existingByKey ? 'license.qa.refresh' : 'license.qa.activate',
      entity: 'LicenseKey',
      entityId: record.id,
      after: {
        qaMode: true,
        modules: QA_ALL_MODULES,
        expiresAt: expiresAt.toISOString(),
        maxDevices: 6
      } as any,
      ipAddress: input.ip || null,
      userAgent: input.userAgent || null
    }
  });

  return true;
}
