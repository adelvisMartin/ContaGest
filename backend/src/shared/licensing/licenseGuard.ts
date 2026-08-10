import crypto from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import { env } from '../../config/env.js';
import { HttpError } from '../http.js';
import { assertSubscriptionAccess } from '../commercial/subscriptionGuard.js';

const DEVICE_CREDENTIAL_TTL_MS = 180 * 24 * 60 * 60 * 1000;

export type LicenseValidationInput = {
  tenantId: string;
  userId?: string | null;
  userEmail: string;
  licenseKey?: string | null;
  deviceId?: string | null;
  deviceCredential?: string | null;
  deviceLabel?: string | null;
  route?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
};

type LicenseExtension = {
  businessCategory: string | null;
  companyName: string | null;
  companyRif: string | null;
  maxUsers: number | null;
  maxDevices: number | null;
  activationCount: number | null;
  revokedAt: Date | null;
  subscriptionId: string | null;
};

type ActivationRow = {
  id: string;
  deviceHash: string;
  status: string;
  credentialHash: string | null;
  credentialExpiresAt: Date | null;
};

export const hashLicenseKey = (value: string) =>
  crypto.createHmac('sha256', env.LICENSE_HASH_SECRET).update(value.trim().toUpperCase()).digest('hex');

export const hashLicenseDevice = (value: string) =>
  crypto.createHmac('sha256', env.LICENSE_HASH_SECRET).update(`device:${value.trim()}`).digest('hex');

export const hashDeviceCredential = (value: string) =>
  crypto.createHmac('sha256', env.LICENSE_HASH_SECRET).update(`device-credential:${value.trim()}`).digest('hex');

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createDeviceCredential() {
  return `cgdc_${crypto.randomBytes(42).toString('base64url')}`;
}

async function loadExtension(licenseId: string, tenantId: string) {
  const rows = await prisma.$queryRaw<LicenseExtension[]>`
    SELECT "businessCategory", "companyName", "companyRif", "maxUsers", "maxDevices", "activationCount", "revokedAt", "subscriptionId"
    FROM public."LicenseKey"
    WHERE "id" = ${licenseId} AND "tenantId" = ${tenantId}
    LIMIT 1
  `;
  return rows[0] || {} as LicenseExtension;
}

async function countActiveDevices(licenseId: string) {
  const rows = await prisma.$queryRaw<Array<{ count:number }>>`
    SELECT count(*)::int AS count
    FROM public."LicenseActivation"
    WHERE "licenseId" = ${licenseId} AND "status" = 'active'
  `;
  return Number(rows[0]?.count || 0);
}

async function updateLicenseTelemetry(licenseId: string, activationCount: number, ip?: string | null, userAgent?: string | null) {
  await prisma.$executeRaw`
    UPDATE public."LicenseKey"
    SET "activationCount" = ${activationCount},
        "lastIp" = ${ip || null},
        "lastUserAgent" = ${userAgent || null},
        "updatedAt" = now()
    WHERE "id" = ${licenseId}
  `;
}

async function validateExistingCredential(params: {
  licenseId:string;
  tenantId:string;
  userId?:string|null;
  credential:string;
  deviceId?:string|null;
  deviceLabel?:string|null;
  ip?:string|null;
  userAgent?:string|null;
  metadata?:Record<string,unknown>;
}) {
  const credentialHash = hashDeviceCredential(params.credential);
  const rows = await prisma.$queryRaw<ActivationRow[]>`
    SELECT "id", "deviceHash", "status", "credentialHash", "credentialExpiresAt"
    FROM public."LicenseActivation"
    WHERE "licenseId" = ${params.licenseId}
      AND "tenantId" = ${params.tenantId}
      AND "credentialHash" = ${credentialHash}
      AND "status" = 'active'
    LIMIT 1
  `;
  const activation = rows[0];
  if (!activation || !activation.credentialHash || !secureEqual(activation.credentialHash, credentialHash)) {
    throw new HttpError(403, 'La credencial de este dispositivo no es válida. Solicita una reactivación.');
  }
  if (activation.credentialExpiresAt && new Date(activation.credentialExpiresAt).getTime() <= Date.now()) {
    await prisma.$executeRaw`
      UPDATE public."LicenseActivation"
      SET "status"='blocked', "revokedAt"=now(), "lastSeenAt"=now()
      WHERE "id"=${activation.id}
    `;
    throw new HttpError(403, 'La credencial del dispositivo venció. Solicita una reactivación.');
  }
  if (params.deviceId && !secureEqual(activation.deviceHash, hashLicenseDevice(params.deviceId))) {
    throw new HttpError(403, 'La credencial del dispositivo no coincide con el equipo registrado.');
  }

  await prisma.$executeRaw`
    UPDATE public."LicenseActivation"
    SET "userId"=${params.userId || null},
        "deviceLabel"=COALESCE(${params.deviceLabel || null}, "deviceLabel"),
        "lastSeenAt"=now(),
        "lastIp"=${params.ip || null},
        "lastUserAgent"=${params.userAgent || null},
        "metadata"=${JSON.stringify(params.metadata || {})}::jsonb
    WHERE "id"=${activation.id}
  `;
  return activation;
}

async function activateOrUpgradeDevice(params: {
  licenseId:string;
  tenantId:string;
  userId?:string|null;
  deviceId:string;
  maxDevices:number;
  licenseExpiresAt:Date;
  deviceLabel?:string|null;
  ip?:string|null;
  userAgent?:string|null;
  metadata?:Record<string,unknown>;
}) {
  const deviceHash = hashLicenseDevice(params.deviceId);
  const rows = await prisma.$queryRaw<ActivationRow[]>`
    SELECT "id", "deviceHash", "status", "credentialHash", "credentialExpiresAt"
    FROM public."LicenseActivation"
    WHERE "licenseId"=${params.licenseId} AND "deviceHash"=${deviceHash}
    LIMIT 1
  `;
  const existing = rows[0];

  if (existing?.credentialHash && existing.status === 'active') {
    throw new HttpError(403, 'Este dispositivo ya fue activado. Usa su credencial segura o solicita al administrador revocar/reactivar el equipo.');
  }

  if (!existing) {
    const count = await countActiveDevices(params.licenseId);
    if (count >= params.maxDevices) {
      throw new HttpError(403, `La licencia alcanzó el máximo de ${params.maxDevices} dispositivo(s).`);
    }
  }

  const credential = createDeviceCredential();
  const credentialHash = hashDeviceCredential(credential);
  const credentialExpiresAt = new Date(Math.min(
    params.licenseExpiresAt.getTime(),
    Date.now() + DEVICE_CREDENTIAL_TTL_MS
  ));
  const preview = `${credential.slice(0, 10)}…${credential.slice(-6)}`;

  if (existing) {
    await prisma.$executeRaw`
      UPDATE public."LicenseActivation"
      SET "userId"=${params.userId || null}, "deviceLabel"=COALESCE(${params.deviceLabel || null}, "deviceLabel"),
          "status"='active', "lastSeenAt"=now(), "lastIp"=${params.ip || null}, "lastUserAgent"=${params.userAgent || null},
          "metadata"=${JSON.stringify(params.metadata || {})}::jsonb,
          "credentialHash"=${credentialHash}, "credentialPreview"=${preview}, "credentialVersion"=1,
          "credentialIssuedAt"=now(), "credentialExpiresAt"=${credentialExpiresAt}, "revokedAt"=NULL
      WHERE "id"=${existing.id}
    `;
  } else {
    await prisma.$executeRaw`
      INSERT INTO public."LicenseActivation"
        ("id", "tenantId", "licenseId", "userId", "deviceHash", "deviceLabel", "status", "firstSeenAt", "lastSeenAt",
         "lastIp", "lastUserAgent", "metadata", "credentialHash", "credentialPreview", "credentialVersion", "credentialIssuedAt", "credentialExpiresAt")
      VALUES
        (${crypto.randomUUID()}, ${params.tenantId}, ${params.licenseId}, ${params.userId || null}, ${deviceHash}, ${params.deviceLabel || null},
         'active', now(), now(), ${params.ip || null}, ${params.userAgent || null}, ${JSON.stringify(params.metadata || {})}::jsonb,
         ${credentialHash}, ${preview}, 1, now(), ${credentialExpiresAt})
    `;
  }

  return { credential, credentialExpiresAt };
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

  const extension = await loadExtension(record.id, input.tenantId);
  await assertSubscriptionAccess(extension.subscriptionId, input.tenantId);
  const tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { id:true, name:true, rif:true } });
  if (!tenant) throw new HttpError(403, 'Empresa de la licencia no encontrada.');
  if (extension.companyRif && extension.companyRif.trim().toUpperCase() !== tenant.rif.trim().toUpperCase()) {
    throw new HttpError(403, 'La licencia está vinculada a otra empresa.');
  }

  let issuedCredential: string | null = null;
  let issuedCredentialExpiresAt: Date | null = null;

  if (input.deviceCredential) {
    await validateExistingCredential({
      licenseId:record.id,
      tenantId:input.tenantId,
      userId:input.userId,
      credential:input.deviceCredential,
      deviceId:input.deviceId,
      deviceLabel:input.deviceLabel,
      ip:input.ip,
      userAgent:input.userAgent,
      metadata:input.metadata
    });
  } else {
    if (!input.licenseKey || !input.deviceId) {
      throw new HttpError(403, 'Este equipo necesita una activación inicial con licencia y dispositivo.');
    }
    if (!secureEqual(record.keyHash, hashLicenseKey(input.licenseKey))) {
      throw new HttpError(403, 'La licencia no pertenece a esta empresa o usuario.');
    }
    const activation = await activateOrUpgradeDevice({
      licenseId:record.id,
      tenantId:input.tenantId,
      userId:input.userId,
      deviceId:input.deviceId,
      maxDevices:Number(extension.maxDevices || 1),
      licenseExpiresAt:record.expiresAt,
      deviceLabel:input.deviceLabel,
      ip:input.ip,
      userAgent:input.userAgent,
      metadata:input.metadata
    });
    issuedCredential = activation.credential;
    issuedCredentialExpiresAt = activation.credentialExpiresAt;
  }

  const activationCount = await countActiveDevices(record.id);
  const updated = await prisma.licenseKey.update({
    where: { id: record.id },
    data: { lastSeenAt: new Date(), lastRoute: input.route || record.lastRoute }
  });
  await updateLicenseTelemetry(record.id, activationCount, input.ip, input.userAgent);

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
    subscriptionId: extension.subscriptionId || null,
    expiresAt: updated.expiresAt.toISOString(),
    status: updated.status,
    lastSeenAt: updated.lastSeenAt?.toISOString() || null,
    lastRoute: updated.lastRoute || null,
    _issuedDeviceCredential: issuedCredential,
    _issuedDeviceCredentialExpiresAt: issuedCredentialExpiresAt?.toISOString() || null
  };
}
