import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const code = readFileSync(new URL('../backend/src/modules/payroll/payroll.routes.ts', import.meta.url), 'utf8');

const receipt = code.split("router.post('/receipts'")[1]?.split("router.patch('/periods/:id/status'")[0];
const approval = code.split("router.patch('/periods/:id/status'")[1]?.split("router.delete('/receipts/:id'")[0];
const deletion = code.split("router.delete('/receipts/:id'")[1]?.split('export default router;')[0];

test('#781 source contract: receipt mutation and totals are within a single locked transaction', () => {
  assert.ok(receipt, 'receipt route must exist');
  assert.match(receipt, /await prisma\.\$transaction\(async tx/);
  assert.match(receipt, /await lockPayrollPeriod\(tx, ctx\.tenantId, period\.id\)/);
  assert.match(receipt, /tx\.payrollReceipt\.create/);
  assert.match(receipt, /recalculatePeriod\(period\.id, tx\)/);
  assert.match(receipt, /tx\.auditLog\.create/);
  assert.doesNotMatch(receipt, /prisma\.payrollReceipt\.create/);
});
test('#781 source contract: status and delete must take same tenant lock', () => {
  assert.ok(approval && deletion, 'status and delete routes must exist');
  assert.match(approval, /await prisma\.\$transaction\(async tx/);
  assert.match(approval, /await lockPayrollPeriod\(tx, ctx\.tenantId, req\.params\.id\)/);
  assert.match(approval, /tx\.auditLog\.create/);
  assert.match(deletion, /await prisma\.\$transaction\(async tx/);
  assert.match(deletion, /await lockPayrollPeriod\(tx, ctx\.tenantId, initial\.periodId\)/);
  assert.match(deletion, /recalculatePeriod\(existing\.periodId, tx\)/);
  assert.match(deletion, /tx\.auditLog\.create/);
});
test('#781 source contract: strict receipt inputs and non-forged net', () => {
  assert.match(code, /const receiptSchema = z\.object\(/);
  assert.match(code, /\}\)\.strict\(\)\s*\.refine/);
  assert.match(code, /Buffer\.byteLength\(serialized, 'utf8'\) > 32_768/);
  assert.match(receipt, /assertPayrollReceiptArithmetic\(input\)/);
  assert.doesNotMatch(code, /const context = \(req: any\)/);
});
