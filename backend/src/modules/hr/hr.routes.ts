import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { asyncHandler } from '../../shared/http.js';
import { requireTenant } from '../../shared/middleware/context.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { add, divide, quantizeMoney, serializeDecimal, serializeLegacyNumber, ZERO } from '../../shared/financial/decimal.js';
import { decimalSchema } from '../../shared/financial/zod.js';

const router = Router();
router.use(requireTenant);

const paramSchema = z.object({
  code: z.string(),
  name: z.string(),
  value: decimalSchema('rate'),
  unit: z.string().default('percent'),
  effectiveFrom: z.string(),
  effectiveTo: z.string().optional().nullable(),
  active: z.boolean().default(true)
});

const getTenantId = (req: any) => req.context?.tenantId;

router.get('/kpis', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const [employees, periods] = await Promise.all([
    prisma.employee.findMany({ where: { tenantId, active: true } }),
    prisma.payrollPeriod.findMany({
      where: { tenantId },
      take: 6,
      orderBy: { period: 'desc' }
    })
  ]);

  const payroll = add(...periods.map((period) => period.totalNet));
  const salaryTotal = add(...employees.map((employee) => employee.salary));
  const averageSalary = employees.length ? quantizeMoney(divide(salaryTotal, employees.length)) : ZERO;

  res.json({
    activeEmployees: employees.length,
    averageSalary: serializeLegacyNumber(averageSalary),
    averageSalaryExact: serializeDecimal(averageSalary, 2),
    payrollLastPeriods: serializeLegacyNumber(payroll),
    payrollLastPeriodsExact: serializeDecimal(payroll, 2),
    openPeriods: periods.filter((period) => period.status === 'draft').length
  });
}));

router.get('/parameters', asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const parameters = await prisma.hrParameter.findMany({
    where: { tenantId },
    orderBy: { effectiveFrom: 'desc' }
  });
  res.json(parameters);
}));

router.post('/parameters', validateBody(paramSchema), asyncHandler(async (req, res) => {
  const tenantId = getTenantId(req);
  const record = await prisma.hrParameter.create({
    data: {
      tenantId,
      ...req.body,
      effectiveFrom: new Date(req.body.effectiveFrom),
      effectiveTo: req.body.effectiveTo ? new Date(req.body.effectiveTo) : null
    }
  });
  res.status(201).json(record);
}));

export default router;
