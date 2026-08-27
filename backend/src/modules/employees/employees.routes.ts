import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler, HttpError, ok } from '../../shared/http.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { writeAudit } from '../../shared/services/audit.service.js';
import { money, serializeDecimal, serializeLegacyNumber, ZERO } from '../../shared/financial/decimal.js';
import { decimalSchema } from '../../shared/financial/zod.js';

const router = Router();
router.use(requireTenant, requirePermission('payroll.manage'));

const employeeSchema = z.object({
  idNumber: z.string().trim().min(4).max(40),
  fullName: z.string().trim().min(2).max(180),
  position: z.string().trim().min(2).max(120),
  department: z.string().trim().max(120).optional(),
  hiredAt: z.coerce.date().optional(),
  salary: decimalSchema('money', { nonnegative: true }).optional(),
  active: z.boolean().optional()
});

const context = (req: any) => req.context as {
  tenantId: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
};

const serialize = (employee: any) => {
  const salary = money(employee.salary ?? ZERO);
  return {
    ...employee,
    salary: serializeLegacyNumber(salary),
    salaryExact: serializeDecimal(salary, 2)
  };
};

router.get('/', asyncHandler(async (req, res) => {
  const ctx = context(req);
  const q = String(req.query.q || '').trim();
  const take = Math.min(Math.max(Number(req.query.take || 100), 1), 500);
  const pattern = `%${q}%`;
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "id", "tenantId", "idNumber", "fullName", "position", "department", "hiredAt", "salary", "active", "createdAt", "updatedAt"
       FROM "Employee"
      WHERE "tenantId" = $1
        AND ($2 = '' OR "fullName" ILIKE $3 OR "idNumber" ILIKE $3 OR COALESCE("department", '') ILIKE $3 OR "position" ILIKE $3)
      ORDER BY "createdAt" DESC
      LIMIT $4`,
    ctx.tenantId,
    q,
    pattern,
    take
  );
  ok(res, rows.map(serialize));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const ctx = context(req);
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "id", "tenantId", "idNumber", "fullName", "position", "department", "hiredAt", "salary", "active", "createdAt", "updatedAt"
       FROM "Employee"
      WHERE "id" = $1 AND "tenantId" = $2
      LIMIT 1`,
    req.params.id,
    ctx.tenantId
  );
  if (!rows[0]) throw new HttpError(404, 'Empleado no encontrado.');
  ok(res, serialize(rows[0]));
}));

router.post('/', validateBody(employeeSchema), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const id = randomUUID();
  const salary = req.body.salary ?? ZERO;
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `INSERT INTO "Employee" ("id", "tenantId", "idNumber", "fullName", "position", "department", "hiredAt", "salary", "active", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
     RETURNING "id", "tenantId", "idNumber", "fullName", "position", "department", "hiredAt", "salary", "active", "createdAt", "updatedAt"`,
    id,
    ctx.tenantId,
    req.body.idNumber,
    req.body.fullName,
    req.body.position,
    req.body.department || null,
    req.body.hiredAt || null,
    salary,
    req.body.active !== false
  );
  const employee = serialize(rows[0]);
  await writeAudit({ tenantId:ctx.tenantId,userId:ctx.userId,action:'create',entity:'Employee',entityId:id,after:employee,ipAddress:ctx.ip,userAgent:ctx.userAgent });
  ok(res, employee);
}));

router.put('/:id', validateBody(employeeSchema.partial()), asyncHandler(async (req, res) => {
  const ctx = context(req);
  const currentRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "id", "tenantId", "idNumber", "fullName", "position", "department", "hiredAt", "salary", "active", "createdAt", "updatedAt"
       FROM "Employee" WHERE "id" = $1 AND "tenantId" = $2 LIMIT 1`,
    req.params.id,
    ctx.tenantId
  );
  const before = currentRows[0];
  if (!before) throw new HttpError(404, 'Empleado no encontrado.');

  const next = {
    idNumber: req.body.idNumber ?? before.idNumber,
    fullName: req.body.fullName ?? before.fullName,
    position: req.body.position ?? before.position,
    department: req.body.department === undefined ? before.department : (req.body.department || null),
    hiredAt: req.body.hiredAt === undefined ? before.hiredAt : (req.body.hiredAt || null),
    salary: req.body.salary === undefined ? money(before.salary ?? ZERO) : req.body.salary,
    active: req.body.active === undefined ? before.active : req.body.active
  };

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `UPDATE "Employee"
        SET "idNumber" = $1, "fullName" = $2, "position" = $3, "department" = $4, "hiredAt" = $5, "salary" = $6, "active" = $7, "updatedAt" = NOW()
      WHERE "id" = $8 AND "tenantId" = $9
      RETURNING "id", "tenantId", "idNumber", "fullName", "position", "department", "hiredAt", "salary", "active", "createdAt", "updatedAt"`,
    next.idNumber,
    next.fullName,
    next.position,
    next.department,
    next.hiredAt,
    next.salary,
    next.active,
    req.params.id,
    ctx.tenantId
  );
  const employee = serialize(rows[0]);
  await writeAudit({ tenantId:ctx.tenantId,userId:ctx.userId,action:'update',entity:'Employee',entityId:req.params.id,before:serialize(before),after:employee,ipAddress:ctx.ip,userAgent:ctx.userAgent });
  ok(res, employee);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const ctx = context(req);
  const employeeRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT "id", "tenantId", "idNumber", "fullName", "position", "department", "hiredAt", "salary", "active", "createdAt", "updatedAt"
       FROM "Employee" WHERE "id" = $1 AND "tenantId" = $2 LIMIT 1`,
    req.params.id,
    ctx.tenantId
  );
  const employee = employeeRows[0];
  if (!employee) throw new HttpError(404, 'Empleado no encontrado.');

  const receiptCount = await prisma.payrollReceipt.count({ where: { employeeId: employee.id } });
  if (receiptCount > 0) {
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `UPDATE "Employee" SET "active" = FALSE, "updatedAt" = NOW()
        WHERE "id" = $1 AND "tenantId" = $2
        RETURNING "id", "tenantId", "idNumber", "fullName", "position", "department", "hiredAt", "salary", "active", "createdAt", "updatedAt"`,
      employee.id,
      ctx.tenantId
    );
    const inactive = serialize(rows[0]);
    await writeAudit({ tenantId:ctx.tenantId,userId:ctx.userId,action:'deactivate',entity:'Employee',entityId:employee.id,before:serialize(employee),after:inactive,ipAddress:ctx.ip,userAgent:ctx.userAgent });
    return ok(res, { deactivated:true, employee:inactive });
  }

  await prisma.$executeRawUnsafe(`DELETE FROM "Employee" WHERE "id" = $1 AND "tenantId" = $2`, employee.id, ctx.tenantId);
  await writeAudit({ tenantId:ctx.tenantId,userId:ctx.userId,action:'delete',entity:'Employee',entityId:employee.id,before:serialize(employee),ipAddress:ctx.ip,userAgent:ctx.userAgent });
  ok(res, { deleted:true, id:employee.id });
}));

export default router;
