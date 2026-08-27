import { z } from 'zod';
import { decimalSchema } from '../shared/financial/zod.js';

export const clientSchema = z.object({ rif: z.string().min(5), name: z.string().min(2), contact: z.string().optional(), email: z.string().email().optional(), phone: z.string().optional(), address: z.string().optional(), fiscalType: z.string().optional(), active: z.boolean().optional() });
export const supplierSchema = z.object({ rif: z.string().min(5), name: z.string().min(2), contact: z.string().optional(), email: z.string().email().optional(), phone: z.string().optional(), address: z.string().optional(), retentionProfile: z.string().optional(), active: z.boolean().optional() });
export const productSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(2),
  description: z.string().optional(),
  unit: z.string().optional(),
  cost: decimalSchema('money', { nonnegative: true }).optional(),
  price: decimalSchema('money', { nonnegative: true }).optional(),
  stock: decimalSchema('quantity', { nonnegative: true }).optional(),
  reserved: decimalSchema('quantity', { nonnegative: true }).optional(),
  minStock: decimalSchema('quantity', { nonnegative: true }).optional(),
  taxRate: decimalSchema('percentage', { nonnegative: true }).optional(),
  active: z.boolean().optional()
});
export const bankAccountSchema = z.object({
  bankName: z.string().min(2),
  accountNo: z.string().min(4),
  currency: z.string().optional(),
  balance: decimalSchema('money').optional(),
  active: z.boolean().optional()
});
export const employeeSchema = z.object({
  idNumber: z.string().min(4),
  fullName: z.string().min(2),
  position: z.string().min(2),
  salary: decimalSchema('money').optional(),
  active: z.boolean().optional()
});
export const taxPeriodSchema = z.object({
  period: z.string().min(6),
  status: z.string().optional(),
  ivaDebit: decimalSchema('money').optional(),
  ivaCredit: decimalSchema('money').optional(),
  igtfPaid: decimalSchema('money').optional()
});
export const tenantSchema = z.object({ rif: z.string().min(5), name: z.string().min(2), legalName: z.string().optional(), plan: z.string().optional(), status: z.enum(['active','suspended','trial']).optional(), settings: z.record(z.string(), z.unknown()).optional() });

export const moduleRecordSchema = z.object({ title: z.string().min(2), status: z.string().optional(), payload: z.record(z.string(), z.unknown()).optional() });
