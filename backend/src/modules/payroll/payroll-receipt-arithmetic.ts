import { compare, add, ZERO, type DecimalInput } from '../../shared/financial/decimal.js';

/** Canonical receipts must balance, regardless of optional parafiscal previews.
 * Worker deductions reduce net; employer contributions NEVER reduce worker net. */
export function assertPayrollReceiptArithmetic(input: Readonly<{
  gross: DecimalInput; deductions: DecimalInput; net: DecimalInput;
}>) {
  if (!input || compare(input.gross, ZERO) < 0 || compare(input.deductions, ZERO) < 0 ||
      compare(input.net, ZERO) < 0 || compare(input.gross, add(input.deductions, input.net)) !== 0) {
    throw new Error('PAYROLL_RECEIPT_NOT_BALANCED');
  }
  return Object.freeze({ balanced: true as const });
}
