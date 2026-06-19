import type { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { env, isProd } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import { HttpError } from '../http.js';

const DEMO_TENANT_ID_HEADER = 'x-tenant-id';
const DEMO_USER_ID_HEADER = 'x-user-id';

type RequestContext = {
  tenantId?: string;
  userId?: string;
  authUserId?: string;
  email?: string;
  ip?: string;
  userAgent?: string | string[];
  authMode: 'supabase' | 'demo' | 'anonymous';
};

function getBearerToken(req: Request) {
  const header = req.header('authorization') || '';
  const [type, token] = header.split(' ');
  return type?.toLowerCase() === 'bearer' && token ? token : null;
}


async function resolveJwtContext(req: Request): Promise<Partial<RequestContext> | null> {
  const token = getBearerToken(req);
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as any;
    if (!decoded?.tenantId || !decoded?.sub) return null;
    const profile = await prisma.userProfile.findFirst({
      where: { id: decoded.sub, tenantId: decoded.tenantId, status: 'active' },
      select: { id: true, tenantId: true, email: true, fullName: true }
    });
    if (!profile) throw new HttpError(403, 'Usuario JWT sin perfil activo.');
    return {
      authMode: 'supabase',
      userId: profile.id,
      tenantId: profile.tenantId,
      email: profile.email
    };
  } catch {
    return null;
  }
}

async function resolveSupabaseContext(req: Request): Promise<Partial<RequestContext> | null> {
  const token = getBearerToken(req);
  if (!token || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return null;

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Sesión Supabase inválida o expirada.');

  const profile = await prisma.userProfile.findFirst({
    where: { authUserId: data.user.id, status: 'active' },
    select: { id: true, tenantId: true, email: true }
  });

  if (!profile) throw new HttpError(403, 'Usuario autenticado sin perfil activo en ContaGest-VE.');

  return {
    authMode: 'supabase',
    authUserId: data.user.id,
    userId: profile.id,
    tenantId: profile.tenantId,
    email: profile.email || data.user.email || undefined
  };
}

export async function requestContext(req: Request, _res: Response, next: NextFunction) {
  try {
    const secureContext = await resolveJwtContext(req) || await resolveSupabaseContext(req);

    if (secureContext) {
      (req as any).context = {
        ...secureContext,
        authMode: secureContext.authMode || 'supabase',
        ip: req.ip,
        userAgent: req.headers['user-agent']
      } satisfies RequestContext;
      return next();
    }

    const tenantId = req.header(DEMO_TENANT_ID_HEADER) || req.query.tenantId?.toString();
    const userId = req.header(DEMO_USER_ID_HEADER) || req.query.userId?.toString();

    if (isProd && tenantId) {
      throw new HttpError(401, 'x-tenant-id está prohibido en producción. Usa Authorization: Bearer <Supabase JWT>.');
    }

    (req as any).context = {
      tenantId,
      userId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      authMode: tenantId ? 'demo' : 'anonymous'
    } satisfies RequestContext;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireTenant(req: Request, _res: Response, next: NextFunction) {
  if (!(req as any).context?.tenantId) {
    return next(new HttpError(401, isProd
      ? 'Falta sesión Supabase válida.'
      : 'Falta x-tenant-id. En desarrollo puedes enviarlo como header; en producción viene de Supabase Auth/RLS.'));
  }
  next();
}

export function requirePermission(permission: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const ctx = (req as any).context as RequestContext | undefined;
      if (!ctx?.tenantId) return next(new HttpError(401, 'No hay tenant activo.'));

      // En desarrollo dejamos pasar si todavía no hay usuario demo.
      if (!ctx.userId && !isProd) return next();
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
