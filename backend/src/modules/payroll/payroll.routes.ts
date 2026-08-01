import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma.js';
import { requirePermission, requireTenant } from '../../shared/middleware/context.js';
import { HttpError, asyncHandler, ok } from '../../shared/http.js';
import { validateBody } from '../../shared/middleware/validate.js';
import { writeAudit } from '../../shared/services/audit.service.js';

const router = Router();
router.use(requireTenant, requirePermission('payroll.manage'));

const periodSchema = z.object({ period:z.string().min(4).max(30) });
const receiptSchema = z.object({
  periodId:z.string().uuid().optional(),
  period:z.string().min(4).max(30).optional(),
  employeeId:z.string().uuid(),
  gross:z.coerce.number().nonnegative(),
  deductions:z.coerce.number().nonnegative(),
  net:z.coerce.number().nonnegative(),
  details:z.record(z.string(), z.unknown()).optional()
}).refine((value)=>Boolean(value.periodId || value.period), { message:'Indica periodId o period.' });
const statusSchema = z.object({ status:z.enum(['draft','approved','paid','cancelled']) });

const context = (req:any) => req.context as { tenantId:string; userId?:string; ip?:string; userAgent?:string };
const serializeReceipt = (receipt:any) => ({ ...receipt, gross:Number(receipt.gross), deductions:Number(receipt.deductions), net:Number(receipt.net) });
const serializePeriod = (period:any) => ({ ...period, totalGross:Number(period.totalGross), totalDeductions:Number(period.totalDeductions), totalNet:Number(period.totalNet), receipts:(period.receipts || []).map(serializeReceipt) });
const toJson = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;

async function recalculatePeriod(periodId:string) {
  const totals = await prisma.payrollReceipt.aggregate({
    where:{ periodId },
    _sum:{ gross:true, deductions:true, net:true }
  });
  return prisma.payrollPeriod.update({
    where:{ id:periodId },
    data:{
      totalGross:Number(totals._sum.gross || 0),
      totalDeductions:Number(totals._sum.deductions || 0),
      totalNet:Number(totals._sum.net || 0)
    },
    include:{ receipts:{ include:{ employee:true }, orderBy:{ createdAt:'desc' } } }
  });
}

router.get('/periods', asyncHandler(async (req,res)=>{
  const ctx=context(req);
  const status=String(req.query.status || '');
  const rows=await prisma.payrollPeriod.findMany({
    where:{ tenantId:ctx.tenantId, ...(status ? { status:status as any } : {}) },
    include:{ receipts:{ include:{ employee:true }, orderBy:{ createdAt:'desc' } } },
    orderBy:{ period:'desc' },
    take:100
  });
  ok(res, rows.map(serializePeriod));
}));

router.post('/periods', validateBody(periodSchema), asyncHandler(async (req,res)=>{
  const ctx=context(req);
  const existing=await prisma.payrollPeriod.findFirst({ where:{ tenantId:ctx.tenantId, period:req.body.period } });
  if(existing)throw new HttpError(409,'El período de nómina ya existe.');
  const created=await prisma.payrollPeriod.create({ data:{ tenantId:ctx.tenantId, period:req.body.period }, include:{ receipts:true } });
  await writeAudit({ tenantId:ctx.tenantId,userId:ctx.userId,action:'payroll.create-period',entity:'PayrollPeriod',entityId:created.id,after:serializePeriod(created),ipAddress:ctx.ip,userAgent:ctx.userAgent });
  ok(res,serializePeriod(created));
}));

router.post('/receipts', validateBody(receiptSchema), asyncHandler(async (req,res)=>{
  const ctx=context(req);
  const input=req.body as z.infer<typeof receiptSchema>;
  const employee=await prisma.employee.findFirst({ where:{ id:input.employeeId,tenantId:ctx.tenantId,active:true } });
  if(!employee)throw new HttpError(404,'Empleado no encontrado para el tenant activo.');
  let period=input.periodId
    ? await prisma.payrollPeriod.findFirst({ where:{ id:input.periodId,tenantId:ctx.tenantId } })
    : await prisma.payrollPeriod.findFirst({ where:{ tenantId:ctx.tenantId,period:input.period! } });
  if(!period && input.period)period=await prisma.payrollPeriod.create({ data:{ tenantId:ctx.tenantId,period:input.period } });
  if(!period)throw new HttpError(404,'Período de nómina no encontrado.');
  if(period.status !== 'draft')throw new HttpError(409,'Solo se pueden modificar períodos en borrador.');
  const existing=await prisma.payrollReceipt.findFirst({ where:{ periodId:period.id,employeeId:employee.id } });
  if(existing)throw new HttpError(409,'El empleado ya tiene recibo en este período.');
  const created=await prisma.payrollReceipt.create({
    data:{ periodId:period.id,employeeId:employee.id,gross:input.gross,deductions:input.deductions,net:input.net,details:toJson(input.details) },
    include:{ employee:true }
  });
  const updatedPeriod=await recalculatePeriod(period.id);
  await writeAudit({ tenantId:ctx.tenantId,userId:ctx.userId,action:'payroll.create-receipt',entity:'PayrollReceipt',entityId:created.id,after:serializeReceipt(created),ipAddress:ctx.ip,userAgent:ctx.userAgent });
  ok(res,{ receipt:serializeReceipt(created),period:serializePeriod(updatedPeriod) });
}));

router.patch('/periods/:id/status', validateBody(statusSchema), asyncHandler(async (req,res)=>{
  const ctx=context(req);
  const existing=await prisma.payrollPeriod.findFirst({ where:{ id:req.params.id,tenantId:ctx.tenantId }, include:{ receipts:true } });
  if(!existing)throw new HttpError(404,'Período de nómina no encontrado.');
  if(req.body.status === 'approved' && !existing.receipts.length)throw new HttpError(409,'No se puede aprobar un período sin recibos.');
  const updated=await prisma.payrollPeriod.update({ where:{ id:existing.id },data:{ status:req.body.status },include:{ receipts:{ include:{ employee:true } } } });
  await writeAudit({ tenantId:ctx.tenantId,userId:ctx.userId,action:`payroll.period-${req.body.status}`,entity:'PayrollPeriod',entityId:updated.id,before:serializePeriod(existing),after:serializePeriod(updated),ipAddress:ctx.ip,userAgent:ctx.userAgent });
  ok(res,serializePeriod(updated));
}));

router.delete('/receipts/:id', asyncHandler(async (req,res)=>{
  const ctx=context(req);
  const existing=await prisma.payrollReceipt.findFirst({ where:{ id:req.params.id,period:{ tenantId:ctx.tenantId } },include:{ period:true,employee:true } });
  if(!existing)throw new HttpError(404,'Recibo de nómina no encontrado.');
  if(existing.period.status !== 'draft')throw new HttpError(409,'Solo se eliminan recibos de períodos en borrador.');
  await prisma.payrollReceipt.delete({ where:{ id:existing.id } });
  const period=await recalculatePeriod(existing.periodId);
  await writeAudit({ tenantId:ctx.tenantId,userId:ctx.userId,action:'payroll.delete-receipt',entity:'PayrollReceipt',entityId:existing.id,before:serializeReceipt(existing),ipAddress:ctx.ip,userAgent:ctx.userAgent });
  ok(res,{ deleted:true,id:existing.id,period:serializePeriod(period) });
}));

export default router;
