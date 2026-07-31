import crypto from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import { env } from '../../config/env.js';
import { HttpError } from '../http.js';

export type LicenseValidationInput = {
  tenantId: string;
  userId?: string | null;
  userEmail: string;
  licenseKey: string;
  deviceId: string;
  deviceLabel?: string | null;
  route?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
};

export const hashLicenseKey = (value: string) =>
  crypto.createHmac('sha256', env.JWT_SECRET).update(value.trim().toUpperCase()).digest('hex');

export const hashLicenseDevice = (value: string) =>
  crypto.createHmac('sha256', env.JWT_SECRET).update(value.trim()).digest('hex');

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function validateUserLicense(input: LicenseValidationInput) {
  const record = await prisma.licenseKey.findFirst({
    where: { tenantId: input.tenantId, userEmail: input.userEmail, status: 'active' },
    orderBy: { createdAt: 'desc' }
  });
  if (!record) throw new HttpError(403, 'No existe una licencia activa para este usuario y empresa.');
  if (record.expiresAt.getTime() <= Date.now()) {
    await prisma.licenseKey.update({ where: { id: record.id }, data: { status: 'expired' } });
    throw new HttpError(403, 'La licencia está vencida. Solicita una renovación.');
  }
  if (!secureEqual(record.keyHash, hashLicenseKey(input.licenseKey))) {
    throw new HttpError(403, 'La licencia no pertenece a esta empresa o usuario.');
  }

  const extensionRows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT "businessCategory", "companyName", "companyRif", "maxUsers", "maxDevices", "activationCount", "revokedAt"
    FROM public."LicenseKey" WHERE "id" = $1 AND "tenantId" = $2 LIMIT 1
  `, record.id, input.tenantId);
  const extension = extensionRows[0] || {};
  const tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { id:true, name:true, rif:true } });
  if (!tenant) throw new HttpError(403, 'Empresa de la licencia no encontrada.');
  if (extension.companyRif && extension.companyRif.trim().toUpperCase() !== tenant.rif.trim().toUpperCase()) {
    throw new HttpError(403, 'La licencia está vinculada a otra empresa.');
  }

  const deviceHash = hashLicenseDevice(input.deviceId);
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
  `,
    input.tenantId,
    record.id,
    input.userId || null,
    deviceHash,
    input.deviceLabel || null,
    input.ip || null,
    input.userAgent || null,
    JSON.stringify(input.metadata || {})
  );

  const countRows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT count(*)::int AS count FROM public."LicenseActivation" WHERE "licenseId" = $1 AND "status" = 'active'
  `, record.id);
  const activationCount = Number(countRows[0]?.count || 0);
  const updated = await prisma.licenseKey.update({
    where: { id: record.id },
    data: { lastSeenAt: new Date(), lastRoute: input.route || record.lastRoute }
  });
  await prisma.$executeRawUnsafe(`
    UPDATE public."LicenseKey" SET "activationCount" = $2, "lastIp" = $3, "lastUserAgent" = $4, "updatedAt" = now() WHERE "id" = $1
  `, record.id, activationCount, input.ip || null, input.userAgent || null);

  const modulesData = updated.modules && typeof updated.modules === 'object' && !Array.isArray(updated.modules)
    ? updated.modules as Record<string, unknown>
    : { enabled: Array.isArray(updated.modules) ? updated.modules : [] };

  return {
    id: updated.id,
    tenantId: updated.tenantId,
    userEmail: updated.userEmail,
    plan: updated.plan,
    modules: Array.isArray(modulesData.enabled) ? modulesData.enabled.map(String) : [],
    businessSector: String(extension.businessCategory || modulesData.businessSector || 'general'),
    commercialUse: String(modulesData.commercialUse || 'evaluacion'),
    maxUsers: Number(extension.maxUsers || 1),
    maxDevices: Number(extension.maxDevices || 1),
    devicesUsed: activationCount,
    companyName: extension.companyName || tenant.name,
    companyRif: extension.companyRif || tenant.rif,
    expiresAt: updated.expiresAt.toISOString(),
    status: updated.status,
    lastSeenAt: updated.lastSeenAt?.toISOString() || null,
    lastRoute: updated.lastRoute || null
  };
}
