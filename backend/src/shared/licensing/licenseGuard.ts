import crypto from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import { env } from '../../config/env.js';
import { HttpError } from '../http.js';
import { assertSubscriptionAccess } from '../commercial/subscriptionGuard.js';
import { bootstrapQaLicense } from './qaBootstrap.js';

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
  userId: string | null;
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

async function countActiveDevices(licenseId: string, db:Pick<typeof prisma,'$queryRaw'>=prisma) {
  const rows = await db.$queryRaw<Array<{ count:number }>>`
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
    SELECT "id", "userId", "deviceHash", "status", "credentialHash", "credentialExpiresAt"
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
  if (activation.userId && activation.userId !== params.userId) {
    throw new HttpError(403, 'La activación pertenece a otro usuario autorizado.');
  }
  if (params.deviceId && !secureEqual(activation.deviceHash, hashLicenseDevice(params.deviceId))) {
    throw new HttpError(403, 'La credencial del dispositivo no coincide con el equipo registrado.');
  }

  const refreshed = await prisma.$executeRaw`
    UPDATE public."LicenseActivation"
    SET "userId"=COALESCE("userId",${params.userId || null}),
        "deviceLabel"=COALESCE(${params.deviceLabel || null}, "deviceLabel"),
        "lastSeenAt"=now(),
        "lastIp"=${params.ip || null},
        "lastUserAgent"=${params.userAgent || null},
        "metadata"=${JSON.stringify(params.metadata || {})}::jsonb
    WHERE "id"=${activation.id}
      AND "status"='active'
      AND "credentialHash"=${credentialHash}
      AND ("userId" IS NULL OR "userId"=${params.userId || null})
      AND ("credentialExpiresAt" IS NULL OR "credentialExpiresAt">now())
  `;
  if (refreshed !== 1) {
    throw new HttpError(403, 'La credencial fue revocada o cambió de estado.');
  }
  return activation;
}

async function activateOrUpgradeDevice(params: {
  licenseId:string;
  tenantId:string;
  userId?:string|null;
  deviceId:string;
  deviceLabel?:string|null;
  ip?:string|null;
  userAgent?:string|null;
  metadata?:Record<string,unknown>;
}) {
  // Serialize enrollment per license. The old count-then-INSERT path could
  // allocate more than maxDevices under two concurrent activations.
  return prisma.$transaction(async tx => {
    const licenses = await tx.$queryRaw<Array<{
      id:string; status:string; plan:string; expiresAt:Date;
      revokedAt:Date|null; maxDevices:number|null;
    }>>`
      SELECT "id", "status", "plan", "expiresAt", "revokedAt", "maxDevices"
      FROM public."LicenseKey"
      WHERE "id"=${params.licenseId} AND "tenantId"=${params.tenantId}
      FOR UPDATE
    `;
    const license = licenses[0];
    const expiryMs = license ? new Date(license.expiresAt).getTime() : Number.NaN;
    if (!license || license.status !== 'active' || license.revokedAt
        || !Number.isFinite(expiryMs) || expiryMs <= Date.now()) {
      throw new HttpError(403, 'La licencia no está activa o ya venció.');
    }
    const maxDevices = Number(license.maxDevices ?? 1);
    if (!Number.isSafeInteger(maxDevices) || maxDevices < 1) {
      throw new HttpError(403, 'La licencia no tiene un cupo de dispositivos válido.');
    }
    const deviceHash = hashLicenseDevice(params.deviceId);
    const rows = await tx.$queryRaw<ActivationRow[]>`
      SELECT "id", "userId", "deviceHash", "status", "credentialHash", "credentialExpiresAt"
      FROM public."LicenseActivation"
      WHERE "licenseId"=${params.licenseId}
        AND "tenantId"=${params.tenantId}
        AND "deviceHash"=${deviceHash}
      LIMIT 1
    `;
    const existing = rows[0];
    if (existing?.userId && existing.userId !== params.userId) {
      throw new HttpError(403, 'La activación pertenece a otro usuario autorizado.');
    }

    // Revocation must not turn into a silent reactivation just because a
    // caller still knows the license key and can repeat its device ID.
    if (existing && existing.status !== 'active') {
      throw new HttpError(403, 'Dispositivo revocado o bloqueado. Solicita autorización para reemplazarlo.');
    }
    if (existing?.credentialHash) {
      throw new HttpError(403, 'Este dispositivo ya fue activado. Usa su credencial segura o solicita al administrador revocar/reactivar el equipo.');
    }

    if (!existing) {
      // A revoked/blocked trial activation is not an invitation to enroll a
      // different ID: replacement requires an authorized new trial grant.
      if (license.plan === 'trial') {
        const priorRevocations = await tx.$queryRaw<Array<{ id:string }>>`
          SELECT "id" FROM public."LicenseActivation"
          WHERE "licenseId"=${params.licenseId}
            AND "tenantId"=${params.tenantId}
            AND "status" IN ('revoked','blocked')
          LIMIT 1
        `;
        if (priorRevocations.length) {
          throw new HttpError(403, 'La demostración requiere una nueva autorización del propietario para cambiar de dispositivo.');
        }
      }
      const count = await countActiveDevices(params.licenseId,tx);
      if (count >= maxDevices) {
        throw new HttpError(403, `La licencia alcanzó el máximo de ${maxDevices} dispositivo(s).`);
      }
    }

    const credential = createDeviceCredential();
    const credentialHash = hashDeviceCredential(credential);
    const credentialExpiresAt = new Date(Math.min(
      expiryMs,
      Date.now() + DEVICE_CREDENTIAL_TTL_MS
    ));
    const preview = `${credential.slice(0, 10)}…${credential.slice(-6)}`;

    if (existing) {
      // Only a legacy active activation without a credential is upgraded.
      const upgraded = await tx.$executeRaw`
        UPDATE public."LicenseActivation"
        SET "userId"=${params.userId || null},
            "deviceLabel"=COALESCE(${params.deviceLabel || null}, "deviceLabel"),
            "lastSeenAt"=now(), "lastIp"=${params.ip || null},
            "lastUserAgent"=${params.userAgent || null},
            "metadata"=${JSON.stringify(params.metadata || {})}::jsonb,
            "credentialHash"=${credentialHash}, "credentialPreview"=${preview},
            "credentialVersion"=1, "credentialIssuedAt"=now(),
            "credentialExpiresAt"=${credentialExpiresAt}
        WHERE "id"=${existing.id} AND "status"='active' AND "credentialHash" IS NULL
      `;
      if (upgraded !== 1) {
        throw new HttpError(409, 'La activación cambió de estado. Vuelve a solicitar autorización.');
      }
    } else {
      await tx.$executeRaw`
        INSERT INTO public."LicenseActivation"
          ("id", "tenantId", "licenseId", "userId", "deviceHash", "deviceLabel", "status", "firstSeenAt", "lastSeenAt",
           "lastIp", "lastUserAgent", "metadata", "credentialHash", "credentialPreview", "credentialVersion", "credentialIssuedAt", "credentialExpiresAt")
        VALUES
          (${crypto.randomUUID()}, ${params.tenantId}, ${params.licenseId},
           ${params.userId || null}, ${deviceHash}, ${params.deviceLabel || null},
           'active', now(), now(), ${params.ip || null}, ${params.userAgent || null},
           ${JSON.stringify(params.metadata || {})}::jsonb,
           ${credentialHash}, ${preview}, 1, now(), ${credentialExpiresAt})
      `;
    }
    return { credential, credentialExpiresAt };
  });
}

export async function validateUserLicense(input: LicenseValidationInput) {
  const suppliedKeyHash = input.licenseKey ? hashLicenseKey(input.licenseKey) : null;
  const where = {
    tenantId: input.tenantId,
    userEmail: input.userEmail,
    status: 'active',
    ...(suppliedKeyHash ? { keyHash: suppliedKeyHash } : {})
  } as const;
  let record = await prisma.licenseKey.findFirst({ where, orderBy: { createdAt: 'desc' } });

  if (!record && input.licenseKey) {
    const bootstrapped = await bootstrapQaLicense({
      tenantId: input.tenantId,
      userId: input.userId,
      userEmail: input.userEmail,
      licenseKey: input.licenseKey,
      ip: input.ip,
      userAgent: input.userAgent
    });
    if (bootstrapped) record = await prisma.licenseKey.findFirst({ where, orderBy: { createdAt: 'desc' } });
  }

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
    qaMode: modulesData.qaMode === true,
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
