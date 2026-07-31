import { Router } from 'express';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requireTenant } from '../../shared/middleware/context.js';

const router = Router();
router.use(requireTenant);

const BUCKET = 'contagest-media';
const MAX_BYTES = 3 * 1024 * 1024;
const allowedMime = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);

const uploadSchema = z.object({
  entityType: z.enum(['care-patient', 'gym-member', 'profile', 'company']),
  entityId: z.string().min(5).max(180),
  dataUrl: z.string().min(30).max(5_000_000),
  alt: z.string().trim().max(240).optional()
});

const signSchema = z.object({
  paths: z.array(z.string().min(5).max(500)).min(1).max(100),
  expiresIn: z.coerce.number().int().min(60).max(86400).default(3600)
});

const deleteSchema = z.object({ path: z.string().min(5).max(500) });

function client() {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new HttpError(503, 'El almacenamiento privado no está configurado en el backend.');
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function hasPermission(userId: string, tenantId: string, permission: string) {
  return Boolean(await prisma.userRole.count({
    where: {
      userId,
      role: {
        tenantId,
        permissions: { some: { permission: { key: permission } } }
      }
    }
  }));
}

async function authorize(req: any, entityType: string, entityId: string) {
  const context = req.context as { tenantId: string; userId?: string };
  if (!context.userId) throw new HttpError(401, 'Usuario autenticado requerido.');

  if (entityType === 'profile') {
    if (entityId === context.userId) return;
    if (!await hasPermission(context.userId, context.tenantId, 'admin.manage')) {
      throw new HttpError(403, 'Solo puedes actualizar tu propia fotografía.');
    }
    const count = await prisma.userProfile.count({ where: { id: entityId, tenantId: context.tenantId } });
    if (!count) throw new HttpError(404, 'Perfil no encontrado.');
    return;
  }

  if (entityType === 'company') {
    if (!await hasPermission(context.userId, context.tenantId, 'admin.manage')) throw new HttpError(403, 'Permiso administrativo requerido.');
    if (entityId !== context.tenantId) throw new HttpError(403, 'La empresa no pertenece a la sesión activa.');
    return;
  }

  const permission = entityType === 'care-patient' ? 'health.manage' : 'gym.manage';
  if (!await hasPermission(context.userId, context.tenantId, permission)) throw new HttpError(403, `Permiso requerido: ${permission}`);
  const table = entityType === 'care-patient' ? 'CarePatient' : 'GymMember';
  const rows = await prisma.$queryRawUnsafe<any[]>(`SELECT "id" FROM public."${table}" WHERE "id" = $1 AND "tenantId" = $2 LIMIT 1`, entityId, context.tenantId);
  if (!rows.length) throw new HttpError(404, 'El registro no existe en la empresa activa.');
}

function parseDataUrl(value: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(value);
  if (!match) throw new HttpError(422, 'La imagen debe ser JPEG, PNG o WebP en formato válido.');
  const mime = match[1];
  const extension = allowedMime.get(mime);
  if (!extension) throw new HttpError(422, 'Tipo de imagen no permitido.');
  const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!bytes.length || bytes.length > MAX_BYTES) throw new HttpError(413, 'La imagen debe pesar entre 1 byte y 3 MB.');
  return { mime, extension, bytes };
}

function tenantPath(tenantId: string, entityType: string, entityId: string, extension: string) {
  const safeEntityId = entityId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${tenantId}/${entityType}/${safeEntityId}/${crypto.randomUUID()}.${extension}`;
}

async function updateEntityPhoto(tenantId: string, entityType: string, entityId: string, path: string) {
  if (entityType === 'care-patient') {
    await prisma.$executeRawUnsafe(`UPDATE public."CarePatient" SET "photoUrl" = $3, "updatedAt" = now() WHERE "id" = $1 AND "tenantId" = $2`, entityId, tenantId, path);
  } else if (entityType === 'gym-member') {
    await prisma.$executeRawUnsafe(`UPDATE public."GymMember" SET "photoUrl" = $3, "updatedAt" = now() WHERE "id" = $1 AND "tenantId" = $2`, entityId, tenantId, path);
  } else if (entityType === 'profile') {
    await prisma.$executeRawUnsafe(`UPDATE public."UserProfile" SET "updatedAt" = now() WHERE "id" = $1 AND "tenantId" = $2`, entityId, tenantId);
  } else if (entityType === 'company') {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    const settings = tenant?.settings && typeof tenant.settings === 'object' && !Array.isArray(tenant.settings) ? tenant.settings as Record<string, unknown> : {};
    await prisma.tenant.update({ where: { id: tenantId }, data: { settings: { ...settings, companyLogoPath: path } } });
  }
}

router.post('/upload', asyncHandler(async (req, res) => {
  const body = uploadSchema.parse(req.body || {});
  const context = (req as any).context as { tenantId: string; userId?: string };
  await authorize(req, body.entityType, body.entityId);
  const image = parseDataUrl(body.dataUrl);
  const path = tenantPath(context.tenantId, body.entityType, body.entityId, image.extension);
  const storage = client();
  const { error } = await storage.storage.from(BUCKET).upload(path, image.bytes, {
    contentType: image.mime,
    cacheControl: '3600',
    upsert: false
  });
  if (error) throw new HttpError(502, `No se pudo almacenar la imagen: ${error.message}`);
  await updateEntityPhoto(context.tenantId, body.entityType, body.entityId, path);
  const { data: signed, error: signError } = await storage.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (signError) throw new HttpError(502, `Imagen guardada, pero no se pudo firmar la URL: ${signError.message}`);
  ok(res, { path, signedUrl: signed.signedUrl, expiresIn: 3600, alt: body.alt || '' }, 201);
}));

router.post('/sign', asyncHandler(async (req, res) => {
  const body = signSchema.parse(req.body || {});
  const context = (req as any).context as { tenantId: string };
  const prefix = `${context.tenantId}/`;
  if (body.paths.some((path) => !path.startsWith(prefix))) throw new HttpError(403, 'Una o más imágenes no pertenecen a la empresa activa.');
  const storage = client();
  const results = await Promise.all(body.paths.map(async (path) => {
    const { data, error } = await storage.storage.from(BUCKET).createSignedUrl(path, body.expiresIn);
    return { path, signedUrl: error ? null : data.signedUrl, error: error?.message || null };
  }));
  ok(res, results);
}));

router.delete('/', asyncHandler(async (req, res) => {
  const body = deleteSchema.parse(req.body || {});
  const context = (req as any).context as { tenantId: string; userId?: string };
  if (!body.path.startsWith(`${context.tenantId}/`)) throw new HttpError(403, 'La imagen no pertenece a la empresa activa.');
  if (!context.userId || !await hasPermission(context.userId, context.tenantId, 'admin.manage')) throw new HttpError(403, 'Permiso administrativo requerido para eliminar archivos.');
  const { error } = await client().storage.from(BUCKET).remove([body.path]);
  if (error) throw new HttpError(502, `No se pudo eliminar la imagen: ${error.message}`);
  ok(res, { deleted: true, path: body.path });
}));

export default router;
