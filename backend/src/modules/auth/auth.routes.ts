import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { env, isProd } from '../../config/env.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { signAccessToken, tokenExpiresAt, verifyAccessToken } from '../../shared/auth/jwt.js';
import { validateUserLicense } from '../../shared/licensing/licenseGuard.js';

const router = Router();

const captchaFields = {
  captchaToken: z.string().min(20),
  captchaAnswer: z.string().min(1).max(10)
};

const registerSchema = z.object({
  tenantRif: z.string().min(5),
  tenantName: z.string().min(2),
  legalName: z.string().optional(),
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  plan: z.string().default('enterprise'),
  ...captchaFields
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantRif: z.string().min(5).default('00000000'),
  licenseKey: z.string().min(20).max(180).optional(),
  deviceId: z.string().min(8).max(240).optional(),
  deviceLabel: z.string().max(120).optional(),
  ...captchaFields
});

function signCaptchaPayload(payload: string) {
  return crypto.createHmac('sha256', env.JWT_SECRET).update(payload).digest('base64url');
}

function createCaptchaChallenge() {
  const a = crypto.randomInt(2, 13);
  const b = crypto.randomInt(2, 13);
  const ops = ['+', '-', '×'];
  const op = ops[crypto.randomInt(0, ops.length)];
  const left = op === '-' ? Math.max(a, b) : a;
  const right = op === '-' ? Math.min(a, b) : b;
  const expected = op === '+' ? left + right : op === '-' ? left - right : left * right;
  const issuedAt = Date.now();
  const exp = issuedAt + 5 * 60 * 1000;
  const nonce = crypto.randomBytes(12).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ kind:'math', a:left, b:right, op, expected, issuedAt, exp, nonce })).toString('base64url');
  const sig = signCaptchaPayload(payload);
  return {
    kind: 'math',
    question: `${left} ${op} ${right}`,
    prompt: `¿Cuánto es ${left} ${op === '×' ? 'por' : op} ${right}?`,
    token: `${payload}.${sig}`,
    expiresAt: exp,
    refreshAfterSeconds: 300
  };
}

function safeSignatureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyCaptcha(body: { captchaToken?: string; captchaAnswer?: string }) {
  const [payload, sig] = String(body.captchaToken || '').split('.');
  const expectedSig = payload ? signCaptchaPayload(payload) : '';
  if (!payload || !sig || !safeSignatureEqual(expectedSig, sig)) throw new HttpError(422, 'Captcha inválido. Actualiza el reto e intenta de nuevo.');
  let challenge: any;
  try { challenge = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); }
  catch { throw new HttpError(422, 'Captcha corrupto. Actualiza el reto e intenta de nuevo.'); }
  if (!challenge?.exp || Date.now() > Number(challenge.exp)) throw new HttpError(422, 'Captcha expirado. Actualiza el reto e intenta de nuevo.');
  const expected = Number(challenge.expected ?? (Number(challenge.a) + Number(challenge.b)));
  if (String(expected) !== String(body.captchaAnswer || '').trim()) throw new HttpError(422, 'Captcha incorrecto. Verifica la operación.');
}

function publicUser(user: any, role = 'admin') {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    name: user.fullName,
    status: user.status,
    role
  };
}

function buildSession(user: any, tenant: any, options: { role?: string; license?: any } = {}) {
  const token = signAccessToken(user, tenant.id);
  return {
    token,
    tenantId: tenant.id,
    tenant,
    user: publicUser(user, options.role || 'admin'),
    license: options.license || null,
    expiresAt: tokenExpiresAt(token)
  };
}

async function ensureAdminRole(tenantId: string, userId: string) {
  const permissionKeys = [
    'admin.manage',
    'clients.manage',
    'inventory.manage',
    'sales.manage',
    'sales.view',
    'purchases.manage',
    'reports.view',
    'modules.manage',
    'payroll.manage',
    'banking.manage',
    'taxes.export',
    'health.manage',
    'gym.manage',
    'communications.manage'
  ];

  for (const key of permissionKeys) {
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, description: `Permiso ${key}` }
    });
  }

  const role = await prisma.role.upsert({
    where: { tenantId_name: { tenantId, name: 'Administrador' } },
    update: { description: 'Rol administrador creado por registro backend.', system: true },
    create: { tenantId, name: 'Administrador', description: 'Rol administrador creado por registro backend.', system: true }
  });

  for (const key of permissionKeys) {
    const permission = await prisma.permission.findUnique({ where: { key } });
    if (!permission) continue;
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {},
      create: { roleId: role.id, permissionId: permission.id }
    });
  }

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId: role.id } },
    update: {},
    create: { userId, roleId: role.id }
  });
}

router.get('/captcha', (_req, res) => {
  ok(res, createCaptchaChallenge());
});

router.post('/register', validateBody(registerSchema), asyncHandler(async (req, res) => {
  const registerKey = req.header('x-admin-register-key') || '';
  const publicRegisterAllowed = env.ALLOW_PUBLIC_REGISTER === 'true' || (!isProd && env.ALLOW_PUBLIC_REGISTER === 'local');
  const registerKeyAllowed = Boolean(env.ADMIN_REGISTER_KEY && registerKey === env.ADMIN_REGISTER_KEY);
  if (!publicRegisterAllowed && !registerKeyAllowed) {
    throw new HttpError(403, 'Registro público deshabilitado. La empresa debe ser creada por un administrador.');
  }
  verifyCaptcha(req.body);
  const body = req.body;
  const passwordHash = await bcrypt.hash(body.password, 12);

  const tenant = await prisma.tenant.upsert({
    where: { rif: body.tenantRif },
    update: {
      name: body.tenantName,
      legalName: body.legalName || body.tenantName,
      plan: body.plan || 'enterprise',
      status: 'active'
    },
    create: {
      rif: body.tenantRif,
      name: body.tenantName,
      legalName: body.legalName || body.tenantName,
      plan: body.plan || 'enterprise',
      status: 'active',
      settings: {}
    }
  });

  const existing = await prisma.userProfile.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email: body.email } }
  });
  if (existing?.passwordHash) throw new HttpError(409, 'Ya existe un usuario registrado con ese email para esta empresa.');

  const user = existing
    ? await prisma.userProfile.update({
        where: { id: existing.id },
        data: { fullName: body.fullName, passwordHash, status: 'active' }
      })
    : await prisma.userProfile.create({
        data: {
          tenantId: tenant.id,
          email: body.email,
          fullName: body.fullName,
          passwordHash,
          status: 'active'
        }
      });

  await ensureAdminRole(tenant.id, user.id);
  ok(res, buildSession(user, tenant), 201);
}));

router.post('/login', validateBody(loginSchema), asyncHandler(async (req, res) => {
  verifyCaptcha(req.body);
  const tenant = await prisma.tenant.findUnique({ where: { rif: req.body.tenantRif } });
  if (!tenant) throw new HttpError(401, 'Empresa no encontrada. Registra la empresa primero.');

  const user = await prisma.userProfile.findFirst({
    where: { tenantId: tenant.id, email: req.body.email, status: 'active' },
    include: { userRoles: { include: { role: true } } }
  });
  if (!user) throw new HttpError(401, 'Usuario no autorizado para esta empresa.');

  let valid = false;
  if (user.passwordHash) valid = await bcrypt.compare(req.body.password, user.passwordHash);
  else if (!isProd && req.body.password === 'demo1234') valid = true;
  if (!valid) throw new HttpError(401, 'Contraseña incorrecta.');

  const systemUser = user.userRoles.some((assignment) => assignment.role.system);
  let license = null;
  if (!systemUser) {
    if (!req.body.licenseKey || !req.body.deviceId) {
      throw new HttpError(403, 'Este usuario requiere licencia y dispositivo autorizado.');
    }
    license = await validateUserLicense({
      tenantId: tenant.id,
      userId: user.id,
      userEmail: user.email,
      licenseKey: req.body.licenseKey,
      deviceId: req.body.deviceId,
      deviceLabel: req.body.deviceLabel || null,
      route: 'login',
      ip: req.ip,
      userAgent: req.headers['user-agent'] || null,
      metadata: { source:'login' }
    });
  }

  ok(res, buildSession(user, tenant, { role: systemUser ? 'admin' : 'client', license }));
}));

function bearerToken(req: any) {
  const header = String(req.header('authorization') || '');
  const [kind, token] = header.trim().split(/\s+/, 2);
  if (kind?.toLowerCase() !== 'bearer' || !token) throw new HttpError(401, 'Token requerido.');
  return token;
}

async function authenticatedSession(req: any) {
  let decoded: any;
  try { decoded = verifyAccessToken(bearerToken(req)); }
  catch { throw new HttpError(401, 'Token inválido o expirado.'); }

  const user = await prisma.userProfile.findFirst({
    where: { id: decoded.sub, tenantId: decoded.tenantId, status: 'active' },
    select: { id: true, tenantId: true, email: true, fullName: true, status: true, tenant: true }
  });
  if (!user) throw new HttpError(401, 'Usuario no encontrado o deshabilitado.');
  return { decoded, user };
}

router.get('/me', asyncHandler(async (req, res) => {
  const { decoded, user } = await authenticatedSession(req);
  ok(res, { ...decoded, user: publicUser(user), tenant: user.tenant, tenantId: user.tenantId });
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  const { user } = await authenticatedSession(req);
  ok(res, buildSession(user, user.tenant));
}));

export default router;
