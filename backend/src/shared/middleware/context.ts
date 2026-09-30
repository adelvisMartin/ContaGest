import type { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { env, isProd } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import { resolveSupabaseBootstrapIdentity } from '../../database/auth-bootstrap.js';
import { runWithRuntimeTenant } from '../../database/runtime-tenant-context.js';
import { assertSupabaseBridgeConfiguration, classifyPresentedTokenAuthority } from '../auth/authBoundary.js';
import { JWT_ISSUER, verifyAccessToken } from '../auth/jwt.js';
import { readAccessToken, readCsrfToken, validateCsrfAgainstSession } from '../auth/sessionCookies.js';
import { hasPlatformAccess, isPlatformPermission } from '../identity/platformAccess.js';
import { HttpError } from '../http.js';
import { PERMISSION_MODULES } from '../contracts/accessManifest.js';

const DEV_TENANT_ID_HEADER = 'x-tenant-id';
const DEV_USER_ID_HEADER = 'x-user-id';

type RequestContext = {
  tenantId?: string;
  userId?: string;
  authUserId?: string;
  email?: string;
  sessionId?: string;
  ip?: string;
  userAgent?: string | string[];
  authMode: 'backend-cookie' | 'backend-jwt' | 'supabase' | 'development' | 'anonymous';
};

type AuthIdentityContext = Pick<RequestContext, 'authMode'> & Omit<Partial<RequestContext>, 'authMode'>;

async function resolveBackendJwtContext(token: string, cookieMode = false): Promise<AuthIdentityContext> {
  // The signature, issuer, audience and authority claims are verified before the
  // signed tenant claim can influence any database context.
  const decoded = verifyAccessToken(token);
  if (!decoded.sid) throw new HttpError(401, 'El token de acceso no está vinculado a una sesión de servidor.');

  return runWithRuntimeTenant(decoded.tenantId, async () => {
    // Every backend token (cookie or bearer) is session-bound. This makes
    // revocation authoritative regardless of transport and prevents a valid
    // signed tenant claim from bypassing UserSession revalidation.
    const sessions = await prisma.$queryRaw<Array<{ status:string; expiresAt:Date }>>`
      SELECT "status", "expiresAt"
      FROM public."UserSession"
      WHERE "id"=${decoded.sid}
        AND "userId"=${decoded.sub}
        AND "tenantId"=${decoded.tenantId}
      LIMIT 1
    `;
    const session = sessions[0];
    if (!session || session.status !== 'active' || new Date(session.expiresAt).getTime() <= Date.now()) {
      throw new HttpError(401, 'La sesión fue revocada, reemplazada o venció. Inicia sesión nuevamente.');
    }

    const profile = await prisma.userProfile.findFirst({
      where: { id:decoded.sub, tenantId:decoded.tenantId, status:'active' },
      select: { id:true, tenantId:true, email:true, accessExpiresAt:true }
    });
    if (!profile) throw new HttpError(403, 'Usuario de sesión sin perfil activo.');
    if (profile.accessExpiresAt && profile.accessExpiresAt.getTime() <= Date.now()) throw new HttpError(403, 'El acceso temporal venció.');
    return {
      authMode:cookieMode ? 'backend-cookie' : 'backend-jwt',
      userId:profile.id,
      tenantId:profile.tenantId,
      email:profile.email,
      sessionId:decoded.sid
    };
  });
}

async function resolveSupabaseContext(token: string): Promise<AuthIdentityContext | null> {
  const enabled=env.SUPABASE_AUTH_FALLBACK === 'true';
  assertSupabaseBridgeConfiguration({ enabled, url:env.SUPABASE_URL, anonKey:env.SUPABASE_ANON_KEY });
  if (!enabled) return null;
  const supabase = createClient(env.SUPABASE_URL!, env.SUPABASE_ANON_KEY!, {
    auth: { persistSession:false, autoRefreshToken:false },
    global: { headers: { Authorization:`Bearer ${token}` } }
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  // Supabase proves only the provider identity. The private bootstrap authority
  // maps that exact auth user id to one active ContaGest profile/tenant without
  // accepting a tenant selector from the request.
  const identity = await resolveSupabaseBootstrapIdentity(data.user.id);
  if (!identity) throw new HttpError(403, 'Usuario Supabase autenticado sin perfil activo en ContaGest-VE.');

  return runWithRuntimeTenant(identity.tenantId, async () => {
    const profile = await prisma.userProfile.findFirst({
      where: {
        id:identity.userProfileId,
        tenantId:identity.tenantId,
        authUserId:data.user.id,
        status:'active'
      },
      select: { id:true, tenantId:true, email:true, accessExpiresAt:true }
    });
    if (!profile) throw new HttpError(403, 'Usuario Supabase autenticado sin perfil activo en ContaGest-VE.');
    if (profile.accessExpiresAt && profile.accessExpiresAt.getTime() <= Date.now()) throw new HttpError(403, 'El acceso temporal venció.');
    return {
      authMode:'supabase',
      authUserId:data.user.id,
      userId:profile.id,
      tenantId:profile.tenantId,
      email:profile.email || data.user.email || undefined
    };
  });
}

async function resolveSignedContext(token: string, cookieMode: boolean): Promise<AuthIdentityContext> {
  if(cookieMode){
    try{return await resolveBackendJwtContext(token,true);}
    catch(error){
      if(error instanceof HttpError)throw error;
      throw new HttpError(401,'Sesión inválida o expirada.');
    }
  }

  const supabaseBridgeEnabled=env.SUPABASE_AUTH_FALLBACK === 'true';
  const authority=classifyPresentedTokenAuthority(token,{backendIssuer:JWT_ISSUER,supabaseBridgeEnabled});
  if(authority==='backend-jwt'){
    try{return await resolveBackendJwtContext(token,false);}
    catch(error){
      if(error instanceof HttpError&&error.status===403)throw error;
      throw new HttpError(401,'Sesión inválida, expirada o firmada por un emisor no autorizado.');
    }
  }

  try{
    const supabaseContext=await resolveSupabaseContext(token);
    if(supabaseContext)return supabaseContext;
  }catch(error){
    if(error instanceof HttpError)throw error;
    if(error instanceof Error&&error.message==='SUPABASE_AUTH_BRIDGE_MISCONFIGURED'){
      throw new HttpError(503,'El proveedor de identidad configurado no está disponible.');
    }
    throw new HttpError(401,'Sesión externa inválida o no verificable.');
  }
  throw new HttpError(401,'Sesión externa inválida o no verificable.');
}

export async function requestContext(req: Request, _res: Response, next: NextFunction) {
  try {
    const auth = readAccessToken(req);
    if (auth) {
      const cookieMode = auth.mode === 'cookie';
      const secureContext = await resolveSignedContext(auth.token, cookieMode);
      if (!secureContext.tenantId) throw new HttpError(401, 'La identidad autenticada no contiene un tenant verificable.');

      // Keep the AsyncLocalStorage tenant authority active while Express invokes
      // downstream middleware/handlers. Async resources created by `next()` inherit
      // this store, so Prisma runtime access is transaction-scoped by #843.
      return runWithRuntimeTenant(secureContext.tenantId, async () => {
        if (cookieMode && !['GET','HEAD','OPTIONS'].includes(req.method.toUpperCase())) {
          const csrfCookie = readCsrfToken(req);
          const csrfHeader = String(req.header('x-csrf-token') || '');
          if (!csrfCookie || csrfCookie !== csrfHeader || !await validateCsrfAgainstSession(secureContext.sessionId, csrfCookie)) {
            throw new HttpError(403, 'La sesión CSRF no es válida. Renueva la sesión e intenta de nuevo.');
          }
        }
        (req as any).context = { ...secureContext, ip:req.ip, userAgent:req.headers['user-agent'] } satisfies RequestContext;
        next();
      });
    }
    const allowDevelopmentHeader = !isProd && env.ALLOW_DEV_TENANT_HEADER === 'true';
    const tenantId = allowDevelopmentHeader ? req.header(DEV_TENANT_ID_HEADER) || req.query.tenantId?.toString() : undefined;
    const userId = allowDevelopmentHeader ? req.header(DEV_USER_ID_HEADER) || req.query.userId?.toString() : undefined;
    if (isProd && (req.header(DEV_TENANT_ID_HEADER) || req.header(DEV_USER_ID_HEADER))) throw new HttpError(401, 'Los encabezados de tenant y usuario están prohibidos en producción. Usa la sesión segura de ContaGest.');
    (req as any).context = { tenantId,userId,ip:req.ip,userAgent:req.headers['user-agent'],authMode:tenantId?'development':'anonymous' } satisfies RequestContext;
    next();
  } catch (error) { next(error); }
}

export function requireTenant(req: Request, _res: Response, next: NextFunction) {
  if (!(req as any).context?.tenantId) return next(new HttpError(401, 'Falta una sesión válida con tenant firmado.'));
  next();
}

function enabledModules(value: unknown) {
  if (Array.isArray(value)) return value.map(String);
  if (value && typeof value === 'object') {
    const enabled = (value as Record<string, unknown>).enabled;
    if (Array.isArray(enabled)) return enabled.map(String);
  }
  return [];
}

async function enforceClientLicense(ctx: RequestContext, permission: string) {
  if (!ctx.userId || !ctx.tenantId) throw new HttpError(401, 'No hay usuario autenticado.');
  // `Role.system` is role lifecycle metadata only. The only customer-license bypass is
  // a verified platform-scoped identity carrying platform.manage in the internal tenant.
  if (await hasPlatformAccess(ctx)) return;

  const license = await prisma.licenseKey.findFirst({
    where: { tenantId:ctx.tenantId, userId:ctx.userId, status:'active', expiresAt:{ gt:new Date() } },
    orderBy: { createdAt:'desc' },
    select: { id:true, modules:true, expiresAt:true, status:true }
  });
  if (!license) throw new HttpError(403, 'La licencia fue revocada, venció o no pertenece al usuario activo.');
  const allowedModules = PERMISSION_MODULES[permission] || [];
  const modules = enabledModules(license.modules);
  if (allowedModules.length && !allowedModules.some((module) => modules.includes(module))) {
    throw new HttpError(403, `La licencia no habilita la operación requerida (${permission}).`);
  }
}

export function requirePermission(permission: string) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const ctx = (req as any).context as RequestContext | undefined;
      if (!ctx?.tenantId) return next(new HttpError(401, 'No hay tenant activo.'));
      if (ctx.authMode === 'development' && !ctx.userId && env.ALLOW_DEV_TENANT_HEADER === 'true') return next();
      if (!ctx.userId) return next(new HttpError(401, 'No hay usuario autenticado.'));

      if (isPlatformPermission(permission)) {
        if (!await hasPlatformAccess(ctx, permission)) return next(new HttpError(403, `Permiso de plataforma requerido: ${permission}`));
        return next();
      }

      await enforceClientLicense(ctx, permission);
      const allowed = await prisma.userRole.count({
        where: { userId:ctx.userId, role:{ tenantId:ctx.tenantId, permissions:{ some:{ permission:{ key:permission } } } } }
      });
      if (!allowed) return next(new HttpError(403, `Permiso requerido: ${permission}`));
      next();
    } catch (error) { next(error); }
  };
}
