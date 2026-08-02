import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requireTenant, requirePermission } from '../../shared/middleware/context.js';

const router = Router();
router.use(requireTenant, requirePermission('admin.manage'));

const MODULE_PERMISSIONS = [
  ['dashboard.view', 'Dashboard'], ['clients.manage', 'Clientes'], ['sales.manage', 'Ventas'], ['sales.view', 'Consulta ventas'],
  ['inventory.manage', 'Inventario'], ['purchases.manage', 'Compras'], ['accounting.manage', 'Contabilidad'], ['banking.manage', 'Bancos'],
  ['taxes.export', 'Fiscal / SENIAT'], ['payroll.manage', 'RRHH / Nómina'], ['reports.view', 'Reportes'], ['audit.view', 'Auditoría'],
  ['orders.manage', 'Pedidos / POS'], ['orders.view', 'Tracking pedidos'], ['modules.manage', 'Módulos'], ['licenses.manage', 'Licencias'],
  ['demos.manage', 'Demos'], ['admin.manage', 'Administración']
];

const ROLE_BLUEPRINTS = [
  { name: 'Administrador', description: 'Control total del sistema.', system: true, permissions: MODULE_PERMISSIONS.map(([key]) => key) },
  { name: 'Contador', description: 'Fiscal, contabilidad, compras, ventas y reportes.', system: true, permissions: ['dashboard.view','clients.manage','sales.view','purchases.manage','accounting.manage','banking.manage','taxes.export','reports.view','audit.view'] },
  { name: 'Vendedor / Caja', description: 'Clientes, cotizaciones, ventas y pedidos.', system: true, permissions: ['dashboard.view','clients.manage','sales.manage','sales.view','orders.manage','orders.view'] },
  { name: 'Inventario', description: 'Stock, kardex, productos y reportes.', system: true, permissions: ['dashboard.view','inventory.manage','reports.view'] },
  { name: 'RRHH', description: 'Gestión de nómina y empleados.', system: true, permissions: ['dashboard.view','payroll.manage','reports.view'] },
  { name: 'Demo limitado', description: 'Demo comercial con permisos recortados.', system: true, permissions: ['dashboard.view','clients.manage','sales.view','orders.view','reports.view'] }
];

const USERS = [
  { email:'admin@empresa.com', fullName:'Admin Principal', role:'Administrador' },
  { email:'contador@empresa.com', fullName:'María Contador', role:'Contador' },
  { email:'ventas@empresa.com', fullName:'Carlos Ventas', role:'Vendedor / Caja' },
  { email:'inventario@empresa.com', fullName:'Ana Inventario', role:'Inventario' },
  { email:'rrhh@empresa.com', fullName:'Laura RRHH', role:'RRHH' },
  { email:'demo@empresa.com', fullName:'Usuario Demo Comercial', role:'Demo limitado' }
];

function tenantId(req: any) {
  const id = req.context?.tenantId;
  if (!id) throw new HttpError(401, 'Falta tenant activo para RBAC.');
  return id;
}

async function ensurePermission(key: string, description?: string) {
  return prisma.permission.upsert({ where: { key }, update: { description }, create: { key, description } });
}

async function setRolePermissions(roleId: string, permissionKeys: string[]) {
  const permissions = [];
  for (const key of [...new Set(permissionKeys)]) {
    permissions.push(await ensurePermission(key, `Permiso ${key}`));
  }
  await prisma.rolePermission.deleteMany({ where: { roleId } });
  if (permissions.length) {
    await prisma.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId, permissionId: permission.id })), skipDuplicates: true });
  }
}

async function bootstrapTenant(tenantId: string) {
  for (const [key, description] of MODULE_PERMISSIONS) await ensurePermission(key, description);

  const roleMap = new Map<string, any>();
  for (const blueprint of ROLE_BLUEPRINTS) {
    const role = await prisma.role.upsert({
      where: { tenantId_name: { tenantId, name: blueprint.name } },
      update: { description: blueprint.description, system: blueprint.system },
      create: { tenantId, name: blueprint.name, description: blueprint.description, system: blueprint.system }
    });
    await setRolePermissions(role.id, blueprint.permissions);
    roleMap.set(blueprint.name, role);
  }

  for (const item of USERS) {
    const user = await prisma.userProfile.upsert({
      where: { tenantId_email: { tenantId, email: item.email } },
      update: { fullName: item.fullName, status: 'active' },
      create: { tenantId, email: item.email, fullName: item.fullName, status: 'active' }
    });
    const role = roleMap.get(item.role);
    if (role) {
      await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
    }
  }

  await prisma.demoAccess.upsert({
    where: { id: `demo-access-${tenantId}` },
    update: {
      prospect: 'Usuario Demo Comercial',
      email: 'demo@empresa.com',
      enabledModules: ['dashboard','clientes','ventas','pedidos','tracking-pedidos','analytics','soporte'],
      expiresAt: new Date(Date.now() + 14 * 86400000),
      maxUsers: 3,
      status: 'active',
      notes: 'Demo comercial creado por bootstrap RBAC v9.3'
    },
    create: {
      id: `demo-access-${tenantId}`,
      tenantId,
      prospect: 'Usuario Demo Comercial',
      email: 'demo@empresa.com',
      phone: '+584120000000',
      enabledModules: ['dashboard','clientes','ventas','pedidos','tracking-pedidos','analytics','soporte'],
      expiresAt: new Date(Date.now() + 14 * 86400000),
      maxUsers: 3,
      status: 'active',
      notes: 'Demo comercial creado por bootstrap RBAC v9.3'
    }
  });
}

router.post('/bootstrap', asyncHandler(async (req, res) => {
  const id = tenantId(req);
  await bootstrapTenant(id);
  const summary = await buildSummary(id);
  ok(res, summary);
}));

async function buildSummary(tenantId: string) {
  const [roles, users, demos] = await Promise.all([
    prisma.role.findMany({ where: { tenantId }, include: { permissions: { include: { permission: true } }, users: { include: { user: true } } }, orderBy: { name: 'asc' } }),
    prisma.userProfile.findMany({ where: { tenantId }, include: { userRoles: { include: { role: true } } }, orderBy: { email: 'asc' } }),
    prisma.demoAccess.findMany({ where: { tenantId }, orderBy: { expiresAt: 'asc' } })
  ]);
  return {
    roles: roles.map((role) => ({ id: role.id, name: role.name, description: role.description, system: role.system, permissions: role.permissions.map((rp) => rp.permission.key), users: role.users.map((ur) => ur.user.email) })),
    users: users.map((user) => ({ id: user.id, email: user.email, fullName: user.fullName, status: user.status, accessExpiresAt:user.accessExpiresAt, roles: user.userRoles.map((ur) => ur.role.name) })),
    demos: demos.map((demo) => ({ id: demo.id, prospect: demo.prospect, email: demo.email, enabledModules: demo.enabledModules, expiresAt: demo.expiresAt, maxUsers: demo.maxUsers, status: demo.status }))
  };
}

router.get('/summary', asyncHandler(async (req, res) => {
  ok(res, await buildSummary(tenantId(req)));
}));

const rolePermissionsSchema = z.object({ permissionKeys: z.array(z.string()).default([]) });

const demoUserSchema = z.object({
  id: z.string().optional(),
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(12).max(128).optional(),
  roleName: z.string().default('Demo limitado'),
  roleId: z.string().optional(),
  days: z.coerce.number().min(1).max(365).default(14),
  maxModules: z.coerce.number().min(1).max(60).default(7),
  status: z.enum(['active','invited','disabled']).default('active')
});

function demoAccessId(tenantId: string, email: string) {
  return `demo-user-${tenantId}-${email.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.slice(0, 180);
}

async function ensureRoleByName(tenantId: string, roleName: string) {
  let role = await prisma.role.findUnique({ where: { tenantId_name: { tenantId, name: roleName } } });
  if (!role) {
    await bootstrapTenant(tenantId);
    role = await prisma.role.findUnique({ where: { tenantId_name: { tenantId, name: roleName } } });
  }
  if (!role) throw new HttpError(404, `Rol no encontrado: ${roleName}`);
  return role;
}

async function upsertDemoUser(tenantId: string, body: z.infer<typeof demoUserSchema>) {
  const role = await ensureRoleByName(tenantId, body.roleName);
  const existing = await prisma.userProfile.findUnique({ where: { tenantId_email: { tenantId, email: body.email } } });
  if(!existing&&!body.password)throw new HttpError(422,'La contraseña temporal es obligatoria al crear el usuario.');
  const passwordHash = body.password ? await bcrypt.hash(body.password, 12) : undefined;
  const expiresAt = new Date(Date.now() + body.days * 86400000);
  const userData = {
    fullName: body.fullName,
    email: body.email,
    status: body.status,
    accessExpiresAt: expiresAt,
    ...(passwordHash ? { passwordHash } : {})
  };
  const user = existing
    ? await prisma.userProfile.update({ where: { id: existing.id }, data: userData })
    : await prisma.userProfile.create({ data: { tenantId, ...userData, passwordHash:passwordHash! } });

  await prisma.userRole.deleteMany({ where: { userId: user.id } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });

  const enabledModules = ROLE_BLUEPRINTS.find((item) => item.name === body.roleName)?.permissions || ['dashboard.view','clients.manage','sales.view'];
  await prisma.demoAccess.upsert({
    where: { id: demoAccessId(tenantId, body.email) },
    update: {
      prospect: body.fullName,
      email: body.email,
      enabledModules,
      expiresAt,
      maxUsers: body.maxModules,
      status: body.status,
      notes: `Usuario demo editable · rol=${body.roleName} · maxModules=${body.maxModules}`
    },
    create: {
      id: demoAccessId(tenantId, body.email),
      tenantId,
      prospect: body.fullName,
      email: body.email,
      phone: '',
      enabledModules,
      expiresAt,
      maxUsers: body.maxModules,
      status: body.status,
      notes: `Usuario demo editable · rol=${body.roleName} · maxModules=${body.maxModules}`
    }
  });

  return { id: user.id, email: user.email, fullName: user.fullName, role: role.name, expiresAt, maxModules: body.maxModules };
}
router.put('/roles/:name/permissions', asyncHandler(async (req, res) => {
  const body = rolePermissionsSchema.parse(req.body || {});
  const role = await prisma.role.findUnique({ where: { tenantId_name: { tenantId: tenantId(req), name: decodeURIComponent(req.params.name) } } });
  if (!role) throw new HttpError(404, 'Rol no encontrado. Ejecuta bootstrap RBAC primero.');
  await setRolePermissions(role.id, body.permissionKeys);
  ok(res, { roleId: role.id, permissionKeys: body.permissionKeys });
}));


router.post('/demo-users', asyncHandler(async (req, res) => {
  const body = demoUserSchema.parse(req.body || {});
  if(!body.password)throw new HttpError(422,'La contraseña temporal es obligatoria.');
  const result = await upsertDemoUser(tenantId(req), body);
  res.status(201).json({ ok: true, data: result, meta: {} });
}));

router.put('/demo-users/:idOrEmail', asyncHandler(async (req, res) => {
  const body = demoUserSchema.parse(req.body || {});
  const result = await upsertDemoUser(tenantId(req), body);
  ok(res, { ...result, idOrEmail: decodeURIComponent(req.params.idOrEmail) });
}));

export default router;

