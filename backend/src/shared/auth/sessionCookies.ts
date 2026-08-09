import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { prisma } from '../../database/prisma.js';
import { env, isProd } from '../../config/env.js';
import { signAccessToken, tokenExpiresAt } from './jwt.js';
import { HttpError } from '../http.js';

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEVICE_COOKIE_FALLBACK_MS = 180 * 24 * 60 * 60 * 1000;

export const COOKIE_NAMES = {
  access: isProd ? '__Host-cg_access' : 'cg_access',
  refresh: isProd ? '__Host-cg_refresh' : 'cg_refresh',
  csrf: isProd ? '__Host-cg_csrf' : 'cg_csrf',
  device: isProd ? '__Host-cg_device' : 'cg_device'
} as const;

type SessionRow = {
  id: string;
  userId: string;
  tenantId: string;
  refreshHash: string;
  csrfHash: string;
  status: string;
  rotationCounter: number;
  expiresAt: Date;
};

function parseCookies(req: Request) {
  const source = String(req.headers.cookie || '');
  const result: Record<string, string> = {};
  for (const part of source.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try { result[key] = decodeURIComponent(value); }
    catch { result[key] = value; }
  }
  return result;
}

function opaqueToken(prefix: string, bytes = 32) {
  return `${prefix}_${crypto.randomBytes(bytes).toString('base64url')}`;
}

function hashOpaque(purpose: string, value: string) {
  return crypto.createHmac('sha256', env.JWT_SECRET).update(`${purpose}:${value}`).digest('hex');
}

function secureHexEqual(left:string,right:string) {
  const a=Buffer.from(left,'hex');
  const b=Buffer.from(right,'hex');
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}

function secureTextEqual(left:string,right:string) {
  const a=Buffer.from(left);
  const b=Buffer.from(right);
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}

function baseCookieOptions(httpOnly: boolean) {
  return {
    httpOnly,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/'
  };
}

function setSessionCookies(res: Response, accessToken: string, refreshToken: string, csrfToken: string, refreshExpiresAt: Date) {
  res.cookie(COOKIE_NAMES.access, accessToken, {
    ...baseCookieOptions(true),
    expires: new Date(tokenExpiresAt(accessToken))
  });
  res.cookie(COOKIE_NAMES.refresh, refreshToken, {
    ...baseCookieOptions(true),
    expires: refreshExpiresAt
  });
  res.cookie(COOKIE_NAMES.csrf, csrfToken, {
    ...baseCookieOptions(false),
    expires: refreshExpiresAt
  });
}

export function clearSessionCookies(res: Response) {
  for (const name of [COOKIE_NAMES.access, COOKIE_NAMES.refresh, COOKIE_NAMES.csrf]) {
    res.clearCookie(name, { ...baseCookieOptions(name !== COOKIE_NAMES.csrf) });
  }
}

export function clearDeviceCredentialCookie(res: Response) {
  res.clearCookie(COOKIE_NAMES.device, { ...baseCookieOptions(true), sameSite:'strict' as const });
}

export function readCookie(req: Request, name: string) {
  return parseCookies(req)[name] || null;
}

export function readAccessToken(req: Request) {
  const cookieToken = readCookie(req, COOKIE_NAMES.access);
  if (cookieToken) return { token:cookieToken, mode:'cookie' as const };
  const header = String(req.header('authorization') || '');
  const [kind, token] = header.trim().split(/\s+/, 2);
  if (kind?.toLowerCase() === 'bearer' && token) return { token, mode:'bearer' as const };
  return null;
}

export function readCsrfToken(req: Request) {
  return readCookie(req, COOKIE_NAMES.csrf);
}

export function readDeviceCredential(req: Request) {
  return readCookie(req, COOKIE_NAMES.device);
}

export function setDeviceCredentialCookie(res: Response, credential: string, expiresAt?: Date | string | null) {
  const parsed = expiresAt ? new Date(expiresAt) : new Date(Date.now() + DEVICE_COOKIE_FALLBACK_MS);
  const expiry = Number.isFinite(parsed.getTime()) ? parsed : new Date(Date.now() + DEVICE_COOKIE_FALLBACK_MS);
  res.cookie(COOKIE_NAMES.device, credential, {
    ...baseCookieOptions(true),
    sameSite:'strict',
    expires:expiry
  });
}

export async function issueBrowserSession(req: Request, res: Response, user: { id:string; email:string }, tenantId: string, metadata: Record<string, unknown> = {}) {
  const id = crypto.randomUUID();
  const refreshToken = opaqueToken('cgr', 36);
  const csrfToken = opaqueToken('cgc', 24);
  const refreshHash = hashOpaque('refresh', refreshToken);
  const csrfHash = hashOpaque('csrf', csrfToken);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);

  await prisma.$executeRaw`
    INSERT INTO public."UserSession"
      ("id","userId","tenantId","refreshHash","csrfHash","status","rotationCounter","expiresAt","lastSeenAt","lastIp","lastUserAgent","metadata","createdAt","updatedAt")
    VALUES
      (${id},${user.id},${tenantId},${refreshHash},${csrfHash},'active',0,${refreshExpiresAt},now(),${req.ip || null},${req.headers['user-agent'] || null},${JSON.stringify(metadata)}::jsonb,now(),now())
  `;

  const accessToken = signAccessToken(user, tenantId, id);
  setSessionCookies(res, accessToken, refreshToken, csrfToken, refreshExpiresAt);
  return {
    sessionMode:'cookie',
    tenantId,
    expiresAt:tokenExpiresAt(accessToken),
    sessionExpiresAt:refreshExpiresAt.toISOString()
  };
}

export async function rotateBrowserSession(req: Request, res: Response) {
  const refreshToken = readCookie(req, COOKIE_NAMES.refresh);
  const csrfCookie = readCookie(req, COOKIE_NAMES.csrf);
  const csrfHeader = String(req.header('x-csrf-token') || '');
  if (!refreshToken) throw new HttpError(401, 'Sesión de renovación no disponible.');
  if (!csrfCookie || !csrfHeader || !secureTextEqual(csrfCookie, csrfHeader)) {
    throw new HttpError(403, 'Validación CSRF requerida para renovar la sesión.');
  }
  const refreshHash = hashOpaque('refresh', refreshToken);
  const csrfHash = hashOpaque('csrf', csrfCookie);
  const rows = await prisma.$queryRaw<SessionRow[]>`
    SELECT "id","userId","tenantId","refreshHash","csrfHash","status","rotationCounter","expiresAt"
    FROM public."UserSession"
    WHERE "refreshHash" = ${refreshHash} AND "status" = 'active'
    LIMIT 1
  `;
  const session = rows[0];
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
    if (session?.id) {
      await prisma.$executeRaw`UPDATE public."UserSession" SET "status"='expired', "updatedAt"=now() WHERE "id"=${session.id}`;
    }
    clearSessionCookies(res);
    throw new HttpError(401, 'La sesión de renovación venció. Inicia sesión nuevamente.');
  }
  if (!secureHexEqual(session.csrfHash, csrfHash)) {
    throw new HttpError(403, 'El token CSRF no pertenece a esta sesión.');
  }

  const user = await prisma.userProfile.findFirst({
    where:{ id:session.userId, tenantId:session.tenantId, status:'active' },
    select:{ id:true, email:true, accessExpiresAt:true }
  });
  if (!user) {
    await prisma.$executeRaw`UPDATE public."UserSession" SET "status"='revoked', "revokedAt"=now(), "updatedAt"=now() WHERE "id"=${session.id}`;
    clearSessionCookies(res);
    throw new HttpError(401, 'La cuenta de la sesión ya no está activa.');
  }
  if (user.accessExpiresAt && user.accessExpiresAt.getTime() <= Date.now()) {
    await prisma.$executeRaw`UPDATE public."UserSession" SET "status"='revoked', "revokedAt"=now(), "updatedAt"=now() WHERE "id"=${session.id}`;
    clearSessionCookies(res);
    throw new HttpError(403, 'El acceso temporal venció.');
  }

  const nextRefreshToken = opaqueToken('cgr', 36);
  const nextCsrfToken = opaqueToken('cgc', 24);
  const nextRefreshHash = hashOpaque('refresh', nextRefreshToken);
  const nextCsrfHash = hashOpaque('csrf', nextCsrfToken);
  const nextExpiry = new Date(Date.now() + REFRESH_TTL_MS);

  const changed=await prisma.$executeRaw`
    UPDATE public."UserSession"
    SET "refreshHash"=${nextRefreshHash}, "csrfHash"=${nextCsrfHash},
        "rotationCounter"="rotationCounter"+1, "expiresAt"=${nextExpiry},
        "lastSeenAt"=now(), "lastIp"=${req.ip || null}, "lastUserAgent"=${req.headers['user-agent'] || null}, "updatedAt"=now()
    WHERE "id"=${session.id} AND "refreshHash"=${refreshHash} AND "csrfHash"=${csrfHash} AND "status"='active'
  `;
  if(Number(changed)!==1){
    await prisma.$executeRaw`UPDATE public."UserSession" SET "status"='revoked',"revokedAt"=now(),"updatedAt"=now() WHERE "id"=${session.id}`;
    clearSessionCookies(res);
    throw new HttpError(401,'Se detectó una renovación reutilizada o concurrente. Inicia sesión nuevamente.');
  }

  const accessToken = signAccessToken(user, session.tenantId, session.id);
  setSessionCookies(res, accessToken, nextRefreshToken, nextCsrfToken, nextExpiry);
  return {
    sessionId:session.id,
    userId:user.id,
    tenantId:session.tenantId,
    expiresAt:tokenExpiresAt(accessToken),
    sessionExpiresAt:nextExpiry.toISOString()
  };
}

export async function revokeBrowserSession(req: Request, res: Response) {
  const refreshToken = readCookie(req, COOKIE_NAMES.refresh);
  if (refreshToken) {
    const refreshHash = hashOpaque('refresh', refreshToken);
    await prisma.$executeRaw`
      UPDATE public."UserSession"
      SET "status"='revoked', "revokedAt"=now(), "updatedAt"=now()
      WHERE "refreshHash"=${refreshHash} AND "status"='active'
    `;
  }
  clearSessionCookies(res);
}

export async function validateCsrfAgainstSession(sessionId: string | undefined, token: string | null) {
  if (!sessionId || !token) return false;
  const hash = hashOpaque('csrf', token);
  const rows = await prisma.$queryRaw<Array<{ csrfHash:string; status:string; expiresAt:Date }>>`
    SELECT "csrfHash","status","expiresAt" FROM public."UserSession" WHERE "id"=${sessionId} LIMIT 1
  `;
  const row = rows[0];
  if (!row || row.status !== 'active' || new Date(row.expiresAt).getTime() <= Date.now()) return false;
  return secureHexEqual(row.csrfHash, hash);
}
