import type { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { env, isProd } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import { verifyAccessToken } from '../auth/jwt.js';
import { HttpError } from '../http.js';

const DEV_TENANT_ID_HEADER = 'x-tenant-id';
const DEV_USER_ID_HEADER = 'x-user-id';

type RequestContext = {
  tenantId?: string;
  userId?: string;
  authUserId?: string;
  email?: string;
  ip?: string;
  userAgent?: string | string[];
  authMode: 'backend-jwt' | 'supabase' | 'development' | 'anonymous';
};

type AuthIdentityContext = Pick<RequestContext, 'authMode'> & Omit<Partial<RequestContext>, 'authMode'>;

function getBearerToken(req: Request) {
  const header = req.header('authorization') || '';
  const [type, token] = header.trim().split(/\s+/, 2);
  return type?.toLowerCase() === 'bearer' && token ? token : null;
}

async function resolveBackendJwtContext(token: string): Promise<AuthIdentityContext> {
  const decoded = verifyAccessToken(token);
  const profile = await prisma.userProfile.findFirst({
    where: { id: decoded.sub, tenantId: decoded.tenantId, status: 'active' },
    select: { id: true, tenantId: true, email: true }
  });
  if (!profile) throw new HttpError(403, 'Usuario JWT sin perfil activo.');
  return {
    authMode: 'backend-jwt',
    userId: profile.id,
    tenantId: profile.tenantId,
    email: profile.email
  };
}

async function resolveSupabaseContext(token: string): Promise<AuthIdentityContext | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  const profile = await prisma.userProfile.findFirst({
    where: { authUserId: data.user.id, status: 'active' },
    select: { id: true, tenantId: true, email: true }
  });
  if (!profile) throw new HttpError(403, 'Usuario Supabase autenticado sin perfil activo en ContaGest-VE.');

  return {
    authMode: 'supabase',
    authUserId: data.user.id,
    userId: profile.id,
    tenantId: profile.tenantId,
    email: profile.email || data.user.email || undefined
  };
}

async function resolveSignedContext(token: string): Promise<AuthIdentityContext> {
  try {
    return await resolveBackendJwtContext(token);
  } catch (backendError) {
    const supabaseContext = await resolveSupabaseContext(token);
    if (supabaseContext) return supabaseContext;
    if (backendError instanceof HttpError && backendError.status === 403) throw backendError;
    throw new HttpError(401, 'Sesión inválida, expirada o firmada por un emisor no autorizado.');
  }
}

export async function requestContext(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = getBearerToken(req);
    if (token) {
      const secureContext = await resolveSignedContext(token);
      (req as any).context = {
        ...secureContext,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      } satisfies RequestContext;
      return next();
    }

    const allowDevelopmentHeader = !isProd && env.ALLOW_DEV_TENANT_HEADER === 'true';
    const tenantId = allowDevelopmentHeader
      ? req.header(DEV_TENANT_ID_HEADER) || req.query.tenantId?.toString()
      : undefined;
    const userId = allowDevelopmentHeader
      ? req.header(DEV_USER_ID_HEADER) || req.query.userId?.toString()
      : undefined;

    if (isProd && (req.header(DEV_TENANT_ID_HEADER) || req.header(DEV_USER_ID_HEADER))) {
      throw new HttpError(401, 'Los encabezados de tenant y usuario están prohibidos en producción. Usa Authorization: Bearer <JWT>.');
    }

    (req as any).context = {
      tenantId,
      userId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      authMode: tenantId ? 'development' : 'anonymous'
    } satisfies RequestContext;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireTenant(req: Request, _res: Response, next: NextFunction) {
  if (!(req as any).context?.tenantId) {
    return next(new HttpError(401, 'Falta una sesión válida con tenant firmado.'));
  }
  next();
}

export function requirePermission(permission: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const ctx = (req as any).context as RequestContext | undefined;
      if (!ctx?.tenantId) return next(new HttpError(401, 'No hay tenant activo.'));

      if (ctx.authMode === 'development' && !ctx.userId && env.ALLOW_DEV_TENANT_HEADER === 'true') return next();
      if (!ctx.userId) return next(new HttpError(401, 'No hay usuario autenticado.'));

      const allowed = await prisma.userRole.count({
        where: {
          userId: ctx.userId,
          role: {
            tenantId: ctx.tenantId,
            permissions: { some: { permission: { key: permission } } }
          }
        }
      });

      if (!allowed) return next(new HttpError(403, `Permiso requerido: ${permission}`));
      next();
    } catch (error) {
      next(error);
    }
  };
}
