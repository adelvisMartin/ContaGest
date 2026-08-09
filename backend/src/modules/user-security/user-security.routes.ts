import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';

const router = Router();
router.use(requireTenant, requirePermission('admin.manage'));

const updateSchema = z.object({
  status: z.enum(['active', 'invited', 'disabled']).optional(),
  roleId: z.string().min(1).optional(),
  newPassword: z.string().min(12).max(128).optional(),
  clearFailures: z.boolean().optional()
}).refine((body) => Boolean(body.status || body.roleId || body.newPassword || body.clearFailures), {
  message: 'No se recibió ningún cambio.'
});

function tenantId(req:any) {
  const id = String(req.context?.tenantId || '');
  if (!id) throw new HttpError(401, 'No hay empresa activa.');
  return id;
}

async function clearUserFailures(tenantRif:string,email:string) {
  await prisma.authLoginAttempt.deleteMany({
    where:{ tenantRif, email:email.trim().toLowerCase(), success:false }
  });
}

async function serializeUsers(id:string) {
  const tenant = await prisma.tenant.findUnique({ where:{ id }, select:{ rif:true } });
  if (!tenant) throw new HttpError(404, 'Empresa no encontrada.');

  const [users, roles] = await Promise.all([
    prisma.userProfile.findMany({
      where:{ tenantId:id },
      include:{ userRoles:{ include:{ role:true } } },
      orderBy:[{ status:'asc' }, { email:'asc' }]
    }),
    prisma.role.findMany({
      where:{ tenantId:id },
      include:{ permissions:{ include:{ permission:true } } },
      orderBy:{ name:'asc' }
    })
  ]);

  const securityUsers = await Promise.all(users.map(async (user) => {
    const failures = await prisma.authLoginAttempt.findMany({
      where:{
        tenantRif:tenant.rif,
        email:user.email.toLowerCase(),
        success:false,
        createdAt:{ gt:new Date(Date.now() - 24 * 60 * 60 * 1000) }
      },
      orderBy:{ createdAt:'desc' },
      take:5,
      select:{ createdAt:true, ipAddress:true }
    });
    return {
      id:user.id,
      email:user.email,
      fullName:user.fullName,
      status:user.status,
      accessExpiresAt:user.accessExpiresAt,
      passwordConfigured:Boolean(user.passwordHash),
      failedAttempts:failures.length,
      lastFailedAt:failures[0]?.createdAt || null,
      roles:user.userRoles.map((assignment) => ({ id:assignment.role.id, name:assignment.role.name })),
      primaryRoleId:user.userRoles[0]?.role.id || null
    };
  }));

  return {
    users:securityUsers,
    roles:roles.map((role) => ({
      id:role.id,
      name:role.name,
      description:role.description,
      admin:role.permissions.some((item) => item.permission.key === 'admin.manage')
    }))
  };
}

router.get('/users', asyncHandler(async (req,res) => {
  ok(res, await serializeUsers(tenantId(req)));
}));

router.patch('/users/:userId', asyncHandler(async (req,res) => {
  const id = tenantId(req);
  const body = updateSchema.parse(req.body || {});
  const user = await prisma.userProfile.findFirst({
    where:{ id:req.params.userId, tenantId:id },
    include:{ tenant:true, userRoles:{ include:{ role:{ include:{ permissions:{ include:{ permission:true } } } } } } }
  });
  if (!user) throw new HttpError(404, 'Usuario no encontrado.');

  const currentUserId = String((req as any).context?.userId || '');
  const self = currentUserId === user.id;
  if (self && body.status === 'disabled') throw new HttpError(409, 'No puedes bloquear tu propia sesión administrativa.');

  if (body.roleId) {
    const role = await prisma.role.findFirst({
      where:{ id:body.roleId, tenantId:id },
      include:{ permissions:{ include:{ permission:true } } }
    });
    if (!role) throw new HttpError(404, 'Rol no encontrado para esta empresa.');
    if (self && !role.permissions.some((item) => item.permission.key === 'admin.manage')) {
      throw new HttpError(409, 'No puedes quitarte tu propio permiso administrativo.');
    }
    await prisma.userRole.deleteMany({ where:{ userId:user.id } });
    await prisma.userRole.create({ data:{ userId:user.id, roleId:role.id } });
  }

  const updateData:any = {};
  if (body.status) updateData.status = body.status;
  if (body.newPassword) updateData.passwordHash = await bcrypt.hash(body.newPassword, 12);
  if (Object.keys(updateData).length) await prisma.userProfile.update({ where:{ id:user.id }, data:updateData });

  if (body.clearFailures || body.status === 'active' || body.newPassword) {
    await clearUserFailures(user.tenant.rif, user.email);
  }

  ok(res, {
    updated:true,
    userId:user.id,
    ...(body.newPassword ? { passwordReset:true } : {}),
    ...(body.status ? { status:body.status } : {}),
    ...(body.roleId ? { roleId:body.roleId } : {})
  });
}));

export default router;
